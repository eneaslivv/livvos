-- ============================================================================
-- 2026-07-13 — Collaborator role + assignment-scoped RLS + tenant_members fix
--
-- Goal: a team member invited WITHOUT projects:view_all sees ONLY:
--   · tasks assigned to them (assignee_id / assigned_to / assignee_ids / owner)
--   · projects where they are in project_members (auto-added on task assign)
--   · clients of those projects (read-only, so project cards render)
--   · their own calendar events
--   NO finance (incomes/expenses/installments/budgets/proposals), no leads,
--   no documents, no tenant-wide activity feed.
--
-- Everyone already in the system keeps full access: all current team users
-- hold admin/owner roles, which have projects:view_all (and has_permission()
-- returns true for the active tenant's owner regardless of role).
--
-- Also fixes:
--   · invite flow never created tenant_members rows (members panel +
--     list_calendar_tasks_for_tenant membership check broke for invitees)
--   · "View Leads Policy" leaked leads across tenants (no tenant check)
--   · list_calendar_tasks_for_tenant (SECURITY DEFINER) bypassed RLS
--   · profiles.last_seen_at for real "last active" in Team
--
-- Apply live via Supabase MCP apply_migration (CLI auth is broken).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Collaborator role + permission seeds
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO roles (name, description, is_system)
SELECT 'collaborator', 'Assigned work only — sees own tasks and member projects; no finance', true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'collaborator');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON (p.module = 'auth'     AND p.action = 'access')
  OR (p.module = 'system'   AND p.action = 'access')
  OR (p.module = 'calendar' AND p.action IN ('view','create','edit'))
  OR (p.module = 'projects' AND p.action = 'view')
WHERE r.name = 'collaborator'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- manager/viewer/finance keep "sees whole tenant" semantics under the new
-- policies (nobody holds these roles today, but keep them coherent).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.module = 'projects' AND p.action = 'view_all'
WHERE r.name IN ('manager','viewer','finance')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. tenant_members on invite accept (trigger + RPC) + backfill
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv_id UUID; v_inv_tenant_id UUID; v_inv_role_id UUID; v_inv_client_id UUID;
  v_inv_type TEXT; v_role_name TEXT;
  v_tenant_id UUID; v_name TEXT; v_slug TEXT;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  -- Look for a pending team/client invitation matching the new user's email.
  SELECT i.id, i.tenant_id, i.role_id, i.client_id, COALESCE(i.type, 'team')
    INTO v_inv_id, v_inv_tenant_id, v_inv_role_id, v_inv_client_id, v_inv_type
  FROM public.invitations i
  WHERE i.email = NEW.email AND i.status = 'pending'
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_inv_id IS NOT NULL THEN
    v_tenant_id := v_inv_tenant_id;
  ELSE
    -- Self-signup path: provision a brand-new tenant for this user.
    v_slug := regexp_replace(lower(COALESCE(v_name, 'tenant')), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    IF v_slug = '' THEN v_slug := 'tenant'; END IF;
    v_slug := v_slug || '-' || substring(gen_random_uuid()::text, 1, 8);
    INSERT INTO public.tenants (name, slug, owner_id, status, created_at, updated_at)
    VALUES (COALESCE(v_name, 'My Workspace'), v_slug, NEW.id, 'active', now(), now())
    RETURNING id INTO v_tenant_id;
  END IF;

  -- Stale-profile cleanup (orphan from a prior signup attempt).
  DELETE FROM public.profiles WHERE email = NEW.email AND id != NEW.id;

  INSERT INTO public.profiles (id, email, name, status, tenant_id)
  VALUES (NEW.id, NEW.email, COALESCE(v_name, 'User'), 'active', v_tenant_id)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    tenant_id = COALESCE(EXCLUDED.tenant_id, profiles.tenant_id);

  IF v_inv_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_inv_role_id)
    ON CONFLICT DO NOTHING;

    -- Team invites become tenant members; client-portal invites do NOT.
    IF v_inv_type = 'team' THEN
      SELECT r.name INTO v_role_name FROM public.roles r WHERE r.id = v_inv_role_id;
      INSERT INTO public.tenant_members (user_id, tenant_id, role, source)
      VALUES (NEW.id, v_inv_tenant_id, COALESCE(v_role_name, 'member'), 'invite')
      ON CONFLICT (user_id, tenant_id) DO NOTHING;
    END IF;

    IF v_inv_client_id IS NOT NULL THEN
      UPDATE public.clients SET auth_user_id = NEW.id WHERE id = v_inv_client_id;
    END IF;
    UPDATE public.invitations SET status = 'accepted', updated_at = now()
    WHERE id = v_inv_id;
  ELSE
    -- Self-signup users own their tenant; membership row keeps tenant_members
    -- the single source of truth. (Still no global 'owner' user_role — that
    -- role is checked by is_admin() with no tenant scoping.)
    INSERT INTO public.tenant_members (user_id, tenant_id, role, source)
    VALUES (NEW.id, v_tenant_id, 'owner', 'signup')
    ON CONFLICT (user_id, tenant_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv invitations%ROWTYPE;
  v_caller_email TEXT;
  v_role_name TEXT;
BEGIN
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT * INTO v_inv FROM invitations WHERE token = p_token AND status = 'pending';
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invitation not found or already used');
  END IF;

  IF v_inv.email != v_caller_email THEN
    RETURN jsonb_build_object('error', 'This invitation is for a different email address');
  END IF;

  UPDATE profiles SET tenant_id = v_inv.tenant_id WHERE id = auth.uid();

  INSERT INTO user_roles (user_id, role_id)
  VALUES (auth.uid(), v_inv.role_id)
  ON CONFLICT DO NOTHING;

  IF COALESCE(v_inv.type, 'team') = 'team' THEN
    SELECT r.name INTO v_role_name FROM roles r WHERE r.id = v_inv.role_id;
    INSERT INTO tenant_members (user_id, tenant_id, role, source)
    VALUES (auth.uid(), v_inv.tenant_id, COALESCE(v_role_name, 'member'), 'invite')
    ON CONFLICT (user_id, tenant_id) DO NOTHING;
  END IF;

  IF v_inv.client_id IS NOT NULL THEN
    UPDATE clients SET auth_user_id = auth.uid() WHERE id = v_inv.client_id;
  END IF;

  UPDATE invitations SET status = 'accepted', updated_at = now() WHERE id = v_inv.id;

  RETURN jsonb_build_object('success', true, 'tenant_id', v_inv.tenant_id, 'type', v_inv.type);
END;
$$;

-- Backfill memberships for existing staff profiles (portal clients excluded).
INSERT INTO tenant_members (user_id, tenant_id, role, source)
SELECT p.id, p.tenant_id,
       CASE WHEN t.owner_id = p.id THEN 'owner'
            ELSE COALESCE((
              SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = p.id AND r.name NOT IN ('client','client_collaborator')
              ORDER BY CASE r.name WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
              LIMIT 1
            ), 'member') END,
       'backfill'
FROM profiles p
JOIN tenants t ON t.id = p.tenant_id
WHERE p.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM clients c WHERE c.auth_user_id = p.id AND c.tenant_id = p.tenant_id
  )
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Scoped RLS — tasks / projects / clients
--    "Full tenant read" now requires projects:view_all (admin/owner/manager/
--    viewer/finance). Everyone else falls back to assignment-based clauses.
--
--    IMPORTANT: membership checks use SECURITY DEFINER helpers, NOT raw
--    EXISTS subqueries on project_members. The old project_members_select
--    policy references projects, so a raw subquery here creates a
--    projects <-> project_members policy cycle = 42P17 infinite recursion.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_member_of_client_project(p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN project_members pm ON pm.project_id = p.id
    WHERE p.client_id = p_client_id AND pm.user_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS tasks_select_policy ON tasks;
CREATE POLICY tasks_select_policy ON tasks FOR SELECT USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR assignee_id = auth.uid()
  OR owner_id = auth.uid()
  OR assigned_to = auth.uid()
  OR (assignee_ids IS NOT NULL AND auth.uid() = ANY (assignee_ids))
  OR (project_id IS NOT NULL AND is_project_member(project_id))
  OR EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = tasks.client_id AND c.auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS tasks_update_policy ON tasks;
CREATE POLICY tasks_update_policy ON tasks FOR UPDATE USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR assignee_id = auth.uid()
  OR owner_id = auth.uid()
  OR assigned_to = auth.uid()
  OR (assignee_ids IS NOT NULL AND auth.uid() = ANY (assignee_ids))
  OR (project_id IS NOT NULL AND is_project_member(project_id))
);

DROP POLICY IF EXISTS tasks_delete_policy ON tasks;
CREATE POLICY tasks_delete_policy ON tasks FOR DELETE USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
);

-- Restricted users only see cross-agency shared tasks if they have view_all.
DROP POLICY IF EXISTS tasks_shared_project_select ON tasks;
CREATE POLICY tasks_shared_project_select ON tasks FOR SELECT USING (
  project_id IS NOT NULL AND shared_with_partner = true
  AND has_permission('projects','view_all')
  AND EXISTS (
    SELECT 1 FROM project_agency_shares pas
    WHERE pas.project_id = tasks.project_id
      AND pas.shared_with_tenant_id IN (
        SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS projects_select_policy ON projects;
CREATE POLICY projects_select_policy ON projects FOR SELECT USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
  OR is_project_member(id)
);

DROP POLICY IF EXISTS projects_update_policy ON projects;
CREATE POLICY projects_update_policy ON projects FOR UPDATE USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS projects_delete_policy ON projects;
CREATE POLICY projects_delete_policy ON projects FOR DELETE USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS projects_shared_with_my_tenant_select ON projects;
CREATE POLICY projects_shared_with_my_tenant_select ON projects FOR SELECT USING (
  has_permission('projects','view_all')
  AND EXISTS (
    SELECT 1 FROM project_agency_shares pas
    WHERE pas.project_id = projects.id
      AND pas.shared_with_tenant_id IN (
        SELECT tenant_members.tenant_id FROM tenant_members
        WHERE tenant_members.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS clients_select_policy ON clients;
CREATE POLICY clients_select_policy ON clients FOR SELECT USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
  OR auth_user_id = auth.uid()          -- portal clients read their own row
  OR is_member_of_client_project(id)    -- collaborators see clients of their projects
);

DROP POLICY IF EXISTS clients_insert_policy ON clients;
CREATE POLICY clients_insert_policy ON clients FOR INSERT WITH CHECK (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS clients_update_policy ON clients;
CREATE POLICY clients_update_policy ON clients FOR UPDATE USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS clients_delete_policy ON clients;
CREATE POLICY clients_delete_policy ON clients FOR DELETE USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Finance tables now require finance permissions (collaborator has none)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS incomes_select_policy ON incomes;
CREATE POLICY incomes_select_policy ON incomes FOR SELECT USING (
  can_access_tenant(tenant_id) AND has_permission('finance','view'));
DROP POLICY IF EXISTS incomes_insert_policy ON incomes;
CREATE POLICY incomes_insert_policy ON incomes FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id) AND has_permission('finance','create'));
DROP POLICY IF EXISTS incomes_update_policy ON incomes;
CREATE POLICY incomes_update_policy ON incomes FOR UPDATE USING (
  can_access_tenant(tenant_id) AND has_permission('finance','edit'));
DROP POLICY IF EXISTS incomes_delete_policy ON incomes;
CREATE POLICY incomes_delete_policy ON incomes FOR DELETE USING (
  can_access_tenant(tenant_id) AND has_permission('finance','delete'));

DROP POLICY IF EXISTS incomes_shared_project_select ON incomes;
CREATE POLICY incomes_shared_project_select ON incomes FOR SELECT USING (
  project_id IS NOT NULL AND has_permission('finance','view')
  AND EXISTS (
    SELECT 1 FROM project_agency_shares pas
    WHERE pas.project_id = incomes.project_id
      AND pas.shared_with_tenant_id IN (
        SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS expenses_select_policy ON expenses;
CREATE POLICY expenses_select_policy ON expenses FOR SELECT USING (
  can_access_tenant(tenant_id) AND has_permission('finance','view'));
DROP POLICY IF EXISTS expenses_insert_policy ON expenses;
CREATE POLICY expenses_insert_policy ON expenses FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id) AND has_permission('finance','create'));
DROP POLICY IF EXISTS expenses_update_policy ON expenses;
CREATE POLICY expenses_update_policy ON expenses FOR UPDATE USING (
  can_access_tenant(tenant_id) AND has_permission('finance','edit'));
DROP POLICY IF EXISTS expenses_delete_policy ON expenses;
CREATE POLICY expenses_delete_policy ON expenses FOR DELETE USING (
  can_access_tenant(tenant_id) AND has_permission('finance','delete'));

DROP POLICY IF EXISTS expenses_shared_project_select ON expenses;
CREATE POLICY expenses_shared_project_select ON expenses FOR SELECT USING (
  project_id IS NOT NULL AND has_permission('finance','view')
  AND EXISTS (
    SELECT 1 FROM project_agency_shares pas
    WHERE pas.project_id = expenses.project_id
      AND pas.shared_with_tenant_id IN (
        SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS installments_select_policy ON installments;
CREATE POLICY installments_select_policy ON installments FOR SELECT USING (
  has_permission('finance','view') AND EXISTS (
    SELECT 1 FROM incomes WHERE incomes.id = installments.income_id
      AND can_access_tenant(incomes.tenant_id)));
DROP POLICY IF EXISTS installments_insert_policy ON installments;
CREATE POLICY installments_insert_policy ON installments FOR INSERT WITH CHECK (
  has_permission('finance','create') AND EXISTS (
    SELECT 1 FROM incomes WHERE incomes.id = installments.income_id
      AND can_access_tenant(incomes.tenant_id)));
DROP POLICY IF EXISTS installments_update_policy ON installments;
CREATE POLICY installments_update_policy ON installments FOR UPDATE USING (
  has_permission('finance','edit') AND EXISTS (
    SELECT 1 FROM incomes WHERE incomes.id = installments.income_id
      AND can_access_tenant(incomes.tenant_id)));
DROP POLICY IF EXISTS installments_delete_policy ON installments;
CREATE POLICY installments_delete_policy ON installments FOR DELETE USING (
  has_permission('finance','delete') AND EXISTS (
    SELECT 1 FROM incomes WHERE incomes.id = installments.income_id
      AND can_access_tenant(incomes.tenant_id)));

DROP POLICY IF EXISTS budgets_select_policy ON budgets;
CREATE POLICY budgets_select_policy ON budgets FOR SELECT USING (
  can_access_tenant(tenant_id) AND has_permission('finance','view'));
DROP POLICY IF EXISTS budgets_insert_policy ON budgets;
CREATE POLICY budgets_insert_policy ON budgets FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id) AND has_permission('finance','create'));
DROP POLICY IF EXISTS budgets_update_policy ON budgets;
CREATE POLICY budgets_update_policy ON budgets FOR UPDATE USING (
  can_access_tenant(tenant_id) AND has_permission('finance','edit'));
DROP POLICY IF EXISTS budgets_delete_policy ON budgets;
CREATE POLICY budgets_delete_policy ON budgets FOR DELETE USING (
  can_access_tenant(tenant_id) AND has_permission('finance','delete'));

DROP POLICY IF EXISTS proposals_select ON proposals;
CREATE POLICY proposals_select ON proposals FOR SELECT USING (
  can_access_tenant(tenant_id)
  AND (has_permission('finance','view') OR has_permission('sales','view_dashboard')));
DROP POLICY IF EXISTS proposals_modify ON proposals;
CREATE POLICY proposals_modify ON proposals FOR ALL USING (
  can_access_tenant(tenant_id)
  AND (has_permission('finance','edit') OR has_permission('sales','edit')))
WITH CHECK (
  can_access_tenant(tenant_id)
  AND (has_permission('finance','edit') OR has_permission('sales','edit')));

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Leads: kill the tenant-less global policy, require sales perms
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "View Leads Policy" ON leads;   -- had NO tenant check: cross-tenant leak
DROP POLICY IF EXISTS leads_select_policy ON leads;
CREATE POLICY leads_select_policy ON leads FOR SELECT USING (
  can_access_tenant(tenant_id) AND has_permission('sales','view_leads'));
DROP POLICY IF EXISTS leads_update_policy ON leads;
CREATE POLICY leads_update_policy ON leads FOR UPDATE USING (
  can_access_tenant(tenant_id) AND has_permission('sales','edit'));
DROP POLICY IF EXISTS leads_delete_policy ON leads;
CREATE POLICY leads_delete_policy ON leads FOR DELETE USING (
  can_access_tenant(tenant_id) AND has_permission('sales','delete'));
-- leads_*_own and leads_insert_policy stay as-is.

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Calendar events: own events or member projects unless view_all
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS calendar_events_select_policy ON calendar_events;
CREATE POLICY calendar_events_select_policy ON calendar_events FOR SELECT USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
  OR (project_id IS NOT NULL AND is_project_member(project_id))
);
DROP POLICY IF EXISTS calendar_events_update_policy ON calendar_events;
CREATE POLICY calendar_events_update_policy ON calendar_events FOR UPDATE USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
);
DROP POLICY IF EXISTS calendar_events_delete_policy ON calendar_events;
CREATE POLICY calendar_events_delete_policy ON calendar_events FOR DELETE USING (
  (can_access_tenant(tenant_id) AND has_permission('projects','view_all'))
  OR owner_id = auth.uid()
);
-- calendar_events_insert_policy stays (members may create their own events).

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Documents + activity feed require their module permissions
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS documents_select ON documents;
CREATE POLICY documents_select ON documents FOR SELECT USING (
  can_access_tenant(tenant_id) AND has_permission('documents','view'));
DROP POLICY IF EXISTS documents_insert ON documents;
CREATE POLICY documents_insert ON documents FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id)
  AND (has_permission('documents','create') OR has_permission('documents','upload')));
DROP POLICY IF EXISTS documents_update ON documents;
CREATE POLICY documents_update ON documents FOR UPDATE USING (
  can_access_tenant(tenant_id) AND has_permission('documents','edit'));
DROP POLICY IF EXISTS documents_delete ON documents;
CREATE POLICY documents_delete ON documents FOR DELETE USING (
  can_access_tenant(tenant_id) AND has_permission('documents','delete'));

DROP POLICY IF EXISTS documents_shared_project_select ON documents;
CREATE POLICY documents_shared_project_select ON documents FOR SELECT USING (
  project_id IS NOT NULL AND has_permission('documents','view')
  AND EXISTS (
    SELECT 1 FROM project_agency_shares pas
    WHERE pas.project_id = documents.project_id
      AND pas.shared_with_tenant_id IN (
        SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS activity_logs_select_policy ON activity_logs;
CREATE POLICY activity_logs_select_policy ON activity_logs FOR SELECT USING (
  (tenant_id IS NOT NULL AND can_access_tenant(tenant_id) AND has_permission('activity','view'))
  OR user_id = auth.uid()
);
DROP POLICY IF EXISTS "Users can update own logs" ON activity_logs;  -- redundant with policy below
DROP POLICY IF EXISTS activity_logs_update_policy ON activity_logs;
CREATE POLICY activity_logs_update_policy ON activity_logs FOR UPDATE USING (
  (can_access_tenant(tenant_id) AND has_permission('activity','view'))
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS activities_tenant_select ON activities;
CREATE POLICY activities_tenant_select ON activities FOR SELECT USING (
  can_access_tenant(tenant_id) AND has_permission('activity','view'));
DROP POLICY IF EXISTS activities_tenant_update ON activities;
CREATE POLICY activities_tenant_update ON activities FOR UPDATE USING (
  can_access_tenant(tenant_id) AND has_permission('activity','view'));
DROP POLICY IF EXISTS activities_tenant_delete ON activities;
CREATE POLICY activities_tenant_delete ON activities FOR DELETE USING (
  can_access_tenant(tenant_id) AND has_permission('activity','view'));

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Calendar RPC (SECURITY DEFINER bypasses RLS) — scope for restricted users
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_calendar_tasks_for_tenant(p_tenant_id uuid)
RETURNS TABLE(id uuid, tenant_id uuid, owner_id uuid, assigned_to uuid, assignee_ids uuid[], title text, description text, description_html text, attachments jsonb, cover_url text, completed boolean, priority text, start_date date, end_date date, due_date date, start_time text, duration integer, status text, client_id uuid, project_id uuid, order_index integer, parent_task_id uuid, blocked_by uuid, document_id uuid, group_name text, created_at timestamp with time zone, updated_at timestamp with time zone, completed_at timestamp with time zone, started_at timestamp with time zone, mirror_pair_id uuid, mirror_origin_tenant_id uuid, shared_with_partner boolean, shared_from_tenant_id uuid, shared_from_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_full BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Not a member of the given tenant';
  END IF;

  -- Members without projects:view_all only get tasks assigned to them,
  -- owned by them, or in projects they belong to.
  v_full := has_permission('projects', 'view_all');

  RETURN QUERY
  SELECT
    t.id, t.tenant_id, t.owner_id, t.assigned_to, t.assignee_ids,
    t.title, t.description, t.description_html, t.attachments, t.cover_url,
    t.completed, t.priority, t.start_date, t.end_date, t.due_date::DATE,
    t.start_time, t.duration, t.status, t.client_id, t.project_id,
    t.order_index, t.parent_task_id, t.blocked_by, t.document_id, t.group_name,
    t.created_at, t.updated_at, t.completed_at, t.started_at,
    t.mirror_pair_id, t.mirror_origin_tenant_id,
    t.shared_with_partner,
    NULL::UUID, NULL::TEXT
  FROM tasks t
  WHERE t.tenant_id = p_tenant_id
    AND (v_full
         OR t.assignee_id = v_caller
         OR t.owner_id = v_caller
         OR t.assigned_to = v_caller
         OR (t.assignee_ids IS NOT NULL AND v_caller = ANY (t.assignee_ids))
         OR (t.project_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM project_members pm
               WHERE pm.project_id = t.project_id AND pm.user_id = v_caller)))

  UNION ALL

  SELECT
    t.id, t.tenant_id, t.owner_id, t.assigned_to, t.assignee_ids,
    t.title, t.description, t.description_html, t.attachments, t.cover_url,
    t.completed, t.priority, t.start_date, t.end_date, t.due_date::DATE,
    t.start_time, t.duration, t.status, t.client_id, t.project_id,
    t.order_index, t.parent_task_id, t.blocked_by, t.document_id, t.group_name,
    t.created_at, t.updated_at, t.completed_at, t.started_at,
    t.mirror_pair_id, t.mirror_origin_tenant_id,
    t.shared_with_partner,
    t.tenant_id, te.name
  FROM tasks t
  JOIN project_agency_shares pas
    ON pas.project_id = t.project_id
   AND pas.shared_with_tenant_id = p_tenant_id
  JOIN tenants te ON te.id = t.tenant_id
  WHERE t.tenant_id <> p_tenant_id
    AND t.shared_with_partner = TRUE
    AND (v_full
         OR t.assignee_id = v_caller
         OR t.assigned_to = v_caller
         OR (t.assignee_ids IS NOT NULL AND v_caller = ANY (t.assignee_ids)));
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Auto project-membership: assigning a task adds the assignee to the
--    project, so "le paso una tarea del proyecto" = "ve ese proyecto".
--
--    Pre-existing bug fixed first: notify_on_project_invite() referenced
--    NEW.member_id but project_members has user_id — EVERY insert into
--    project_members raised 42703 (that's why the table stayed empty).
--    Notification failures must never block a membership insert.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_project_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_project_title TEXT;
BEGIN
  BEGIN
    SELECT title INTO v_project_title FROM projects WHERE id = NEW.project_id;
    PERFORM create_notification(
      NEW.user_id,
      'project',
      'Project Invitation',
      'You have been added to project: ' || COALESCE(v_project_title, 'Unknown'),
      '/projects',
      jsonb_build_object('project_id', NEW.project_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- never let a notification failure abort the membership insert
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_project_member_from_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;
  FOR v_uid IN
    SELECT DISTINCT u FROM unnest(
      array_remove(ARRAY[NEW.assignee_id, NEW.assigned_to] || COALESCE(NEW.assignee_ids, '{}'::uuid[]), NULL)
    ) AS u
  LOOP
    IF EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = v_uid) THEN
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (NEW.project_id, v_uid, 'member')
      ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_sync_project_member ON tasks;
CREATE TRIGGER tasks_sync_project_member
AFTER INSERT OR UPDATE OF assignee_id, assigned_to, assignee_ids ON tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_project_member_from_task();

-- Backfill memberships from existing assignments.
INSERT INTO project_members (project_id, user_id, role)
SELECT DISTINCT t.project_id, u.uid, 'member'
FROM tasks t
CROSS JOIN LATERAL unnest(
  array_remove(ARRAY[t.assignee_id, t.assigned_to] || COALESCE(t.assignee_ids, '{}'::uuid[]), NULL)
) AS u(uid)
JOIN profiles pr ON pr.id = u.uid
WHERE t.project_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. Real "last active": profiles.last_seen_at + surface in get_tenant_members
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

DROP FUNCTION IF EXISTS public.get_tenant_members(uuid);
CREATE FUNCTION public.get_tenant_members(p_tenant_id uuid)
RETURNS TABLE(id uuid, email text, name text, avatar_url text, status text, member_role text, source text, last_seen_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM tenant_members tm
        WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid()
      )
     AND NOT EXISTS (
        SELECT 1 FROM tenants t
        WHERE t.id = p_tenant_id AND t.owner_id = auth.uid()
      )
  THEN
    RAISE EXCEPTION 'Not authorized to view members of this tenant';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.email,
         p.name,
         p.avatar_url,
         COALESCE(p.status, 'active')                                    AS status,
         COALESCE(tm.role, CASE WHEN t.owner_id = p.id THEN 'owner' END) AS member_role,
         tm.source,
         p.last_seen_at
  FROM profiles p
  JOIN tenants t ON t.id = p_tenant_id
  LEFT JOIN LATERAL (
        SELECT m.role, m.source
        FROM tenant_members m
        WHERE m.tenant_id = p_tenant_id AND m.user_id = p.id
        LIMIT 1
  ) tm ON true
  WHERE EXISTS (
          SELECT 1 FROM tenant_members m2
          WHERE m2.tenant_id = p_tenant_id AND m2.user_id = p.id
        )
     OR t.owner_id = p.id;
END;
$$;

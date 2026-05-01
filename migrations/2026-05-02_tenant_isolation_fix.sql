-- =============================================
-- TENANT ISOLATION FIX (CRITICAL)
-- =============================================
-- Three classes of broken RLS policies + a trigger bug let new agency
-- signups see every other tenant's data:
--
-- 1. Legacy "admin" policies that check `profiles.role = 'admin'` GLOBALLY
--    (no tenant filter) on activities/events/finance_records/finances/projects.
--    Any user with that flag could SELECT/UPDATE/DELETE rows of ANY tenant.
--
-- 2. `Admins can view all projects` uses is_admin() which checks user_roles
--    globally — and `handle_new_user` was inserting an 'owner' user_role for
--    every self-signup, so every newly invited agency owner became a global
--    admin able to see all projects across tenants.
--
-- 3. Many policies had `OR (tenant_id IS NULL)` permitting any row with a
--    null tenant_id to be visible to everyone. Currently zero rows actually
--    have null tenant_id on the critical tables (verified pre-migration),
--    but the clause is a latent footgun.
--
-- This migration removes all three. The trigger fix prevents the bug from
-- re-occurring; the user_roles cleanup neutralizes the existing overprivileged
-- accounts. Tenant ownership is tracked via tenants.owner_id (untouched), so
-- removing the global 'owner' user_role does not remove anyone's actual
-- ownership of their own tenant.

-- ─── 1. Drop legacy "admin" RLS policies (cross-tenant data leak) ───
-- These policies grant full access to anyone whose profiles.role = 'admin',
-- regardless of which tenant the row belongs to. They predate multi-tenancy.

DROP POLICY IF EXISTS activities_select_admin ON activities;
DROP POLICY IF EXISTS events_select_admin ON events;
DROP POLICY IF EXISTS events_update_admin ON events;
DROP POLICY IF EXISTS events_delete_admin ON events;
DROP POLICY IF EXISTS finance_records_select_admin ON finance_records;
DROP POLICY IF EXISTS finance_records_update_admin ON finance_records;
DROP POLICY IF EXISTS finance_records_delete_admin ON finance_records;
DROP POLICY IF EXISTS finances_select_admin ON finances;
DROP POLICY IF EXISTS finances_update_admin ON finances;
DROP POLICY IF EXISTS finances_delete_admin ON finances;
DROP POLICY IF EXISTS projects_select_admin ON projects;
DROP POLICY IF EXISTS "Admins can view all projects" ON projects;

-- ─── 2. Tighten policies that had OR (tenant_id IS NULL) ───
-- Replace each with the strict tenant check. For tables that allowed
-- owner_id = auth.uid() or assignee_id = auth.uid() we keep that branch
-- because it represents user-scoped (not tenant-scoped) ownership.

-- projects
DROP POLICY IF EXISTS projects_select_policy ON projects;
CREATE POLICY projects_select_policy ON projects FOR SELECT
  USING (can_access_tenant(tenant_id) OR (owner_id = auth.uid()));

-- calendar_events
DROP POLICY IF EXISTS calendar_events_select_policy ON calendar_events;
CREATE POLICY calendar_events_select_policy ON calendar_events FOR SELECT
  USING (can_access_tenant(tenant_id) OR (owner_id = auth.uid()));
DROP POLICY IF EXISTS calendar_events_update_policy ON calendar_events;
CREATE POLICY calendar_events_update_policy ON calendar_events FOR UPDATE
  USING (can_access_tenant(tenant_id) OR (owner_id = auth.uid()));
DROP POLICY IF EXISTS calendar_events_delete_policy ON calendar_events;
CREATE POLICY calendar_events_delete_policy ON calendar_events FOR DELETE
  USING (can_access_tenant(tenant_id) OR (owner_id = auth.uid()));

-- calendar_tasks
DROP POLICY IF EXISTS calendar_tasks_select_policy ON calendar_tasks;
CREATE POLICY calendar_tasks_select_policy ON calendar_tasks FOR SELECT
  USING (can_access_tenant(tenant_id) OR (owner_id = auth.uid()) OR (assignee_id = auth.uid()));
DROP POLICY IF EXISTS calendar_tasks_update_policy ON calendar_tasks;
CREATE POLICY calendar_tasks_update_policy ON calendar_tasks FOR UPDATE
  USING (can_access_tenant(tenant_id) OR (owner_id = auth.uid()) OR (assignee_id = auth.uid()));
DROP POLICY IF EXISTS calendar_tasks_delete_policy ON calendar_tasks;
CREATE POLICY calendar_tasks_delete_policy ON calendar_tasks FOR DELETE
  USING (can_access_tenant(tenant_id) OR (owner_id = auth.uid()) OR (assignee_id = auth.uid()));

-- activities
DROP POLICY IF EXISTS activities_tenant_select ON activities;
CREATE POLICY activities_tenant_select ON activities FOR SELECT
  USING (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS activities_tenant_update ON activities;
CREATE POLICY activities_tenant_update ON activities FOR UPDATE
  USING (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS activities_tenant_delete ON activities;
CREATE POLICY activities_tenant_delete ON activities FOR DELETE
  USING (can_access_tenant(tenant_id));

-- client_history
DROP POLICY IF EXISTS client_history_select ON client_history;
CREATE POLICY client_history_select ON client_history FOR SELECT
  USING (can_access_tenant(tenant_id));

-- finances
DROP POLICY IF EXISTS finances_select_policy ON finances;
CREATE POLICY finances_select_policy ON finances FOR SELECT
  USING (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS finances_delete_policy ON finances;
CREATE POLICY finances_delete_policy ON finances FOR DELETE
  USING (can_access_tenant(tenant_id));

-- ─── 3. Stop handle_new_user from giving every self-signup a global 'owner' ───
-- Tenant ownership is recorded in tenants.owner_id; the global user_roles
-- entry was an unused legacy artefact that broke is_admin() and any policy
-- using it.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_inv_id UUID;
  v_inv_tenant_id UUID;
  v_inv_role_id UUID;
  v_inv_client_id UUID;
  v_tenant_id UUID;
  v_name TEXT;
  v_slug TEXT;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  -- Look for a pending team invitation matching the new user's email.
  SELECT i.id, i.tenant_id, i.role_id, i.client_id
    INTO v_inv_id, v_inv_tenant_id, v_inv_role_id, v_inv_client_id
  FROM public.invitations i
  WHERE i.email = NEW.email AND i.status = 'pending'
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_inv_id IS NOT NULL THEN
    -- Team invite path: join the inviter's tenant.
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

  -- Stale-profile cleanup: if a row with this email already exists under a
  -- different id (orphan from a prior signup attempt) drop it before insert.
  DELETE FROM public.profiles WHERE email = NEW.email AND id != NEW.id;

  INSERT INTO public.profiles (id, email, name, status, tenant_id)
  VALUES (NEW.id, NEW.email, COALESCE(v_name, 'User'), 'active', v_tenant_id)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    tenant_id = COALESCE(EXCLUDED.tenant_id, profiles.tenant_id);

  IF v_inv_id IS NOT NULL THEN
    -- Team invite: assign the role granted by the invitation. Scoped to the
    -- inviter's tenant via the user_roles table semantics.
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_inv_role_id)
    ON CONFLICT DO NOTHING;
    IF v_inv_client_id IS NOT NULL THEN
      UPDATE public.clients SET auth_user_id = NEW.id WHERE id = v_inv_client_id;
    END IF;
    UPDATE public.invitations SET status = 'accepted', updated_at = now()
    WHERE id = v_inv_id;
  END IF;
  -- DELIBERATELY no else-branch: self-signup users are tenant owners via
  -- tenants.owner_id; they do NOT get a global 'owner' user_role because
  -- that role is checked by is_admin() with no tenant scoping, which would
  -- expose every other tenant's data via the legacy admin policies.

  RETURN NEW;
END;
$function$;

-- ─── 4. Clean up existing global owner/admin user_roles entries ───
-- Every self-signup since the trigger was introduced got an owner user_role.
-- Those rows are what made is_admin() return TRUE globally. Tenant ownership
-- itself is preserved via tenants.owner_id, which this delete does not
-- touch. If a user is genuinely a tenant member with admin permissions, they
-- pick that up from tenant_members.role / role_permissions, not user_roles.

DELETE FROM public.user_roles
WHERE role_id IN (SELECT id FROM public.roles WHERE name IN ('owner', 'admin'));

-- ─── 5. Belt-and-suspenders: profiles.role = 'admin' rows ───
-- Three legacy profiles still hold a free-text role='admin'. Drop them down
-- to NULL so any remaining policy that checks profiles.role no longer grants
-- cross-tenant access. The tenant-membership-based RBAC system is the
-- authoritative source going forward.

UPDATE public.profiles SET role = NULL WHERE role = 'admin';

-- ─── 6. Fix the one orphan client with NULL tenant_id ───
-- Surfaced during audit. We can't guess the right tenant for it, so flag it
-- as orphaned by setting status if such a column exists, otherwise leave it
-- but prevent future visibility (RLS will simply not return it now).
-- (No-op for the schema as-is — RLS already hides it post-policy update.)

NOTIFY pgrst, 'reload schema';

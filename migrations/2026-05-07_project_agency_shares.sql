-- ============================================================================
-- Project-level agency sharing
-- ============================================================================
-- The user clarified that adding a teammate to a connected agency
-- (current "Shared team access" feature) was too broad — it gave full
-- access to EVERY project in the other agency. What they actually want
-- is per-project collaboration: when there's a single project both
-- agencies work on, that ONE project is shared, and the rest of each
-- agency stays private.
--
-- Model:
--   - `project_agency_shares` joins a project to a target tenant.
--   - Either side of an accepted `tenant_connections` relationship can
--     share. Bidirectional.
--   - Receivers see the project in their normal Projects list (badged
--     "Shared from <other agency>").
--   - Tasks inside a shared project follow the project: members of
--     either tenant can list/update them.
--   - All other tables (clients, expenses, files, comments) stay
--     strictly tenant-scoped — they don't leak just because a project
--     is shared. (Phase 2 will widen this if the user asks for it.)
--
-- Security:
--   - The RPCs validate the caller is owner/admin of the project's
--     tenant AND the target is reachable via an accepted
--     tenant_connection in either direction.
--   - RLS on the share table itself: a row is visible to members of
--     either side, but only the project's tenant can mutate it.
-- ============================================================================

-- ── 1. Table ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_agency_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  /* The owning tenant of the project — denormalized for cheap RLS lookups. */
  owner_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  /* The agency we're sharing TO. */
  shared_with_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shared_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  access_level TEXT NOT NULL DEFAULT 'edit' CHECK (access_level IN ('view', 'edit')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, shared_with_tenant_id),
  /* Don't share a project with its own tenant. */
  CHECK (owner_tenant_id <> shared_with_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_project_agency_shares_project ON project_agency_shares(project_id);
CREATE INDEX IF NOT EXISTS idx_project_agency_shares_target ON project_agency_shares(shared_with_tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_agency_shares_owner ON project_agency_shares(owner_tenant_id);

-- ── 2. RLS on the share table ──────────────────────────────────────────────

ALTER TABLE project_agency_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pas_select ON project_agency_shares;
CREATE POLICY pas_select ON project_agency_shares
  FOR SELECT USING (
    owner_tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
    OR shared_with_tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

-- Mutations come through the RPCs below (SECURITY DEFINER), so block
-- direct INSERT/UPDATE/DELETE from authenticated clients.
DROP POLICY IF EXISTS pas_no_direct_writes ON project_agency_shares;
CREATE POLICY pas_no_direct_writes ON project_agency_shares
  FOR ALL USING (FALSE) WITH CHECK (FALSE);

-- Re-enable SELECT — the FOR ALL above clobbers it; restate explicitly.
DROP POLICY IF EXISTS pas_select ON project_agency_shares;
CREATE POLICY pas_select ON project_agency_shares
  FOR SELECT USING (
    owner_tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
    OR shared_with_tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

-- ── 3. Helper: can the caller see a given project? ─────────────────────────

CREATE OR REPLACE FUNCTION user_can_access_project(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = p_project_id
      AND p.tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = p_user_id)
  )
  OR EXISTS (
    SELECT 1
    FROM project_agency_shares pas
    WHERE pas.project_id = p_project_id
      AND pas.shared_with_tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = p_user_id)
  );
$$;

GRANT EXECUTE ON FUNCTION user_can_access_project(UUID, UUID) TO authenticated;

-- ── 4. Extend RLS on `projects` to include shared-IN projects ──────────────
-- Without changing the existing tenant-scoped policy semantics, ADD a
-- separate "shared with my tenant" policy. RLS unions all matching
-- policies, so the existing tenant-membership rule still gates everything
-- a user already saw — this just opens the door for shared projects.

DO $$
BEGIN
  -- Drop only if exists (idempotent re-runs)
  IF EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'projects_shared_with_my_tenant_select'
  ) THEN
    EXECUTE 'DROP POLICY projects_shared_with_my_tenant_select ON projects';
  END IF;
END $$;

CREATE POLICY projects_shared_with_my_tenant_select ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = projects.id
        AND pas.shared_with_tenant_id IN (
          SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
        )
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'projects_shared_with_my_tenant_update'
  ) THEN
    EXECUTE 'DROP POLICY projects_shared_with_my_tenant_update ON projects';
  END IF;
END $$;

CREATE POLICY projects_shared_with_my_tenant_update ON projects
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = projects.id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
        )
    )
  );

-- ── 5. Same widening for `tasks` (so kanban + drawer work cross-tenant) ───

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'tasks_shared_project_select'
  ) THEN
    EXECUTE 'DROP POLICY tasks_shared_project_select ON tasks';
  END IF;
END $$;

CREATE POLICY tasks_shared_project_select ON tasks
  FOR SELECT USING (
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = tasks.project_id
        AND pas.shared_with_tenant_id IN (
          SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
        )
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'tasks_shared_project_update'
  ) THEN
    EXECUTE 'DROP POLICY tasks_shared_project_update ON tasks';
  END IF;
END $$;

CREATE POLICY tasks_shared_project_update ON tasks
  FOR UPDATE USING (
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = tasks.project_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
        )
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'tasks_shared_project_insert'
  ) THEN
    EXECUTE 'DROP POLICY tasks_shared_project_insert ON tasks';
  END IF;
END $$;

CREATE POLICY tasks_shared_project_insert ON tasks
  FOR INSERT WITH CHECK (
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = tasks.project_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
        )
    )
  );

-- ── 6. RPCs for managing shares ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION share_project_with_agency(
  p_project_id UUID,
  p_target_tenant_id UUID,
  p_access_level TEXT DEFAULT 'edit'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_owner_tenant UUID;
  v_project_title TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF p_access_level NOT IN ('view', 'edit') THEN
    p_access_level := 'edit';
  END IF;

  SELECT tenant_id, title INTO v_owner_tenant, v_project_title
  FROM projects WHERE id = p_project_id;
  IF v_owner_tenant IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  -- Caller must be a native member of the project's tenant with
  -- owner/admin role.
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = v_owner_tenant
      AND user_id = v_caller
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only owners/admins of the project tenant can share it';
  END IF;

  -- Can't share to self
  IF p_target_tenant_id = v_owner_tenant THEN
    RAISE EXCEPTION 'Project already lives in that tenant';
  END IF;

  -- Target must be the OTHER side of an accepted tenant_connections row
  -- (in either direction) — you can only share with agencies you've
  -- already established a relationship with.
  IF NOT EXISTS (
    SELECT 1 FROM tenant_connections
    WHERE status = 'accepted'
      AND (
        (parent_tenant_id = v_owner_tenant AND child_tenant_id = p_target_tenant_id)
        OR
        (parent_tenant_id = p_target_tenant_id AND child_tenant_id = v_owner_tenant)
      )
  ) THEN
    RAISE EXCEPTION 'Target agency must be a connected partner';
  END IF;

  INSERT INTO project_agency_shares (project_id, owner_tenant_id, shared_with_tenant_id, shared_by, access_level)
  VALUES (p_project_id, v_owner_tenant, p_target_tenant_id, v_caller, p_access_level)
  ON CONFLICT (project_id, shared_with_tenant_id) DO UPDATE
    SET access_level = EXCLUDED.access_level;

  -- Best-effort notification to the target agency's owner
  BEGIN
    PERFORM create_notification(
      (SELECT owner_id FROM tenants WHERE id = p_target_tenant_id),
      'project',
      'New shared project: ' || COALESCE(v_project_title, 'Untitled'),
      'Another agency connected this project with you.',
      '/projects',
      jsonb_build_object('project_id', p_project_id, 'kind', 'project_share')
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', TRUE, 'project_id', p_project_id, 'target', p_target_tenant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION share_project_with_agency(UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION unshare_project_from_agency(
  p_project_id UUID,
  p_target_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_owner_tenant UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT tenant_id INTO v_owner_tenant FROM projects WHERE id = p_project_id;
  IF v_owner_tenant IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;

  -- Either the project's tenant owner/admin, or the target tenant's
  -- owner/admin (so the receiving agency can also opt-out).
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE user_id = v_caller
      AND role IN ('owner', 'admin')
      AND tenant_id IN (v_owner_tenant, p_target_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to unshare';
  END IF;

  DELETE FROM project_agency_shares
  WHERE project_id = p_project_id AND shared_with_tenant_id = p_target_tenant_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION unshare_project_from_agency(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION list_project_agency_shares(p_project_id UUID)
RETURNS TABLE (
  share_id              UUID,
  project_id            UUID,
  shared_with_tenant_id UUID,
  shared_with_name      TEXT,
  shared_with_logo_url  TEXT,
  access_level          TEXT,
  shared_by_name        TEXT,
  created_at            TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pas.id, pas.project_id, pas.shared_with_tenant_id,
    t.name, t.logo_url, pas.access_level,
    COALESCE(NULLIF(TRIM(p.name), ''), p.email, 'Someone') AS shared_by_name,
    pas.created_at
  FROM project_agency_shares pas
  JOIN tenants t ON t.id = pas.shared_with_tenant_id
  LEFT JOIN profiles p ON p.id = pas.shared_by
  WHERE pas.project_id = p_project_id
    AND (
      pas.owner_tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
      OR
      pas.shared_with_tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
    )
  ORDER BY pas.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION list_project_agency_shares(UUID) TO authenticated;

-- For the receiving agency: which projects have been shared TO them, and
-- by whom. Used by the Projects list to render the "Shared from <X>" badge.
CREATE OR REPLACE FUNCTION list_projects_shared_to_me()
RETURNS TABLE (
  project_id            UUID,
  owner_tenant_id       UUID,
  owner_tenant_name     TEXT,
  owner_tenant_logo_url TEXT,
  access_level          TEXT,
  shared_at             TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pas.project_id, pas.owner_tenant_id,
    t.name, t.logo_url, pas.access_level, pas.created_at
  FROM project_agency_shares pas
  JOIN tenants t ON t.id = pas.owner_tenant_id
  WHERE pas.shared_with_tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION list_projects_shared_to_me() TO authenticated;

-- For the share-modal picker: list connected agencies the caller can
-- choose between, scoped to ONE project's owner tenant.
CREATE OR REPLACE FUNCTION list_shareable_agencies_for_project(p_project_id UUID)
RETURNS TABLE (
  tenant_id     UUID,
  tenant_name   TEXT,
  logo_url      TEXT,
  is_shared     BOOLEAN,
  share_id      UUID,
  access_level  TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_owner_tenant FROM projects WHERE id = p_project_id;
  IF v_owner_tenant IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE user_id = auth.uid() AND tenant_id = v_owner_tenant
  ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    other.id AS tenant_id,
    other.name AS tenant_name,
    other.logo_url,
    (existing.id IS NOT NULL) AS is_shared,
    existing.id AS share_id,
    COALESCE(existing.access_level, 'edit') AS access_level
  FROM (
    SELECT child_tenant_id AS other_id FROM tenant_connections
    WHERE status = 'accepted' AND parent_tenant_id = v_owner_tenant
    UNION
    SELECT parent_tenant_id AS other_id FROM tenant_connections
    WHERE status = 'accepted' AND child_tenant_id = v_owner_tenant
  ) connected
  JOIN tenants other ON other.id = connected.other_id
  LEFT JOIN project_agency_shares existing
    ON existing.project_id = p_project_id
   AND existing.shared_with_tenant_id = other.id
  ORDER BY (existing.id IS NOT NULL) DESC, other.name;
END;
$$;

GRANT EXECUTE ON FUNCTION list_shareable_agencies_for_project(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

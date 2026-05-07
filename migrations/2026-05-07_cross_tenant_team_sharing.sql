-- ============================================================================
-- Cross-tenant team sharing + cross-tenant tasks aggregation
-- ============================================================================
-- The user has parent agency ↔ child agency relationships via tenant_connections.
-- Today only the parent OWNER gets access to a child workspace. We need:
--
--   (1) The parent owner/admin can hand-pick which of their team members
--       get access to each connected child agency. Granular per-user, per-child.
--   (2) Tasks assigned to a user across ALL the tenants they're a member of
--       can be aggregated into a single home-page "across your workspaces"
--       widget — so people don't miss work that's pending in a workspace they
--       weren't actively viewing.
--
-- Security model — the only callers allowed to mutate cross-tenant access are
-- owners and admins of the PARENT tenant of the accepted connection. Native
-- members of the child tenant (set up by the child agency itself) are never
-- touched: we only read/write rows whose source='connection'.
-- ============================================================================

-- ── 1. share_team_member_with_tenant ───────────────────────────────────────
-- Grants a parent-tenant team member access to a connected child tenant by
-- inserting a tenant_members row with source='connection'. Idempotent.
CREATE OR REPLACE FUNCTION share_team_member_with_tenant(
  p_user_id   UUID,
  p_tenant_id UUID,
  p_role      TEXT DEFAULT 'member'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller            UUID := auth.uid();
  v_parent_tenant_id  UUID;
  v_child_name        TEXT;
  v_user_is_member    BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Find an accepted connection where:
  --   - p_tenant_id is the child
  --   - the caller is an owner or admin of the parent
  SELECT tc.parent_tenant_id INTO v_parent_tenant_id
  FROM tenant_connections tc
  WHERE tc.child_tenant_id = p_tenant_id
    AND tc.status = 'accepted'
    AND tc.parent_tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = v_caller
        AND role IN ('owner', 'admin')
    )
  LIMIT 1;

  IF v_parent_tenant_id IS NULL THEN
    RAISE EXCEPTION 'You must be owner or admin of the parent agency to share team members';
  END IF;

  -- Validate that p_user_id is a NATIVE member of the parent tenant.
  -- A user pulled in via another connection is not "really" your team member
  -- and should not be re-shared transitively.
  SELECT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE user_id = p_user_id
      AND tenant_id = v_parent_tenant_id
      AND COALESCE(source, 'native') = 'native'
  ) INTO v_user_is_member;

  IF NOT v_user_is_member THEN
    RAISE EXCEPTION 'User is not a native member of your tenant';
  END IF;

  -- Sanitize role; never let callers grant 'owner' across the boundary.
  IF p_role NOT IN ('admin', 'member', 'viewer') THEN
    p_role := 'member';
  END IF;

  -- Upsert. ON CONFLICT keeps the row updated if shared role changes.
  INSERT INTO tenant_members (user_id, tenant_id, role, source)
  VALUES (p_user_id, p_tenant_id, p_role, 'connection')
  ON CONFLICT (user_id, tenant_id) DO UPDATE
    SET role = EXCLUDED.role,
        source = 'connection';

  -- Notify the user that they got access. Best-effort — wrap so an
  -- inability to send the notification doesn't block the share.
  SELECT name INTO v_child_name FROM tenants WHERE id = p_tenant_id;
  BEGIN
    PERFORM create_notification(
      p_user_id,
      'invite',
      'You got access to ' || COALESCE(v_child_name, 'a connected agency'),
      'A connected agency was shared with you. Switch workspaces from the sidebar to access it.',
      NULL,
      jsonb_build_object('tenant_id', p_tenant_id, 'kind', 'cross_tenant_share')
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', TRUE, 'tenant_id', p_tenant_id, 'user_id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION share_team_member_with_tenant(UUID, UUID, TEXT) TO authenticated;

-- ── 2. unshare_team_member_from_tenant ─────────────────────────────────────
-- Reverses (1). Only deletes rows where source='connection' so we never
-- accidentally remove a native member of the child agency.
CREATE OR REPLACE FUNCTION unshare_team_member_from_tenant(
  p_user_id   UUID,
  p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller            UUID := auth.uid();
  v_parent_tenant_id  UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT tc.parent_tenant_id INTO v_parent_tenant_id
  FROM tenant_connections tc
  WHERE tc.child_tenant_id = p_tenant_id
    AND tc.status = 'accepted'
    AND tc.parent_tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = v_caller
        AND role IN ('owner', 'admin')
    )
  LIMIT 1;

  IF v_parent_tenant_id IS NULL THEN
    RAISE EXCEPTION 'You must be owner or admin of the parent agency to manage shared team';
  END IF;

  DELETE FROM tenant_members
  WHERE user_id = p_user_id
    AND tenant_id = p_tenant_id
    AND source = 'connection';

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION unshare_team_member_from_tenant(UUID, UUID) TO authenticated;

-- ── 3. list_shareable_team_members ─────────────────────────────────────────
-- Returns every native member of the parent tenant + a flag indicating
-- whether they ALSO have access to p_child_tenant_id (so the manager can
-- toggle each).
CREATE OR REPLACE FUNCTION list_shareable_team_members(
  p_child_tenant_id UUID
)
RETURNS TABLE (
  user_id    UUID,
  name       TEXT,
  email      TEXT,
  avatar_url TEXT,
  has_access BOOLEAN,
  role       TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller            UUID := auth.uid();
  v_parent_tenant_id  UUID;
BEGIN
  SELECT tc.parent_tenant_id INTO v_parent_tenant_id
  FROM tenant_connections tc
  WHERE tc.child_tenant_id = p_child_tenant_id
    AND tc.status = 'accepted'
    AND tc.parent_tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = v_caller
        AND role IN ('owner', 'admin')
    )
  LIMIT 1;

  IF v_parent_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                                              AS user_id,
    COALESCE(NULLIF(TRIM(p.name), ''), p.full_name, p.email)          AS name,
    p.email                                                           AS email,
    p.avatar_url                                                      AS avatar_url,
    (cm.user_id IS NOT NULL)                                          AS has_access,
    COALESCE(cm.role, 'member')                                       AS role
  FROM tenant_members tm
  JOIN profiles p ON p.id = tm.user_id
  LEFT JOIN tenant_members cm
    ON cm.user_id = tm.user_id
   AND cm.tenant_id = p_child_tenant_id
   AND cm.source = 'connection'
  WHERE tm.tenant_id = v_parent_tenant_id
    AND COALESCE(tm.source, 'native') = 'native'
    AND COALESCE(p.is_agent, FALSE) = FALSE
  ORDER BY (cm.user_id IS NOT NULL) DESC, p.name NULLS LAST, p.email;
END;
$$;

GRANT EXECUTE ON FUNCTION list_shareable_team_members(UUID) TO authenticated;

-- ── 4. list_my_managed_connections ─────────────────────────────────────────
-- Returns every accepted child agency the caller can manage (i.e. they're
-- owner/admin of the parent). Used by the SharedTeamManager UI to render
-- the per-connection management section.
CREATE OR REPLACE FUNCTION list_my_managed_connections()
RETURNS TABLE (
  connection_id    UUID,
  parent_tenant_id UUID,
  child_tenant_id  UUID,
  child_name       TEXT,
  child_logo_url   TEXT,
  child_slug       TEXT,
  shared_count     INT,
  accepted_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  RETURN QUERY
  SELECT
    tc.id                  AS connection_id,
    tc.parent_tenant_id,
    tc.child_tenant_id,
    te.name                AS child_name,
    te.logo_url            AS child_logo_url,
    te.slug                AS child_slug,
    (
      SELECT COUNT(*)::int FROM tenant_members
      WHERE tenant_id = tc.child_tenant_id AND source = 'connection'
    )                      AS shared_count,
    tc.accepted_at
  FROM tenant_connections tc
  JOIN tenants te ON te.id = tc.child_tenant_id
  WHERE tc.status = 'accepted'
    AND tc.parent_tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = v_caller
        AND role IN ('owner', 'admin')
    )
  ORDER BY tc.accepted_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION list_my_managed_connections() TO authenticated;

-- ── 5. list_my_cross_tenant_tasks ──────────────────────────────────────────
-- Returns the caller's open tasks across every workspace they belong to,
-- with tenant name + logo so the home widget can group them. Limited to
-- tasks the caller is assignee or owner of — we don't want to swamp the
-- widget with everyone else's work.
CREATE OR REPLACE FUNCTION list_my_cross_tenant_tasks()
RETURNS TABLE (
  task_id           UUID,
  tenant_id         UUID,
  tenant_name       TEXT,
  tenant_logo_url   TEXT,
  title             TEXT,
  description       TEXT,
  status            TEXT,
  priority          TEXT,
  due_date          DATE,
  start_date        DATE,
  assignee_id       UUID,
  owner_id          UUID,
  project_id        UUID,
  project_title     TEXT,
  is_overdue        BOOLEAN,
  created_at        TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  RETURN QUERY
  SELECT
    t.id                                              AS task_id,
    t.tenant_id,
    te.name                                           AS tenant_name,
    te.logo_url                                       AS tenant_logo_url,
    t.title,
    t.description,
    COALESCE(t.status, 'todo')                        AS status,
    COALESCE(t.priority, 'medium')                    AS priority,
    t.due_date,
    t.start_date,
    t.assignee_id,
    t.owner_id,
    t.project_id,
    p.title                                           AS project_title,
    (t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE) AS is_overdue,
    t.created_at
  FROM tasks t
  JOIN tenants te    ON te.id = t.tenant_id
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE t.tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = v_caller
  )
    AND (t.assignee_id = v_caller OR t.owner_id = v_caller)
    AND COALESCE(t.completed, FALSE) = FALSE
    AND COALESCE(t.status, 'todo') NOT IN ('done', 'cancelled')
  ORDER BY
    -- Overdue first, then by priority, then by due date
    (t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE) DESC,
    CASE COALESCE(t.priority, 'medium')
      WHEN 'urgent' THEN 0
      WHEN 'high'   THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low'    THEN 3
      ELSE 4
    END,
    t.due_date NULLS LAST,
    t.created_at DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION list_my_cross_tenant_tasks() TO authenticated;

NOTIFY pgrst, 'reload schema';

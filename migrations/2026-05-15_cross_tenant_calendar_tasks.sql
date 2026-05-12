-- ============================================================================
-- Cross-tenant Calendar tasks — make shared-project tasks visible in BOTH
-- agencies' calendars, and force task ownership to follow the project.
-- ============================================================================
-- Context: `project_agency_shares` already lets two connected tenants
-- collaborate on a single project; tasks inside that project are governed
-- by an RLS rule that lets either side SELECT/UPDATE them. But the
-- CalendarContext on the client side hard-filters every tasks query with
-- `.eq('tenant_id', active_tenant)` — which means the receiving agency's
-- calendar is blind to the shared project's tasks (their tenant_id still
-- points at the OWNER tenant).
--
-- Two fixes in this migration:
--
-- 1. BEFORE INSERT trigger on `tasks`. When a user creates a task in a
--    project that's been shared INTO their tenant from somewhere else,
--    the task's tenant_id is auto-rewritten to the PROJECT'S OWNER
--    tenant. Otherwise the task lives in the active tenant as before.
--    Rationale: the task should live wherever the project lives.
--    Without this, Agency B creating a task in a shared LIVV project
--    would file it under Agency B's tenant — LIVV would never see it.
--
-- 2. RPC `list_calendar_tasks_for_tenant(p_tenant_id)` — returns the
--    union of "tasks owned by p_tenant_id" + "tasks whose project is
--    shared TO p_tenant_id". Calendar fetches via this instead of a
--    raw `.from('tasks').eq('tenant_id', ...)`. Each row carries the
--    `shared_from_tenant_id` / `shared_from_name` so the UI can render
--    a "Shared from <Other Agency>" badge inline on the kanban card.
--
-- 3. Extend `list_my_cross_tenant_tasks` (the home widget RPC) so it
--    ALSO includes tasks the caller has access to via a shared project
--    — not just tasks in tenants where the caller is a direct member.
-- ============================================================================

-- ── 1. BEFORE INSERT trigger: resolve tenant_id from project ──────────────
CREATE OR REPLACE FUNCTION tasks_resolve_tenant_from_shared_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_tenant_id UUID;
BEGIN
  -- Nothing to do if no project_id, or no candidate tenant.
  IF NEW.project_id IS NULL OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO v_project_tenant_id
  FROM projects
  WHERE id = NEW.project_id;

  -- Project not found OR already lives in the same tenant — no rewrite.
  IF v_project_tenant_id IS NULL OR v_project_tenant_id = NEW.tenant_id THEN
    RETURN NEW;
  END IF;

  -- Different tenants — only rewrite if the project is shared INTO the
  -- caller's tenant. Otherwise leave NEW.tenant_id alone and let the
  -- regular RLS/permission check reject the insert if it's invalid.
  IF EXISTS (
    SELECT 1 FROM project_agency_shares
    WHERE project_id = NEW.project_id
      AND shared_with_tenant_id = NEW.tenant_id
  ) THEN
    NEW.tenant_id := v_project_tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_resolve_tenant_trigger ON tasks;
CREATE TRIGGER tasks_resolve_tenant_trigger
BEFORE INSERT ON tasks
FOR EACH ROW
EXECUTE FUNCTION tasks_resolve_tenant_from_shared_project();

COMMENT ON FUNCTION tasks_resolve_tenant_from_shared_project IS
  'When inserting a task into a project that lives in another tenant '
  'but is shared into the caller''s tenant, rewrite the task''s tenant_id '
  'to the project''s owner. Keeps shared tasks anchored to the host project.';

-- ── 2. RPC: list calendar tasks (owned + shared-in) ───────────────────────
CREATE OR REPLACE FUNCTION list_calendar_tasks_for_tenant(p_tenant_id UUID)
RETURNS TABLE (
  id                        UUID,
  tenant_id                 UUID,
  owner_id                  UUID,
  assigned_to               UUID,
  assignee_ids              UUID[],
  title                     TEXT,
  description               TEXT,
  description_html          TEXT,
  attachments               JSONB,
  cover_url                 TEXT,
  completed                 BOOLEAN,
  priority                  TEXT,
  start_date                DATE,
  end_date                  DATE,
  due_date                  DATE,
  start_time                TEXT,
  duration                  INT,
  status                    TEXT,
  client_id                 UUID,
  project_id                UUID,
  order_index               INT,
  parent_task_id            UUID,
  blocked_by                UUID,
  document_id               UUID,
  group_name                TEXT,
  created_at                TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  started_at                TIMESTAMPTZ,
  mirror_pair_id            UUID,
  mirror_origin_tenant_id   UUID,
  shared_from_tenant_id     UUID,
  shared_from_name          TEXT
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

  -- Caller must be a member of p_tenant_id — prevent fishing for other
  -- tenants' tasks by passing arbitrary p_tenant_id values.
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Not a member of the given tenant';
  END IF;

  RETURN QUERY
  -- (a) Tasks owned by p_tenant_id
  SELECT
    t.id, t.tenant_id, t.owner_id, t.assigned_to, t.assignee_ids,
    t.title, t.description, t.description_html, t.attachments, t.cover_url,
    t.completed, t.priority, t.start_date, t.end_date, t.due_date::DATE,
    t.start_time, t.duration, t.status, t.client_id, t.project_id,
    t.order_index, t.parent_task_id, t.blocked_by, t.document_id, t.group_name,
    t.created_at, t.updated_at, t.completed_at, t.started_at,
    t.mirror_pair_id, t.mirror_origin_tenant_id,
    NULL::UUID AS shared_from_tenant_id,
    NULL::TEXT AS shared_from_name
  FROM tasks t
  WHERE t.tenant_id = p_tenant_id

  UNION ALL

  -- (b) Tasks in projects shared INTO p_tenant_id
  SELECT
    t.id, t.tenant_id, t.owner_id, t.assigned_to, t.assignee_ids,
    t.title, t.description, t.description_html, t.attachments, t.cover_url,
    t.completed, t.priority, t.start_date, t.end_date, t.due_date::DATE,
    t.start_time, t.duration, t.status, t.client_id, t.project_id,
    t.order_index, t.parent_task_id, t.blocked_by, t.document_id, t.group_name,
    t.created_at, t.updated_at, t.completed_at, t.started_at,
    t.mirror_pair_id, t.mirror_origin_tenant_id,
    t.tenant_id AS shared_from_tenant_id,
    te.name    AS shared_from_name
  FROM tasks t
  JOIN project_agency_shares pas
    ON pas.project_id = t.project_id
   AND pas.shared_with_tenant_id = p_tenant_id
  JOIN tenants te ON te.id = t.tenant_id
  WHERE t.tenant_id <> p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION list_calendar_tasks_for_tenant(UUID) TO authenticated;

COMMENT ON FUNCTION list_calendar_tasks_for_tenant IS
  'Returns every task visible from p_tenant_id''s calendar — both tasks '
  'whose tenant_id = p_tenant_id AND tasks living in another tenant that '
  'are exposed via project_agency_shares. Each shared-in row carries the '
  'origin tenant''s name for badge rendering.';

-- ── 3. Extend list_my_cross_tenant_tasks (home widget) ───────────────────
-- Previously: only tasks in tenants where the caller is a direct member.
-- Now: also tasks in shared-in projects (where the caller's home tenant
-- can access the project but the caller isn't a native member of the
-- project's owner tenant).

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
  WITH visible_tasks AS (
    -- (a) tasks in any tenant the caller is a direct member of
    SELECT t.*
    FROM tasks t
    WHERE t.tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = v_caller
    )

    UNION

    -- (b) tasks in a project shared INTO any of the caller's tenants
    --     (e.g. tasks from LIVV's project that's been shared with Agency B,
    --      while the caller belongs to Agency B but not LIVV)
    SELECT t.*
    FROM tasks t
    JOIN project_agency_shares pas
      ON pas.project_id = t.project_id
     AND pas.shared_with_tenant_id IN (
       SELECT tenant_id FROM tenant_members WHERE user_id = v_caller
     )
    WHERE t.tenant_id NOT IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = v_caller
    )
  )
  SELECT
    vt.id                                              AS task_id,
    vt.tenant_id,
    te.name                                            AS tenant_name,
    te.logo_url                                        AS tenant_logo_url,
    vt.title,
    vt.description,
    COALESCE(vt.status, 'todo')                        AS status,
    COALESCE(vt.priority, 'medium')                    AS priority,
    vt.due_date::DATE,
    vt.start_date,
    vt.assigned_to                                     AS assignee_id,
    vt.owner_id,
    vt.project_id,
    p.title                                            AS project_title,
    (vt.due_date IS NOT NULL AND vt.due_date::DATE < CURRENT_DATE) AS is_overdue,
    vt.created_at
  FROM visible_tasks vt
  JOIN tenants te    ON te.id = vt.tenant_id
  LEFT JOIN projects p ON p.id = vt.project_id
  WHERE (vt.assigned_to = v_caller OR vt.owner_id = v_caller)
    AND COALESCE(vt.completed, FALSE) = FALSE
    AND COALESCE(vt.status, 'todo') NOT IN ('done', 'cancelled')
  ORDER BY
    (vt.due_date IS NOT NULL AND vt.due_date::DATE < CURRENT_DATE) DESC,
    CASE COALESCE(vt.priority, 'medium')
      WHEN 'urgent' THEN 0
      WHEN 'high'   THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low'    THEN 3
      ELSE 4
    END,
    vt.due_date NULLS LAST,
    vt.created_at DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION list_my_cross_tenant_tasks() TO authenticated;

-- ── 4. Companion RPC: list shared-in project IDs for a tenant ─────────────
-- Used by CalendarContext to set up realtime subscriptions per shared
-- project (postgres_changes can't filter by IN, so we open one channel
-- per project — usually 1-3 in practice).
CREATE OR REPLACE FUNCTION list_shared_in_project_ids(p_tenant_id UUID)
RETURNS TABLE (project_id UUID, owner_tenant_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pas.project_id, pas.owner_tenant_id
  FROM project_agency_shares pas
  WHERE pas.shared_with_tenant_id = p_tenant_id
    AND pas.shared_with_tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION list_shared_in_project_ids(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

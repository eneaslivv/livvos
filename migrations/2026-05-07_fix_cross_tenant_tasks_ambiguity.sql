-- ============================================================================
-- Fix: column reference "tenant_id" is ambiguous in list_my_cross_tenant_tasks
-- ============================================================================
-- Symptom: the home-page "Across your workspaces" widget rendered the
-- error "column reference 'tenant_id' is ambiguous" instead of tasks.
--
-- Cause: the function declares `tenant_id` as a RETURNS TABLE OUT
-- parameter, AND its body had `SELECT tenant_id FROM tenant_members`
-- (unqualified). PostgreSQL plpgsql can't tell whether `tenant_id` in
-- the inner SELECT refers to the column or to the OUT param. It worked
-- before but the new RLS policies added in 2026-05-07_project_agency_shares
-- changed the planner's evaluation context enough to surface the
-- ambiguity at runtime.
--
-- Fix: qualify the inner reference as `tm.tenant_id` so it can never
-- collide with any OUT param.
-- ============================================================================

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
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  RETURN QUERY
  SELECT
    t.id                                              AS task_id,
    t.tenant_id                                       AS tenant_id,
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
    SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = v_caller
  )
    AND (t.assignee_id = v_caller OR t.owner_id = v_caller)
    AND COALESCE(t.completed, FALSE) = FALSE
    AND COALESCE(t.status, 'todo') NOT IN ('done', 'cancelled')
  ORDER BY
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

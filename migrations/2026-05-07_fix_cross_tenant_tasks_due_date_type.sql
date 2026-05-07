-- ============================================================================
-- Fix: structure of query does not match function result type
-- ============================================================================
-- Symptom: home-page "Across your workspaces" widget rendered the error
-- "structure of query does not match function result type" instead of tasks.
--
-- Cause: list_my_cross_tenant_tasks declares `due_date DATE` in the
-- RETURNS TABLE, but the underlying `tasks.due_date` column is
-- `timestamptz`. PostgreSQL refuses the type mismatch when binding the
-- SELECT result to the function signature.
--
-- Fix: cast `t.due_date::date` (and qualify the overdue comparison) so
-- the SELECT matches the declared DATE column. The frontend already
-- treats due_date as a YYYY-MM-DD string for the home widget, so
-- losing the time portion here is intended.
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
    -- Underlying column is timestamptz; cast to date so the result
    -- matches the function signature and the frontend can keep
    -- treating this as a YYYY-MM-DD string.
    t.due_date::date                                  AS due_date,
    t.start_date,
    t.assignee_id,
    t.owner_id,
    t.project_id,
    p.title                                           AS project_title,
    (t.due_date IS NOT NULL AND t.due_date::date < CURRENT_DATE) AS is_overdue,
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
    (t.due_date IS NOT NULL AND t.due_date::date < CURRENT_DATE) DESC,
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

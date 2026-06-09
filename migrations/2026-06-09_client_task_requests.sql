-- ============================================================================
-- Client requests ARE tasks in the project (not a separate "orders" inbox)
-- ============================================================================
-- When a client hits "New request" in their portal, it should drop straight
-- into the SAME project as a task — so it shows up on the project board the
-- client and the agency already share, and the team works it like any task.
-- This supersedes the orders experiment (2026-06-08_orders.sql), now dropped.
-- ============================================================================

-- 1. Remove the orders table + helpers (it had 0 rows; the flow is plain tasks).
DROP TABLE IF EXISTS orders CASCADE;
DROP FUNCTION IF EXISTS orders_notify_staff() CASCADE;
DROP FUNCTION IF EXISTS orders_set_updated_at() CASCADE;

-- 2. Let a logged-in client create a task in THEIR OWN project. Constrained so a
--    client can only file a fresh, unassigned request against a project/client
--    that belongs to them (clients.auth_user_id = auth.uid()).
DROP POLICY IF EXISTS tasks_client_insert ON tasks;
CREATE POLICY tasks_client_insert ON tasks FOR INSERT
WITH CHECK (
  COALESCE(completed, false) = false
  AND COALESCE(status, 'todo') IN ('todo', 'pending')
  AND assignee_id IS NULL
  AND EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = tasks.client_id
      AND c.auth_user_id = auth.uid()
      AND (
        tasks.project_id IS NULL
        OR EXISTS (SELECT 1 FROM projects p WHERE p.id = tasks.project_id AND p.client_id = c.id)
      )
  )
);

-- 3. Notify every agency staff member when a CLIENT files a request. A client
--    task is detected by its owner_id matching the client's portal auth user
--    (set by the portal on insert). Fires only for client-created tasks; normal
--    staff tasks return early. Best-effort — never blocks the insert.
CREATE OR REPLACE FUNCTION tasks_notify_staff_on_client_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_name TEXT;
  v_member RECORD;
BEGIN
  IF NEW.owner_id IS NULL OR NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.name INTO v_client_name
  FROM clients c
  WHERE c.id = NEW.client_id AND c.auth_user_id = NEW.owner_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW; -- not a client-created task
  END IF;

  BEGIN
    FOR v_member IN SELECT user_id FROM tenant_members WHERE tenant_id = NEW.tenant_id LOOP
      PERFORM create_notification(
        v_member.user_id,
        'task',
        'New request from ' || COALESCE(NULLIF(v_client_name, ''), 'a client'),
        NEW.title,
        NULL,
        jsonb_build_object('kind', 'client_task_request', 'task_id', NEW.id,
                           'project_id', NEW.project_id, 'client_id', NEW.client_id),
        NEW.tenant_id
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_notify_client_request ON tasks;
CREATE TRIGGER trg_tasks_notify_client_request
  AFTER INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_notify_staff_on_client_request();

NOTIFY pgrst, 'reload schema';

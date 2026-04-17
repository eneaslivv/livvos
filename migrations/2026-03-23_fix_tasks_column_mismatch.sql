-- =============================================
-- Fix: tasks RLS policies + trigger reference wrong column
-- The tasks table has 'assignee_id' but previous migration
-- (2026-03-05_fix_tasks_tenant_trigger.sql) referenced 'assigned_to'
-- which doesn't exist, leaving RLS enabled with NO policies.
-- =============================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing task policies (some may not exist, that's OK)
DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_insert_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_update_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_delete_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_owner" ON tasks;
DROP POLICY IF EXISTS "client_tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_client" ON tasks;
DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can create own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;

-- SELECT: tenant match, null tenant, own tasks, or client-linked tasks
CREATE POLICY "tasks_select_policy" ON tasks
FOR SELECT USING (
  can_access_tenant(tenant_id)
  OR tenant_id IS NULL
  OR assignee_id = auth.uid()
  OR owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = tasks.client_id AND c.auth_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM projects p
    JOIN clients c ON c.id = p.client_id
    WHERE p.id = tasks.project_id AND c.auth_user_id = auth.uid()
  )
);

-- INSERT: open (trigger handles tenant_id assignment)
CREATE POLICY "tasks_insert_policy" ON tasks
FOR INSERT WITH CHECK (TRUE);

-- UPDATE: tenant match, null tenant, or own tasks
CREATE POLICY "tasks_update_policy" ON tasks
FOR UPDATE USING (
  can_access_tenant(tenant_id)
  OR tenant_id IS NULL
  OR assignee_id = auth.uid()
  OR owner_id = auth.uid()
);

-- DELETE: tenant match, null tenant, or own tasks
CREATE POLICY "tasks_delete_policy" ON tasks
FOR DELETE USING (
  can_access_tenant(tenant_id)
  OR tenant_id IS NULL
  OR assignee_id = auth.uid()
  OR owner_id = auth.uid()
);

GRANT ALL ON tasks TO authenticated;

-- Fix trigger: use assignee_id (correct column) instead of assigned_to
CREATE OR REPLACE FUNCTION set_task_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    IF NEW.assignee_id IS NOT NULL THEN
      NEW.tenant_id := (SELECT tenant_id FROM profiles WHERE id = NEW.assignee_id LIMIT 1);
    END IF;
    IF NEW.tenant_id IS NULL AND NEW.project_id IS NOT NULL THEN
      NEW.tenant_id := (SELECT tenant_id FROM projects WHERE id = NEW.project_id LIMIT 1);
    END IF;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := (SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_set_task_tenant ON tasks;
CREATE TRIGGER trigger_set_task_tenant
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_tenant_id();

NOTIFY pgrst, 'reload config';

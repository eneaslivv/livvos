-- =============================================
-- Fix: Auto-assign tenant_id on tasks + fix RLS
-- Problem: tasks table has no owner_id (uses assigned_to),
-- profiles had no tenant_id, and RLS blocked everything
-- =============================================

-- 1. Assign tenant to main users
UPDATE profiles
SET tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN ('livvadm@gmail.com', 'livveneas@gmail.com', 'eneaswebflow@gmail.com')
);

-- 2. Fix tasks RLS policies (use assigned_to, not owner_id)
DROP POLICY IF EXISTS "tasks_owner" ON tasks;
DROP POLICY IF EXISTS "client_tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_client" ON tasks;
DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_insert_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_update_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_delete_policy" ON tasks;

CREATE POLICY "tasks_select_policy" ON tasks
FOR SELECT USING (
  can_access_tenant(tenant_id)
  OR tenant_id IS NULL
  OR assigned_to = auth.uid()
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

CREATE POLICY "tasks_insert_policy" ON tasks
FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "tasks_update_policy" ON tasks
FOR UPDATE USING (
  can_access_tenant(tenant_id)
  OR tenant_id IS NULL
  OR assigned_to = auth.uid()
);

CREATE POLICY "tasks_delete_policy" ON tasks
FOR DELETE USING (
  can_access_tenant(tenant_id)
  OR tenant_id IS NULL
  OR assigned_to = auth.uid()
);

GRANT ALL ON tasks TO authenticated;

-- 3. Trigger: auto-set tenant_id from user profile
CREATE OR REPLACE FUNCTION set_task_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    IF NEW.assigned_to IS NOT NULL THEN
      NEW.tenant_id := (SELECT tenant_id FROM profiles WHERE id = NEW.assigned_to LIMIT 1);
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

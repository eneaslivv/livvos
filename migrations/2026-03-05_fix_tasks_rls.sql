-- =============================================
-- Fix RLS for TASKS table
-- =============================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;
CREATE POLICY "tasks_select_policy" ON tasks
FOR SELECT USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "tasks_insert_policy" ON tasks;
CREATE POLICY "tasks_insert_policy" ON tasks
FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "tasks_update_policy" ON tasks;
CREATE POLICY "tasks_update_policy" ON tasks
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "tasks_delete_policy" ON tasks;
CREATE POLICY "tasks_delete_policy" ON tasks
FOR DELETE USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

GRANT ALL ON tasks TO authenticated;

-- =============================================
-- Fix RLS for CLIENTS table
-- =============================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select_policy" ON clients;
DROP POLICY IF EXISTS "Users can view their own clients" ON clients;
CREATE POLICY "clients_select_policy" ON clients
FOR SELECT USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
CREATE POLICY "clients_insert_policy" ON clients
FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "clients_modify_policy" ON clients;
DROP POLICY IF EXISTS "clients_update_policy" ON clients;
CREATE POLICY "clients_update_policy" ON clients
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "clients_delete_policy" ON clients;
CREATE POLICY "clients_delete_policy" ON clients
FOR DELETE USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

GRANT ALL ON clients TO authenticated;

-- =============================================
-- Fix RLS for CLIENT_HISTORY table
-- =============================================
ALTER TABLE client_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_history_select" ON client_history;
DROP POLICY IF EXISTS "client_history_select_policy" ON client_history;
CREATE POLICY "client_history_select" ON client_history
FOR SELECT USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL
);

DROP POLICY IF EXISTS "client_history_insert" ON client_history;
DROP POLICY IF EXISTS "client_history_insert_policy" ON client_history;
DROP POLICY IF EXISTS "client_history_modify" ON client_history;
DROP POLICY IF EXISTS "client_history_modify_policy" ON client_history;
CREATE POLICY "client_history_insert" ON client_history
FOR INSERT WITH CHECK (TRUE);

GRANT ALL ON client_history TO authenticated;

-- =============================================
-- Fix RLS for PROJECTS table
-- =============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_policy" ON projects;
DROP POLICY IF EXISTS "projects_select_own" ON projects;
CREATE POLICY "projects_select_policy" ON projects
FOR SELECT USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "projects_insert_policy" ON projects;
DROP POLICY IF EXISTS "projects_insert_own" ON projects;
CREATE POLICY "projects_insert_policy" ON projects
FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "projects_update_policy" ON projects;
DROP POLICY IF EXISTS "projects_update_own" ON projects;
CREATE POLICY "projects_update_policy" ON projects
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "projects_delete_policy" ON projects;
DROP POLICY IF EXISTS "projects_delete_own" ON projects;
CREATE POLICY "projects_delete_policy" ON projects
FOR DELETE USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

GRANT ALL ON projects TO authenticated;

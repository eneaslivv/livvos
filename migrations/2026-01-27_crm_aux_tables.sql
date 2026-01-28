CREATE TABLE IF NOT EXISTS client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_type TEXT DEFAULT 'user',
  sender_name TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_messages_client_id ON client_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_client_messages_created_at ON client_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_messages_tenant_id ON client_messages(tenant_id);

ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_messages_select" ON client_messages;
CREATE POLICY "client_messages_select" ON client_messages
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "client_messages_insert" ON client_messages;
CREATE POLICY "client_messages_insert" ON client_messages
FOR INSERT
WITH CHECK (can_access_tenant(tenant_id) AND created_by = auth.uid());

CREATE TABLE IF NOT EXISTS client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_tasks_client_id ON client_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_completed ON client_tasks(completed);
CREATE INDEX IF NOT EXISTS idx_client_tasks_tenant_id ON client_tasks(tenant_id);

ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_tasks_select" ON client_tasks;
CREATE POLICY "client_tasks_select" ON client_tasks
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "client_tasks_modify" ON client_tasks;
CREATE POLICY "client_tasks_modify" ON client_tasks
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

CREATE TABLE IF NOT EXISTS client_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  action_type TEXT NOT NULL,
  action_description TEXT,
  action_date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_history_client_id ON client_history(client_id);
CREATE INDEX IF NOT EXISTS idx_client_history_action_date ON client_history(action_date DESC);
CREATE INDEX IF NOT EXISTS idx_client_history_tenant_id ON client_history(tenant_id);

ALTER TABLE client_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_history_select" ON client_history;
CREATE POLICY "client_history_select" ON client_history
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "client_history_insert" ON client_history;
CREATE POLICY "client_history_insert" ON client_history
FOR INSERT
WITH CHECK (can_access_tenant(tenant_id) AND created_by = auth.uid());

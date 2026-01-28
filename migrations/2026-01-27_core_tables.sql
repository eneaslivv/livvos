CREATE TABLE IF NOT EXISTS tenant_usage (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  current_users INTEGER DEFAULT 0,
  current_projects INTEGER DEFAULT 0,
  storage_used_mb INTEGER DEFAULT 0,
  api_calls_this_month INTEGER DEFAULT 0,
  last_calculated TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tenant_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_usage_select" ON tenant_usage;
CREATE POLICY "tenant_usage_select" ON tenant_usage
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "tenant_usage_upsert" ON tenant_usage;
CREATE POLICY "tenant_usage_upsert" ON tenant_usage
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT,
  body TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'sender_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'recipient_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'subject'
  ) THEN
    ALTER TABLE messages ADD COLUMN subject TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'body'
  ) THEN
    ALTER TABLE messages ADD COLUMN body TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'read'
  ) THEN
    ALTER TABLE messages ADD COLUMN read BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE messages ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages
FOR INSERT
WITH CHECK (can_access_tenant(tenant_id));

CREATE TABLE IF NOT EXISTS quick_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_hits' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE quick_hits ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE quick_hits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quick_hits_select" ON quick_hits;
CREATE POLICY "quick_hits_select" ON quick_hits
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "quick_hits_insert" ON quick_hits;
CREATE POLICY "quick_hits_insert" ON quick_hits
FOR INSERT
WITH CHECK (can_access_tenant(tenant_id));

CREATE TABLE IF NOT EXISTS permission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permission_audit_insert" ON permission_audit_log;
CREATE POLICY "permission_audit_insert" ON permission_audit_log
FOR INSERT
WITH CHECK (auth.uid() = user_id AND can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "permission_audit_select" ON permission_audit_log;
CREATE POLICY "permission_audit_select" ON permission_audit_log
FOR SELECT
USING (auth.uid() = user_id AND can_access_tenant(tenant_id));

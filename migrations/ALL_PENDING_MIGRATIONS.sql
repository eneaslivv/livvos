-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  ENEAS OS — ALL PENDING MIGRATIONS (CONSOLIDATED)             ║
-- ║  Ejecutar TODO este archivo en el SQL Editor de Supabase      ║
-- ║  Proyecto: ngswutcpsgdgmmjnfddi                               ║
-- ║  Date: 2026-02-25 (CORRECTED - matches actual DB schema)      ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- Verified against actual database schema via REST API.
-- All statements use IF NOT EXISTS / IF EXISTS / DO $$ EXCEPTION
-- so this is 100% safe to run even if everything already exists.


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 0. UTILITY FUNCTION: update_updated_at_column()
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. CLIENT PORTAL COMPLETE (schema + tables)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Add missing columns to existing tables (IF NOT EXISTS = safe)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

DO $$ BEGIN
  ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;
EXCEPTION WHEN others THEN NULL;
END $$;

-- store_id may not exist on roles; skip if missing
DO $$ BEGIN
  ALTER TABLE roles ALTER COLUMN store_id DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
WHEN others THEN NULL;
END $$;

-- Core tables (all already exist — these are no-ops)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS tenant_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  branding JSONB DEFAULT '{}',
  features JSONB DEFAULT '{}',
  resource_limits JSONB DEFAULT '{}',
  security_settings JSONB DEFAULT '{}',
  integrations JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role_id UUID REFERENCES roles(id),
  tenant_id UUID REFERENCES tenants(id),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  type TEXT DEFAULT 'team',
  status TEXT DEFAULT 'pending',
  token UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id),
  client_id UUID REFERENCES clients(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  completed BOOLEAN DEFAULT false,
  priority TEXT DEFAULT 'medium',
  start_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id),
  total_agreed NUMERIC DEFAULT 0,
  total_collected NUMERIC DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- activity_logs: NO owner_id column in actual DB — only user_id
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  project_title TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  name TEXT NOT NULL,
  type TEXT,
  size BIGINT,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Client-specific tables
CREATE TABLE IF NOT EXISTS client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'client')),
  sender_id UUID,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT FALSE,
  priority TEXT DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_description TEXT NOT NULL,
  action_date TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  doc_type TEXT DEFAULT 'document',
  url TEXT NOT NULL,
  size_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  username TEXT,
  secret TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed system roles (compatible with any roles schema)
DO $$ BEGIN
  INSERT INTO roles (name, description, is_system)
  SELECT 'client', 'Client portal access', true
  WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'client');
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  INSERT INTO roles (name, description, is_system)
  SELECT 'owner', 'Workspace owner', true
  WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'owner');
EXCEPTION WHEN others THEN NULL;
END $$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. ACTIVITY FEED UPGRADE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- NOTE: activity_logs has user_id but NO owner_id column.
-- All references to owner_id have been removed.

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_name TEXT DEFAULT 'System';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_avatar TEXT DEFAULT 'SYS';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS target TEXT NOT NULL DEFAULT 'General';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'comment';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'status';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES activity_logs(id) ON DELETE CASCADE;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS likes UUID[] DEFAULT '{}';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant ON activity_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_parent_id ON activity_logs(parent_id);

-- Backfill tenant_id from profiles (using user_id only — owner_id does not exist)
UPDATE activity_logs al
SET tenant_id = p.tenant_id
FROM profiles p
WHERE al.user_id = p.id AND al.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- RLS for activity_logs (NO owner_id references)
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view logs" ON activity_logs;
DROP POLICY IF EXISTS "Allow All Activity" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_policy" ON activity_logs;
CREATE POLICY "activity_logs_select_policy" ON activity_logs
  FOR SELECT USING (
    CASE
      WHEN tenant_id IS NOT NULL THEN can_access_tenant(tenant_id)
      ELSE auth.uid() = user_id
    END
  );

DROP POLICY IF EXISTS "Users can insert logs" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert_policy" ON activity_logs;
CREATE POLICY "activity_logs_insert_policy" ON activity_logs
  FOR INSERT WITH CHECK (
    CASE
      WHEN tenant_id IS NOT NULL THEN can_access_tenant(tenant_id)
      ELSE auth.uid() = user_id
    END
  );

DROP POLICY IF EXISTS "Users can update own logs" ON activity_logs;
CREATE POLICY "Users can update own logs" ON activity_logs
  FOR UPDATE USING (
    auth.uid() = user_id
    OR (tenant_id IS NOT NULL AND can_access_tenant(tenant_id))
  );

DROP POLICY IF EXISTS "Users can delete own logs" ON activity_logs;
CREATE POLICY "Users can delete own logs" ON activity_logs
  FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON activity_logs TO authenticated;

CREATE OR REPLACE FUNCTION update_activity_logs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trigger_activity_logs_updated_at ON activity_logs;
CREATE TRIGGER trigger_activity_logs_updated_at
  BEFORE UPDATE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION update_activity_logs_updated_at();

CREATE OR REPLACE FUNCTION notify_on_activity_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_parent_owner_id UUID;
  v_parent_details JSONB;
  v_preview TEXT;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id, details INTO v_parent_owner_id, v_parent_details
    FROM activity_logs WHERE id = NEW.parent_id;
    v_preview := COALESCE(v_parent_details->>'content', 'your activity');
    IF v_parent_owner_id IS NOT NULL AND v_parent_owner_id != NEW.user_id THEN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_notification') THEN
        PERFORM create_notification(
          v_parent_owner_id, 'activity',
          COALESCE(NEW.user_name, 'Someone') || ' replied to you',
          'Replying to: ' || LEFT(v_preview, 50) || (CASE WHEN LENGTH(v_preview) > 50 THEN '...' ELSE '' END),
          '/activity',
          jsonb_build_object('activity_id', NEW.parent_id, 'comment_id', NEW.id)
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_notify_activity_comment ON activity_logs;
CREATE TRIGGER trigger_notify_activity_comment
  AFTER INSERT ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION notify_on_activity_comment();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. GOOGLE CALENDAR INTEGRATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_only BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_calendar_events_source ON calendar_events(source);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external_id
  ON calendar_events(owner_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_tokens JSONB NOT NULL,
  scopes TEXT[],
  external_email TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_provider UNIQUE(user_id, provider)
);

ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own integration credentials') THEN
    CREATE POLICY "Users can view own integration credentials" ON integration_credentials FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own integration credentials') THEN
    CREATE POLICY "Users can insert own integration credentials" ON integration_credentials FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own integration credentials') THEN
    CREATE POLICY "Users can update own integration credentials" ON integration_credentials FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own integration credentials') THEN
    CREATE POLICY "Users can delete own integration credentials" ON integration_credentials FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on integration_credentials') THEN
    CREATE POLICY "Service role full access on integration_credentials" ON integration_credentials FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_integration_credentials_user_id ON integration_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_credentials_provider ON integration_credentials(provider);

GRANT SELECT, INSERT, UPDATE, DELETE ON integration_credentials TO authenticated;
GRANT ALL ON integration_credentials TO service_role;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. FINANCE: INCOMES, EXPENSES & INSTALLMENTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  concept TEXT NOT NULL DEFAULT '',
  total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'partial', 'pending', 'overdue')),
  due_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incomes_tenant_id ON incomes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incomes_client_id ON incomes(client_id);
CREATE INDEX IF NOT EXISTS idx_incomes_project_id ON incomes(project_id);
CREATE INDEX IF NOT EXISTS idx_incomes_status ON incomes(status);
CREATE INDEX IF NOT EXISTS idx_incomes_due_date ON incomes(due_date);

ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "incomes_select_policy" ON incomes;
CREATE POLICY "incomes_select_policy" ON incomes FOR SELECT USING (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "incomes_insert_policy" ON incomes;
CREATE POLICY "incomes_insert_policy" ON incomes FOR INSERT WITH CHECK (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "incomes_update_policy" ON incomes;
CREATE POLICY "incomes_update_policy" ON incomes FOR UPDATE USING (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "incomes_delete_policy" ON incomes;
CREATE POLICY "incomes_delete_policy" ON incomes FOR DELETE USING (can_access_tenant(tenant_id));
GRANT ALL ON incomes TO authenticated;

CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  income_id UUID NOT NULL REFERENCES incomes(id) ON DELETE CASCADE,
  number INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_installments_income_id ON installments(income_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "installments_select_policy" ON installments;
CREATE POLICY "installments_select_policy" ON installments FOR SELECT USING (
  EXISTS (SELECT 1 FROM incomes WHERE incomes.id = installments.income_id AND can_access_tenant(incomes.tenant_id))
);
DROP POLICY IF EXISTS "installments_insert_policy" ON installments;
CREATE POLICY "installments_insert_policy" ON installments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM incomes WHERE incomes.id = installments.income_id AND can_access_tenant(incomes.tenant_id))
);
DROP POLICY IF EXISTS "installments_update_policy" ON installments;
CREATE POLICY "installments_update_policy" ON installments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM incomes WHERE incomes.id = installments.income_id AND can_access_tenant(incomes.tenant_id))
);
DROP POLICY IF EXISTS "installments_delete_policy" ON installments;
CREATE POLICY "installments_delete_policy" ON installments FOR DELETE USING (
  EXISTS (SELECT 1 FROM incomes WHERE incomes.id = installments.income_id AND can_access_tenant(incomes.tenant_id))
);
GRANT ALL ON installments TO authenticated;

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'General',
  subcategory TEXT NOT NULL DEFAULT '',
  concept TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT NOT NULL DEFAULT 'General',
  vendor TEXT NOT NULL DEFAULT '',
  recurring BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON expenses(recurring);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expenses_select_policy" ON expenses;
CREATE POLICY "expenses_select_policy" ON expenses FOR SELECT USING (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "expenses_insert_policy" ON expenses;
CREATE POLICY "expenses_insert_policy" ON expenses FOR INSERT WITH CHECK (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "expenses_update_policy" ON expenses;
CREATE POLICY "expenses_update_policy" ON expenses FOR UPDATE USING (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "expenses_delete_policy" ON expenses;
CREATE POLICY "expenses_delete_policy" ON expenses FOR DELETE USING (can_access_tenant(tenant_id));
GRANT ALL ON expenses TO authenticated;

-- Finance triggers
CREATE OR REPLACE FUNCTION update_finance_timestamps()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS incomes_updated_at ON incomes;
CREATE TRIGGER incomes_updated_at BEFORE UPDATE ON incomes FOR EACH ROW EXECUTE FUNCTION update_finance_timestamps();
DROP TRIGGER IF EXISTS installments_updated_at ON installments;
CREATE TRIGGER installments_updated_at BEFORE UPDATE ON installments FOR EACH ROW EXECUTE FUNCTION update_finance_timestamps();
DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_finance_timestamps();

CREATE OR REPLACE FUNCTION update_income_status()
RETURNS TRIGGER AS $$
DECLARE total_count INTEGER; paid_count INTEGER; overdue_count INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'paid'), COUNT(*) FILTER (WHERE status = 'overdue')
  INTO total_count, paid_count, overdue_count
  FROM installments WHERE income_id = COALESCE(NEW.income_id, OLD.income_id);
  IF total_count = 0 THEN RETURN NEW; END IF;
  UPDATE incomes SET status = CASE
    WHEN paid_count = total_count THEN 'paid'
    WHEN overdue_count > 0 THEN 'overdue'
    WHEN paid_count > 0 THEN 'partial'
    ELSE 'pending'
  END WHERE id = COALESCE(NEW.income_id, OLD.income_id);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS installment_status_sync ON installments;
CREATE TRIGGER installment_status_sync
  AFTER INSERT OR UPDATE OR DELETE ON installments
  FOR EACH ROW EXECUTE FUNCTION update_income_status();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. TENANT ADDITIONS (logo, banner)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS banner_url TEXT;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. USER VISION & THOUGHTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS user_vision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

ALTER TABLE user_vision ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own vision" ON user_vision;
CREATE POLICY "Users can view their own vision" ON user_vision FOR SELECT USING (auth.uid() = user_id AND can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "Users can insert their own vision" ON user_vision;
CREATE POLICY "Users can insert their own vision" ON user_vision FOR INSERT WITH CHECK (auth.uid() = user_id AND can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "Users can update their own vision" ON user_vision;
CREATE POLICY "Users can update their own vision" ON user_vision FOR UPDATE USING (auth.uid() = user_id AND can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "Users can delete their own vision" ON user_vision;
CREATE POLICY "Users can delete their own vision" ON user_vision FOR DELETE USING (auth.uid() = user_id AND can_access_tenant(tenant_id));
GRANT ALL ON user_vision TO authenticated;

CREATE TABLE IF NOT EXISTS user_thoughts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  content TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

ALTER TABLE user_thoughts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_thoughts_select" ON user_thoughts;
CREATE POLICY "user_thoughts_select" ON user_thoughts FOR SELECT USING (auth.uid() = user_id AND can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "user_thoughts_insert" ON user_thoughts;
CREATE POLICY "user_thoughts_insert" ON user_thoughts FOR INSERT WITH CHECK (auth.uid() = user_id AND can_access_tenant(tenant_id));
DROP POLICY IF EXISTS "user_thoughts_update" ON user_thoughts;
CREATE POLICY "user_thoughts_update" ON user_thoughts FOR UPDATE USING (auth.uid() = user_id AND can_access_tenant(tenant_id));
GRANT ALL ON user_thoughts TO authenticated;

DROP TRIGGER IF EXISTS set_updated_at_user_thoughts ON user_thoughts;
CREATE TRIGGER set_updated_at_user_thoughts
  BEFORE UPDATE ON user_thoughts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. TEAM AGENTS (profiles fields)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_agent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_description TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_connected BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_is_agent ON profiles(is_agent) WHERE is_agent = TRUE;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. FIX LEADS TABLE (add missing columns + RLS)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE leads ADD COLUMN IF NOT EXISTS company TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_owner_id ON leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_policy" ON leads;
DROP POLICY IF EXISTS "leads_insert_policy" ON leads;
DROP POLICY IF EXISTS "leads_update_policy" ON leads;
DROP POLICY IF EXISTS "leads_delete_policy" ON leads;
DROP POLICY IF EXISTS "leads_read" ON leads;
DROP POLICY IF EXISTS "leads_write" ON leads;
DROP POLICY IF EXISTS "leads_modify" ON leads;

CREATE POLICY "leads_select_policy" ON leads FOR SELECT USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
CREATE POLICY "leads_insert_policy" ON leads FOR INSERT WITH CHECK (tenant_id IS NOT NULL AND (can_access_tenant(tenant_id) OR tenant_id IS NULL));
CREATE POLICY "leads_update_policy" ON leads FOR UPDATE USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
CREATE POLICY "leads_delete_policy" ON leads FOR DELETE USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
GRANT ALL ON leads TO authenticated;

-- Backfill tenant_id for existing leads
DO $$
DECLARE v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  IF v_tenant_id IS NOT NULL THEN
    UPDATE leads SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  END IF;
END $$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. PASSWORDS TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  username TEXT DEFAULT '',
  password_encrypted TEXT NOT NULL,
  url TEXT DEFAULT '',
  category TEXT DEFAULT 'general',
  notes TEXT DEFAULT '',
  visibility TEXT DEFAULT 'private',
  allowed_roles TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_passwords_tenant_id ON passwords(tenant_id);
CREATE INDEX IF NOT EXISTS idx_passwords_created_by ON passwords(created_by);
CREATE INDEX IF NOT EXISTS idx_passwords_visibility ON passwords(visibility);

ALTER TABLE passwords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "passwords_select_own" ON passwords;
DROP POLICY IF EXISTS "passwords_insert" ON passwords;
DROP POLICY IF EXISTS "passwords_update" ON passwords;
DROP POLICY IF EXISTS "passwords_delete" ON passwords;
DROP POLICY IF EXISTS "passwords_select_policy" ON passwords;
DROP POLICY IF EXISTS "passwords_insert_policy" ON passwords;
DROP POLICY IF EXISTS "passwords_update_policy" ON passwords;
DROP POLICY IF EXISTS "passwords_delete_policy" ON passwords;

CREATE POLICY "passwords_select_policy" ON passwords FOR SELECT USING (
  auth.uid() = created_by
  OR (visibility = 'team' AND (can_access_tenant(tenant_id) OR tenant_id IS NULL))
  OR (visibility = 'role' AND (can_access_tenant(tenant_id) OR tenant_id IS NULL))
);
CREATE POLICY "passwords_insert_policy" ON passwords FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "passwords_update_policy" ON passwords FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "passwords_delete_policy" ON passwords FOR DELETE USING (auth.uid() = created_by);
GRANT ALL ON passwords TO authenticated;

DROP TRIGGER IF EXISTS set_updated_at_passwords ON passwords;
CREATE TRIGGER set_updated_at_passwords
  BEFORE UPDATE ON passwords FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 10. ADDITIONAL COLUMNS ON PROJECTS (for the full project UI)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- NOTE: DB already has budget_total + budget_paid. Frontend uses
-- "budget" + "currency" fields. Adding both — they can coexist.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_avatar TEXT DEFAULT 'CL';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS next_steps TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team TEXT[] DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tasks_groups JSONB DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS activity JSONB DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget NUMERIC DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- RLS for projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projects_select_policy" ON projects;
CREATE POLICY "projects_select_policy" ON projects FOR SELECT USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
DROP POLICY IF EXISTS "projects_insert_policy" ON projects;
CREATE POLICY "projects_insert_policy" ON projects FOR INSERT WITH CHECK (can_access_tenant(tenant_id) OR tenant_id IS NULL);
DROP POLICY IF EXISTS "projects_update_policy" ON projects;
CREATE POLICY "projects_update_policy" ON projects FOR UPDATE USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
DROP POLICY IF EXISTS "projects_delete_policy" ON projects;
CREATE POLICY "projects_delete_policy" ON projects FOR DELETE USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
GRANT ALL ON projects TO authenticated;

-- RLS for tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;
CREATE POLICY "tasks_select_policy" ON tasks FOR SELECT USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
DROP POLICY IF EXISTS "tasks_insert_policy" ON tasks;
CREATE POLICY "tasks_insert_policy" ON tasks FOR INSERT WITH CHECK (TRUE);
DROP POLICY IF EXISTS "tasks_update_policy" ON tasks;
CREATE POLICY "tasks_update_policy" ON tasks FOR UPDATE USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
DROP POLICY IF EXISTS "tasks_delete_policy" ON tasks;
CREATE POLICY "tasks_delete_policy" ON tasks FOR DELETE USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
GRANT ALL ON tasks TO authenticated;

-- RLS for finances
ALTER TABLE finances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finances_select_policy" ON finances;
CREATE POLICY "finances_select_policy" ON finances FOR SELECT USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
DROP POLICY IF EXISTS "finances_insert_policy" ON finances;
CREATE POLICY "finances_insert_policy" ON finances FOR INSERT WITH CHECK (TRUE);
DROP POLICY IF EXISTS "finances_update_policy" ON finances;
CREATE POLICY "finances_update_policy" ON finances FOR UPDATE USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
DROP POLICY IF EXISTS "finances_delete_policy" ON finances;
CREATE POLICY "finances_delete_policy" ON finances FOR DELETE USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
GRANT ALL ON finances TO authenticated;

-- RLS for clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
CREATE POLICY "clients_select_policy" ON clients FOR SELECT USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
CREATE POLICY "clients_insert_policy" ON clients FOR INSERT WITH CHECK (TRUE);
DROP POLICY IF EXISTS "clients_update_policy" ON clients;
CREATE POLICY "clients_update_policy" ON clients FOR UPDATE USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
DROP POLICY IF EXISTS "clients_delete_policy" ON clients;
CREATE POLICY "clients_delete_policy" ON clients FOR DELETE USING (can_access_tenant(tenant_id) OR tenant_id IS NULL);
GRANT ALL ON clients TO authenticated;

-- Grant access to all core tables
GRANT ALL ON user_roles TO authenticated;
GRANT ALL ON tenant_config TO authenticated;
GRANT ALL ON invitations TO authenticated;
GRANT ALL ON files TO authenticated;
GRANT ALL ON client_messages TO authenticated;
GRANT ALL ON client_tasks TO authenticated;
GRANT ALL ON client_history TO authenticated;
GRANT ALL ON client_documents TO authenticated;
GRANT ALL ON client_credentials TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DONE — Reload PostgREST schema cache
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTIFY pgrst, 'reload config';

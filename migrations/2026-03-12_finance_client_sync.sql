-- Migration: Create time_entries table + add client_id to expenses and time_entries
-- Enables same financial tracking (expenses, time entries) on both client and project views

-- 1. Create time_entries table (with client_id and nullable project_id from the start)
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  hours NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (hours > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hourly_rate NUMERIC(10,2) DEFAULT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_id ON time_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_client_id ON time_entries(client_id);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_entries_select_policy" ON time_entries;
CREATE POLICY "time_entries_select_policy" ON time_entries
FOR SELECT USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "time_entries_insert_policy" ON time_entries;
CREATE POLICY "time_entries_insert_policy" ON time_entries
FOR INSERT WITH CHECK (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "time_entries_update_policy" ON time_entries;
CREATE POLICY "time_entries_update_policy" ON time_entries
FOR UPDATE USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "time_entries_delete_policy" ON time_entries;
CREATE POLICY "time_entries_delete_policy" ON time_entries
FOR DELETE USING (can_access_tenant(tenant_id));

GRANT ALL ON time_entries TO authenticated;

-- 2. Add client_id to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_client_id ON expenses(client_id);

-- 3. Backfill client_id from linked projects
UPDATE expenses e
SET client_id = p.client_id
FROM projects p
WHERE e.project_id = p.id
  AND p.client_id IS NOT NULL
  AND e.client_id IS NULL;

NOTIFY pgrst, 'reload schema';

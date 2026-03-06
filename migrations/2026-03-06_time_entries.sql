-- =============================================
-- Time Entries — per-project time tracking
-- Internal only (never exposed to client/public portals)
-- =============================================

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  hours NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (hours > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hourly_rate NUMERIC(10,2) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_id ON time_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);

-- RLS
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

NOTIFY pgrst, 'reload config';

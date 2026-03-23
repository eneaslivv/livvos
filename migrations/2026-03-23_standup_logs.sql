-- Standup logs: stores daily standup submissions processed by AI
-- One entry per user per day (upsert on re-submit)

CREATE TABLE IF NOT EXISTS standup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES auth.users(id),
  standup_date DATE NOT NULL DEFAULT CURRENT_DATE,
  raw_input TEXT NOT NULL,
  ai_summary TEXT,
  actions_proposed JSONB DEFAULT '[]'::jsonb,
  actions_applied JSONB DEFAULT '[]'::jsonb,
  risks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_id, standup_date)
);

CREATE INDEX IF NOT EXISTS idx_standup_logs_lookup
  ON standup_logs(tenant_id, user_id, standup_date);

ALTER TABLE standup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own standups"
  ON standup_logs FOR ALL
  USING (auth.uid() = user_id AND can_access_tenant(tenant_id));

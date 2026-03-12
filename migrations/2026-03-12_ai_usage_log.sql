-- =============================================
-- AI usage tracking: log every AI API call
-- =============================================

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL,
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for daily quota checks (tenant + date)
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_date
  ON ai_usage_log (tenant_id, created_at);

-- RLS: users can only see their own tenant's usage
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view AI usage"
  ON ai_usage_log FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Edge function inserts via service role, so no INSERT policy needed for authenticated users

NOTIFY pgrst, 'reload config';

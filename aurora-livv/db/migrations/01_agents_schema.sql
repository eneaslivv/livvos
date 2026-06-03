-- ============================================================
-- aurora-livv · 01_agents_schema.sql
-- Creates schema agents.* with 11 tables for the multi-agent layer.
-- Idempotent (safe to re-run).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS agents;

-- ---------------------------------------------------------------------
-- 0. Add agent_mode + stage_probabilities + north_star to tenant_config
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='tenant_config' AND column_name='agent_mode') THEN
    ALTER TABLE tenant_config ADD COLUMN agent_mode TEXT DEFAULT 'multi'
      CHECK (agent_mode IN ('multi','unified'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='tenant_config' AND column_name='default_currency_code') THEN
    ALTER TABLE tenant_config ADD COLUMN default_currency_code TEXT DEFAULT 'USD';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='tenant_config' AND column_name='stage_probabilities') THEN
    ALTER TABLE tenant_config ADD COLUMN stage_probabilities JSONB DEFAULT '{
      "new":0.05,"contacted":0.10,"qualified":0.25,
      "proposal":0.50,"negotiation":0.75,"won":1.00,"lost":0.00
    }'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='tenant_config' AND column_name='north_star_metric') THEN
    ALTER TABLE tenant_config ADD COLUMN north_star_metric TEXT;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. sessions — one row per chat session (FAB opened → closed/timeout)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active_agent TEXT NOT NULL CHECK (active_agent IN ('atlas','solara','marina','nova')),
  module_context TEXT,            -- e.g. 'pipeline', 'finance', 'growth-dashboard'
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agents_sessions_tenant ON agents.sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_sessions_user ON agents.sessions(user_id);

-- ---------------------------------------------------------------------
-- 2. messages — every turn (user + agent)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agents.sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','agent','system')),
  agent TEXT CHECK (agent IN ('atlas','solara','marina','nova')),
  content TEXT NOT NULL,
  canvas JSONB,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_messages_session ON agents.messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agents_messages_tenant ON agents.messages(tenant_id);

-- ---------------------------------------------------------------------
-- 3. tool_calls — every tool invocation
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES agents.messages(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  agent TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('READ','WRITE','DESTRUCTIVE')),
  params JSONB,
  result JSONB,
  success BOOLEAN,
  error_code TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_tool_calls_tenant ON agents.tool_calls(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agents_tool_calls_tool ON agents.tool_calls(tool_name, success);

-- ---------------------------------------------------------------------
-- 4. audit_log — immutable, append-only, hashes params for tamper-evidence
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  agent TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tier TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','committed','failed','compensated')),
  params_hash TEXT NOT NULL,           -- sha256 of canonicalized params
  before_state JSONB,                  -- snapshot before write (NULL for READ)
  after_state JSONB,                   -- snapshot after write
  error JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  committed_at TIMESTAMPTZ
);
-- Append-only: deny UPDATE/DELETE via policies
CREATE INDEX IF NOT EXISTS idx_agents_audit_tenant ON agents.audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_audit_user ON agents.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_audit_tool ON agents.audit_log(tool_name, status);

-- ---------------------------------------------------------------------
-- 5. idempotency_keys — see skills/idempotency.md
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.idempotency_keys (
  key UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_payload JSONB,
  status TEXT NOT NULL CHECK (status IN ('pending','committed','failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  committed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_agents_idem_expires ON agents.idempotency_keys(expires_at);

-- ---------------------------------------------------------------------
-- 6. kill_switches — global / per-scope agent disable
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.kill_switches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('global','tenant','agent','tool')),
  scope_value TEXT,                     -- tenant_id, 'solara', 'update_lead_status', etc.
  active BOOLEAN DEFAULT TRUE,
  reason TEXT NOT NULL,
  activated_by UUID,
  activated_at TIMESTAMPTZ DEFAULT now(),
  deactivated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agents_kill_active ON agents.kill_switches(active, scope, scope_value);

-- ---------------------------------------------------------------------
-- 7. compensations — multi-step saga rollback record
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.compensations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  audit_id UUID NOT NULL REFERENCES agents.audit_log(id),
  step_index INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  forward_payload JSONB,
  inverse_payload JSONB,
  status TEXT NOT NULL CHECK (status IN ('pending','done','skipped','failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_comp_audit ON agents.compensations(audit_id);

-- ---------------------------------------------------------------------
-- 8. artifacts — outputs the agents persist (WBRs, drafts, reports)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID,
  kind TEXT NOT NULL,                   -- 'wbr', 'outreach_draft', 'forecast', etc.
  title TEXT,
  body TEXT,
  payload JSONB,
  generated_by_agent TEXT,
  related_entity_type TEXT,             -- 'lead', 'project', etc.
  related_entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_artifacts_tenant ON agents.artifacts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_artifacts_kind ON agents.artifacts(kind);

-- ---------------------------------------------------------------------
-- 9. evals_runs — historical eval results
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.evals_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ DEFAULT now(),
  ran_by UUID,
  agent TEXT NOT NULL,
  case_set TEXT NOT NULL,               -- e.g. 'cases-solara.json'
  total_cases INTEGER,
  passed INTEGER,
  failed INTEGER,
  pass_rate NUMERIC,
  llm_model TEXT,
  cost_usd NUMERIC,
  duration_ms INTEGER,
  detail JSONB
);
CREATE INDEX IF NOT EXISTS idx_agents_eval_runs_agent ON agents.evals_runs(agent, ran_at DESC);

-- ---------------------------------------------------------------------
-- 10. feedback — thumbs up/down per agent message
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES agents.messages(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_feedback_message ON agents.feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_agents_feedback_tenant ON agents.feedback(tenant_id);

-- ---------------------------------------------------------------------
-- 11. memories — see skills/memory-management.md
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('user','tenant')),
  tenant_id UUID NOT NULL,
  user_id UUID,                         -- null if scope='tenant'
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  written_by_agent TEXT NOT NULL,
  ttl_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (scope, tenant_id, user_id, category, key)
);
CREATE INDEX IF NOT EXISTS idx_agents_memories_lookup ON agents.memories(tenant_id, user_id, scope);

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE agents.sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.tool_calls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.idempotency_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.kill_switches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.compensations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.artifacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.evals_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.feedback          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.memories          ENABLE ROW LEVEL SECURITY;

-- Generic tenant-isolated select policy
CREATE POLICY "agents_sessions_tenant" ON agents.sessions
  FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

CREATE POLICY "agents_messages_tenant" ON agents.messages
  FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

CREATE POLICY "agents_tool_calls_tenant" ON agents.tool_calls
  FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

-- audit_log: SELECT for tenant, INSERT only by edge fn, DELETE forbidden
CREATE POLICY "agents_audit_log_select" ON agents.audit_log
  FOR SELECT USING (can_access_tenant(tenant_id));
CREATE POLICY "agents_audit_log_insert" ON agents.audit_log
  FOR INSERT WITH CHECK (can_access_tenant(tenant_id));
-- No UPDATE / DELETE policies → append-only.

CREATE POLICY "agents_idem_keys" ON agents.idempotency_keys
  FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

CREATE POLICY "agents_kill_admin" ON agents.kill_switches
  FOR ALL USING (has_permission('admin','manage'))
  WITH CHECK (has_permission('admin','manage'));

CREATE POLICY "agents_compensations_tenant" ON agents.compensations
  FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

CREATE POLICY "agents_artifacts_tenant" ON agents.artifacts
  FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

CREATE POLICY "agents_evals_admin" ON agents.evals_runs
  FOR ALL USING (has_permission('admin','manage'))
  WITH CHECK (has_permission('admin','manage'));

CREATE POLICY "agents_feedback_tenant" ON agents.feedback
  FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

CREATE POLICY "agents_memories_tenant" ON agents.memories
  FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON SCHEMA agents IS 'Aurora-Livv multi-agent conversational layer. Operational tables.';
COMMENT ON TABLE agents.audit_log IS 'Append-only audit log. UPDATE/DELETE forbidden by policy.';
COMMENT ON TABLE agents.kill_switches IS 'Operator emergency stop. scope determines blast radius.';
COMMENT ON TABLE agents.memories IS 'User + tenant persistent memory for agents. See skills/memory-management.md.';

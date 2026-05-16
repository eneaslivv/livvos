-- ============================================================================
-- Agent system memory: conversation log + feedback + user profile + metrics
-- ============================================================================
-- Owned by lib/agents/. The orchestrator logs every turn here so the
-- critique loop can read patterns + the user profile can adapt over
-- time. Tables namespaced agent_* to avoid collision with the legacy
-- ai_feedback / ai_output_log pair that hangs off ai_usage_log.

CREATE TABLE IF NOT EXISTS agent_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface         TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  query           TEXT NOT NULL,
  reply           TEXT NOT NULL,
  skill_trace     JSONB NOT NULL DEFAULT '[]',
  proposed_actions JSONB NOT NULL DEFAULT '[]',
  ms_total        INT,
  ms_skills       INT,
  ms_llm          INT,
  thread_id       UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_conv_tenant_user_ts ON agent_conversations(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_conv_agent_ts ON agent_conversations(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal          TEXT NOT NULL CHECK (signal IN (
    'thumbs_up', 'thumbs_down',
    'action_confirmed', 'action_skipped',
    're_asked_same_thing', 'rephrased',
    'follow_up_clarification'
  )),
  comment         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_user_profiles (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  preferred_tone        TEXT DEFAULT 'friendly',
  preferred_reply_length TEXT DEFAULT 'medium',
  preferred_language    TEXT DEFAULT 'auto',
  topic_weights         JSONB DEFAULT '{}',
  learned_traits        TEXT,
  manual_notes          TEXT,
  style_rules           JSONB DEFAULT '[]',
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_metrics (
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id           TEXT NOT NULL,
  day                DATE NOT NULL,
  turns              INT DEFAULT 0,
  thumbs_up          INT DEFAULT 0,
  thumbs_down        INT DEFAULT 0,
  re_asks            INT DEFAULT 0,
  actions_confirmed  INT DEFAULT 0,
  actions_skipped    INT DEFAULT 0,
  avg_ms_total       NUMERIC(10, 2),
  avg_ms_skills      NUMERIC(10, 2),
  avg_ms_llm         NUMERIC(10, 2),
  skill_no_data_rate NUMERIC(5, 4),
  PRIMARY KEY (tenant_id, agent_id, day)
);

-- RLS — own-row read/write for conversations/feedback/profile; tenant-wide
-- read for metrics so dashboards can roll up agent quality.
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_feedback      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_conv_own ON agent_conversations;
CREATE POLICY agent_conv_own ON agent_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS agent_feedback_own ON agent_feedback;
CREATE POLICY agent_feedback_own ON agent_feedback
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS agent_profile_own ON agent_user_profiles;
CREATE POLICY agent_profile_own ON agent_user_profiles
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS agent_metrics_tenant_read ON agent_metrics;
CREATE POLICY agent_metrics_tenant_read ON agent_metrics
  FOR SELECT USING (tenant_id IN (
    SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
  ));

-- See lib/agents/orchestrator.ts for the increment_agent_metric +
-- bump_feedback_metric RPCs that update the rollups atomically.

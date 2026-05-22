-- =============================================================================
-- Aurora — multi-agent backend persistence (threads + messages + triggers)
-- =============================================================================
-- Backs the production-ready Aurora agents (gpt-4o via aurora-chat edge fn).
-- See: supabase/functions/aurora-chat/ for the runtime that reads/writes here.
-- =============================================================================

-- 1. Threads: one open thread per (user × agent). When user switches agent,
--    we either reuse the most recent un-archived thread or start a new one.
CREATE TABLE IF NOT EXISTS aurora_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_slug      TEXT NOT NULL,
  title           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS aurora_threads_user_idx
  ON aurora_threads(user_id, last_message_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS aurora_threads_user_agent_idx
  ON aurora_threads(user_id, agent_slug, last_message_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE aurora_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aurora_threads_own ON aurora_threads;
CREATE POLICY aurora_threads_own ON aurora_threads
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Messages: full history per thread including tool calls + tool results
--    + token counts + cost for auditing/cost dashboard.
CREATE TABLE IF NOT EXISTS aurora_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     UUID NOT NULL REFERENCES aurora_threads(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  agent_slug    TEXT,
  text          TEXT,
  canvas        JSONB,
  tool_calls    JSONB,
  tool_call_id  TEXT,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  model         TEXT,
  cost_usd      NUMERIC(12, 6),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aurora_messages_thread_idx
  ON aurora_messages(thread_id, created_at);

ALTER TABLE aurora_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aurora_messages_own ON aurora_messages;
CREATE POLICY aurora_messages_own ON aurora_messages
  FOR ALL USING (
    thread_id IN (SELECT id FROM aurora_threads WHERE user_id = auth.uid())
  )
  WITH CHECK (
    thread_id IN (SELECT id FROM aurora_threads WHERE user_id = auth.uid())
  );

-- 3. Triggers: cron config for proactive agent runs (Orion Monday 9am, etc.)
CREATE TABLE IF NOT EXISTS aurora_triggers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_slug       TEXT NOT NULL,
  schedule         TEXT NOT NULL,
  prompt_template  TEXT NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at      TIMESTAMPTZ,
  next_run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aurora_triggers_due_idx
  ON aurora_triggers(next_run_at)
  WHERE enabled = TRUE;

ALTER TABLE aurora_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aurora_triggers_own ON aurora_triggers;
CREATE POLICY aurora_triggers_own ON aurora_triggers
  FOR ALL USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- 4. Realtime — so the dock auto-refreshes when a proactive trigger lands.
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE aurora_threads;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE aurora_messages;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END;
END $$;

-- 5. Helper RPC: get_or_create_thread(agent_slug) — used by the client on
--    dock open to grab the active thread for the current user × agent.
CREATE OR REPLACE FUNCTION aurora_get_or_create_thread(p_agent_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_tenant_id UUID;
  v_thread_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_user_id;

  SELECT id INTO v_thread_id
    FROM aurora_threads
    WHERE user_id = v_user_id
      AND agent_slug = p_agent_slug
      AND archived_at IS NULL
    ORDER BY last_message_at DESC
    LIMIT 1;

  IF v_thread_id IS NOT NULL THEN
    RETURN v_thread_id;
  END IF;

  INSERT INTO aurora_threads (tenant_id, user_id, agent_slug)
  VALUES (v_tenant_id, v_user_id, p_agent_slug)
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION aurora_get_or_create_thread(TEXT) TO authenticated;

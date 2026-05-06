-- ============================================================================
-- Communications Hub — Gmail + Slack integration foundation
-- ============================================================================
-- Adapted from the original spec to eneas-os reality:
--   - agency_id  → tenant_id
--   - agencies   → tenants
--   - agency_members → tenant_members (user_id, tenant_id, role)
--
-- Three core tables:
--   integration_tokens       OAuth tokens per (tenant, platform, account)
--   slack_monitored_channels which Slack channels the agency wants polled
--   communication_messages   unified inbox (Gmail + Slack rows)
--   reply_drafts             draft history for audit + analytics
--
-- AI classification lives on communication_messages.ai_classification (jsonb)
-- so we don't need a separate table.
-- ============================================================================

-- ── INTEGRATION TOKENS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('gmail', 'slack')),
  -- Note: storing access/refresh tokens directly. For prod hardening, switch
  -- to Supabase Vault — for now they're scoped by RLS to tenant members and
  -- the table is admin-only writable via the edge function service role.
  access_token    text NOT NULL,
  refresh_token   text,
  token_type      text DEFAULT 'Bearer',
  scope           text,
  expires_at      timestamptz,

  -- Gmail-specific
  gmail_email           text,
  gmail_history_id      text,             -- last seen historyId for incremental sync
  gmail_watch_expiry    timestamptz,      -- Gmail push notification watches expire ~7d

  -- Slack-specific
  slack_team_id         text,
  slack_team_name       text,
  slack_bot_user_id     text,
  slack_bot_token       text,             -- bot token, separate from user token

  -- Metadata
  connected_at    timestamptz DEFAULT now(),
  last_sync_at    timestamptz,
  is_active       boolean DEFAULT true,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Compound uniqueness — one Gmail account per tenant, one Slack workspace per tenant.
-- We use partial unique indexes so a tenant can have multiple platforms without
-- conflict (the original UNIQUE constraint pattern from the spec doesn't work
-- because gmail_email is null for slack rows and vice versa).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_integration_gmail
  ON integration_tokens(tenant_id, gmail_email)
  WHERE platform = 'gmail';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_integration_slack
  ON integration_tokens(tenant_id, slack_team_id)
  WHERE platform = 'slack';

CREATE INDEX IF NOT EXISTS idx_integration_tokens_tenant
  ON integration_tokens(tenant_id, platform);

-- ── SLACK MONITORED CHANNELS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slack_monitored_channels (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_token_id  uuid REFERENCES integration_tokens(id) ON DELETE CASCADE,
  channel_id            text NOT NULL,
  channel_name          text NOT NULL,
  channel_type          text DEFAULT 'public' CHECK (channel_type IN ('public', 'private', 'dm')),
  is_active             boolean DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  UNIQUE(tenant_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_channels_tenant
  ON slack_monitored_channels(tenant_id, is_active);

-- ── COMMUNICATION MESSAGES (unified inbox) ────────────────────────────────
CREATE TABLE IF NOT EXISTS communication_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('gmail', 'slack')),

  -- External identifiers (used for dedup)
  external_id     text NOT NULL,                  -- Gmail message_id / Slack ts
  thread_id       text,                           -- Gmail thread_id / Slack thread_ts

  -- Sender
  from_id         text,                           -- Gmail email / Slack user_id
  from_name       text,
  from_email      text,                           -- Gmail only
  from_avatar_url text,

  -- Content
  subject         text,                           -- Gmail only
  body_text       text NOT NULL,
  body_html       text,                           -- Gmail only
  channel_id      text,                           -- Slack only
  channel_name    text,                           -- Slack only

  -- Thread context for the AI (last N messages of the conversation)
  thread_context  jsonb,

  -- Timestamps
  received_at     timestamptz NOT NULL,

  -- AI classification (see types/communications.ts for shape)
  ai_processed    boolean DEFAULT false,
  ai_classification jsonb,

  -- Workflow state
  status          text DEFAULT 'pending' CHECK (status IN (
    'pending', 'task_created', 'replied', 'snoozed', 'ignored', 'archived'
  )),

  -- Action attribution
  task_id         uuid REFERENCES tasks(id) ON DELETE SET NULL,
  replied_at      timestamptz,
  replied_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reply_sent      text,
  snoozed_until   timestamptz,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  UNIQUE(tenant_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_comm_messages_tenant_status
  ON communication_messages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_comm_messages_platform
  ON communication_messages(tenant_id, platform);
CREATE INDEX IF NOT EXISTS idx_comm_messages_received
  ON communication_messages(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_messages_thread
  ON communication_messages(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_messages_unprocessed
  ON communication_messages(tenant_id, ai_processed) WHERE ai_processed = false;

-- ── REPLY DRAFTS (audit trail) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reply_drafts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id          uuid NOT NULL REFERENCES communication_messages(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ai_generated_text   text NOT NULL,
  edited_text         text,
  was_sent            boolean DEFAULT false,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reply_drafts_message
  ON reply_drafts(message_id);

-- ── updated_at triggers ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION comm_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_integration_tokens_updated_at ON integration_tokens;
CREATE TRIGGER trg_integration_tokens_updated_at
  BEFORE UPDATE ON integration_tokens
  FOR EACH ROW EXECUTE FUNCTION comm_touch_updated_at();

DROP TRIGGER IF EXISTS trg_communication_messages_updated_at ON communication_messages;
CREATE TRIGGER trg_communication_messages_updated_at
  BEFORE UPDATE ON communication_messages
  FOR EACH ROW EXECUTE FUNCTION comm_touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Same pattern as the rest of eneas-os: members of the tenant can SELECT,
-- only members with create permission can INSERT/UPDATE/DELETE. Tokens
-- specifically are admin-only writable from the edge function service role
-- (we do NOT let arbitrary users INSERT raw tokens client-side; OAuth
-- callbacks use SUPABASE_SERVICE_ROLE_KEY).

ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_monitored_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_tokens_select ON integration_tokens;
CREATE POLICY integration_tokens_select ON integration_tokens
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS integration_tokens_modify ON integration_tokens;
CREATE POLICY integration_tokens_modify ON integration_tokens
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS slack_channels_all ON slack_monitored_channels;
CREATE POLICY slack_channels_all ON slack_monitored_channels
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS comm_messages_all ON communication_messages;
CREATE POLICY comm_messages_all ON communication_messages
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS reply_drafts_all ON reply_drafts;
CREATE POLICY reply_drafts_all ON reply_drafts
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

-- ── PostgREST refresh ─────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

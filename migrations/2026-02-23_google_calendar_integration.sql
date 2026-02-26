-- Migration: Google Calendar Integration
-- Adds source tracking to calendar_events and creates integration_credentials table

-- 1. Add source tracking to calendar_events
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_only BOOLEAN DEFAULT FALSE;

-- Index for filtering synced events
CREATE INDEX IF NOT EXISTS idx_calendar_events_source ON calendar_events(source);

-- Unique index to prevent duplicate imports (partial index: only for rows with external_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external_id
  ON calendar_events(owner_id, source, external_id)
  WHERE external_id IS NOT NULL;

-- 2. Create integration_credentials table (per-user)
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

-- RLS for integration_credentials
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own integration credentials'
  ) THEN
    CREATE POLICY "Users can view own integration credentials"
      ON integration_credentials FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own integration credentials'
  ) THEN
    CREATE POLICY "Users can insert own integration credentials"
      ON integration_credentials FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own integration credentials'
  ) THEN
    CREATE POLICY "Users can update own integration credentials"
      ON integration_credentials FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own integration credentials'
  ) THEN
    CREATE POLICY "Users can delete own integration credentials"
      ON integration_credentials FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role access for edge functions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on integration_credentials'
  ) THEN
    CREATE POLICY "Service role full access on integration_credentials"
      ON integration_credentials FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_integration_credentials_user_id
  ON integration_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_credentials_provider
  ON integration_credentials(provider);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON integration_credentials TO authenticated;
GRANT ALL ON integration_credentials TO service_role;

NOTIFY pgrst, 'reload config';

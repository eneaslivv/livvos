-- ============================================================================
-- content_strategy — per-tenant "brain" for the Content calendar
-- ============================================================================
-- One row per tenant. Holds the always-pinned strategy context the user
-- uploads/types so the Content view can show a recap and the AI can use
-- it to suggest posts.
--
-- Fields:
--  - summary         text          short recap (AI-generated or manual)
--  - pinned_notes    text          freeform "always-on" strategy pad
--  - objectives      jsonb         array of weekly goals
--                                  [{id, text, week_start: 'YYYY-MM-DD' | null,
--                                    done: bool, created_at, created_by}]
--  - documents       jsonb         array of strategy reference docs
--                                  [{id, name, url, kind: 'upload'|'link'|'doc',
--                                    added_at, added_by}]
--  - ai_suggestions  jsonb         cached last AI output
--                                  {generated_at, items: [{id, title, body,
--                                  suggested_date, format, hook}]}
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_strategy (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  summary         text,
  pinned_notes    text,
  objectives      jsonb NOT NULL DEFAULT '[]'::jsonb,
  documents       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_suggestions  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_strategy_tenant ON content_strategy(tenant_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION content_strategy_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_strategy_updated_at ON content_strategy;
CREATE TRIGGER trg_content_strategy_updated_at
  BEFORE UPDATE ON content_strategy
  FOR EACH ROW EXECUTE FUNCTION content_strategy_touch_updated_at();

-- ============================================================================
-- RLS — same pattern as the rest of the tenant-scoped tables
-- ============================================================================

ALTER TABLE content_strategy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_strategy_select ON content_strategy;
CREATE POLICY content_strategy_select ON content_strategy
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS content_strategy_insert ON content_strategy;
CREATE POLICY content_strategy_insert ON content_strategy
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS content_strategy_update ON content_strategy;
CREATE POLICY content_strategy_update ON content_strategy
  FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS content_strategy_delete ON content_strategy;
CREATE POLICY content_strategy_delete ON content_strategy
  FOR DELETE
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Make it queryable from PostgREST
NOTIFY pgrst, 'reload schema';

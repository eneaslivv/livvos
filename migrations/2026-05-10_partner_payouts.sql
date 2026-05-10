-- ============================================================================
-- partner_payouts — track 70/30 distribution between partners (LIVV uses it)
-- ============================================================================
-- Each row is one (period × partner) combination. A "period" is usually a
-- month, but the spec supports two-period months (when there's a quincena
-- payment), so we use period_label as the human key + period_start/end as
-- the date range.
--
-- Columns are denormalized (revenue, costs, net_profit, distributable) so
-- the row is self-contained — easy to render in a list without recomputing.
--
-- RLS: any tenant_member can SELECT their tenant's payouts. Only owner /
-- admin can INSERT/UPDATE/DELETE (since this is sensitive financial data).
-- ============================================================================

CREATE TABLE IF NOT EXISTS partner_payouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_label        TEXT NOT NULL,
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  total_revenue       NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_revenue         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_costs         NUMERIC(12,2) NOT NULL DEFAULT 0,
  marketing_comms     NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_profit          NUMERIC(12,2) NOT NULL DEFAULT 0,
  distributable       NUMERIC(12,2) NOT NULL DEFAULT 0,
  partner_email       TEXT NOT NULL,
  partner_name        TEXT NOT NULL,
  share_pct           NUMERIC(5,2) NOT NULL,
  payout_amount       NUMERIC(12,2) NOT NULL,
  paid_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance             NUMERIC(12,2) GENERATED ALWAYS AS (payout_amount - paid_amount) STORED,
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, period_label, partner_email)
);

CREATE INDEX IF NOT EXISTS partner_payouts_tenant_period_idx
  ON partner_payouts (tenant_id, period_start DESC);

ALTER TABLE partner_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_payouts_select ON partner_payouts;
CREATE POLICY partner_payouts_select ON partner_payouts FOR SELECT
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS partner_payouts_insert ON partner_payouts;
CREATE POLICY partner_payouts_insert ON partner_payouts FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS partner_payouts_update ON partner_payouts;
CREATE POLICY partner_payouts_update ON partner_payouts FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS partner_payouts_delete ON partner_payouts;
CREATE POLICY partner_payouts_delete ON partner_payouts FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  )
);

-- Realtime publication so the dashboard updates live when someone marks
-- a payout as paid.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE partner_payouts;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

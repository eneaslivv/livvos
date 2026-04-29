-- =============================================
-- Withdrawals (retiros de fondos)
--
-- Tracks money taken out of the business: gross amount, transfer fee,
-- net received. fee_percentage and net_amount are computed columns so
-- aggregations are consistent across the UI.
-- =============================================

CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  transfer_fee NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0),
  net_amount NUMERIC(14, 2) GENERATED ALWAYS AS (amount - transfer_fee) STORED,
  fee_percentage NUMERIC(6, 3) GENERATED ALWAYS AS (
    CASE WHEN amount > 0 THEN ROUND((transfer_fee / amount) * 100, 3) ELSE 0 END
  ) STORED,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL DEFAULT 'bank',
  destination TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT withdrawals_fee_lte_amount CHECK (transfer_fee <= amount)
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_tenant_date ON withdrawals(tenant_id, date DESC);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "withdrawals_select_policy" ON withdrawals;
CREATE POLICY "withdrawals_select_policy" ON withdrawals
FOR SELECT USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "withdrawals_insert_policy" ON withdrawals;
CREATE POLICY "withdrawals_insert_policy" ON withdrawals
FOR INSERT WITH CHECK (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "withdrawals_update_policy" ON withdrawals;
CREATE POLICY "withdrawals_update_policy" ON withdrawals
FOR UPDATE USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "withdrawals_delete_policy" ON withdrawals;
CREATE POLICY "withdrawals_delete_policy" ON withdrawals
FOR DELETE USING (can_access_tenant(tenant_id));

GRANT ALL ON withdrawals TO authenticated;

DROP TRIGGER IF EXISTS withdrawals_updated_at ON withdrawals;
CREATE TRIGGER withdrawals_updated_at
  BEFORE UPDATE ON withdrawals
  FOR EACH ROW EXECUTE FUNCTION update_finance_timestamps();

-- Add to realtime publication so the frontend hears INSERT/UPDATE/DELETE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'withdrawals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE withdrawals;
  END IF;
END$$;

NOTIFY pgrst, 'reload config';

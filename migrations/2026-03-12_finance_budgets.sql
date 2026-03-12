-- ============================================================
-- Finance Module: Budgets table
-- Date: 2026-03-12
-- Description: Creates budgets table for fund/investment tracking
--              with customizable categories and period-based allocation.
--              Links expenses to budgets via budget_id FK.
-- ============================================================

-- 1. BUDGETS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  allocated_amount NUMERIC NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  category TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  icon TEXT NOT NULL DEFAULT 'wallet',
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'quarterly', 'yearly', 'one-time')),
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_budgets_tenant_id ON budgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
CREATE INDEX IF NOT EXISTS idx_budgets_is_active ON budgets(is_active);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period);

-- RLS
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budgets_select_policy" ON budgets;
CREATE POLICY "budgets_select_policy" ON budgets
FOR SELECT USING (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "budgets_insert_policy" ON budgets;
CREATE POLICY "budgets_insert_policy" ON budgets
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "budgets_update_policy" ON budgets;
CREATE POLICY "budgets_update_policy" ON budgets
FOR UPDATE USING (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "budgets_delete_policy" ON budgets;
CREATE POLICY "budgets_delete_policy" ON budgets
FOR DELETE USING (
  can_access_tenant(tenant_id)
);

GRANT ALL ON budgets TO authenticated;

-- Updated_at trigger (reuse existing function if available)
CREATE OR REPLACE FUNCTION update_budgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS budgets_updated_at ON budgets;
CREATE TRIGGER budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_budgets_updated_at();

-- 2. LINK EXPENSES TO BUDGETS
-- ============================================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_budget_id ON expenses(budget_id);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload config';

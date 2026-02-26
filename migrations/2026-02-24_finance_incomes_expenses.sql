-- ============================================================
-- Finance Module: Incomes, Expenses & Installments tables
-- Date: 2026-02-24
-- Description: Creates tables for income/expense tracking with
--              installment support, linked to clients & projects
-- ============================================================

-- 1. INCOMES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  concept TEXT NOT NULL DEFAULT '',
  total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'partial', 'pending', 'overdue')),
  due_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_incomes_tenant_id ON incomes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incomes_client_id ON incomes(client_id);
CREATE INDEX IF NOT EXISTS idx_incomes_project_id ON incomes(project_id);
CREATE INDEX IF NOT EXISTS idx_incomes_status ON incomes(status);
CREATE INDEX IF NOT EXISTS idx_incomes_due_date ON incomes(due_date);

-- RLS
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incomes_select_policy" ON incomes;
CREATE POLICY "incomes_select_policy" ON incomes
FOR SELECT USING (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "incomes_insert_policy" ON incomes;
CREATE POLICY "incomes_insert_policy" ON incomes
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "incomes_update_policy" ON incomes;
CREATE POLICY "incomes_update_policy" ON incomes
FOR UPDATE USING (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "incomes_delete_policy" ON incomes;
CREATE POLICY "incomes_delete_policy" ON incomes
FOR DELETE USING (
  can_access_tenant(tenant_id)
);

GRANT ALL ON incomes TO authenticated;

-- 2. INSTALLMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  income_id UUID NOT NULL REFERENCES incomes(id) ON DELETE CASCADE,
  number INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_installments_income_id ON installments(income_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);

-- RLS (inherit access from parent income)
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "installments_select_policy" ON installments;
CREATE POLICY "installments_select_policy" ON installments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM incomes
    WHERE incomes.id = installments.income_id
    AND can_access_tenant(incomes.tenant_id)
  )
);

DROP POLICY IF EXISTS "installments_insert_policy" ON installments;
CREATE POLICY "installments_insert_policy" ON installments
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM incomes
    WHERE incomes.id = installments.income_id
    AND can_access_tenant(incomes.tenant_id)
  )
);

DROP POLICY IF EXISTS "installments_update_policy" ON installments;
CREATE POLICY "installments_update_policy" ON installments
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM incomes
    WHERE incomes.id = installments.income_id
    AND can_access_tenant(incomes.tenant_id)
  )
);

DROP POLICY IF EXISTS "installments_delete_policy" ON installments;
CREATE POLICY "installments_delete_policy" ON installments
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM incomes
    WHERE incomes.id = installments.income_id
    AND can_access_tenant(incomes.tenant_id)
  )
);

GRANT ALL ON installments TO authenticated;

-- 3. EXPENSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'General',
  subcategory TEXT NOT NULL DEFAULT '',
  concept TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT NOT NULL DEFAULT 'General',
  vendor TEXT NOT NULL DEFAULT '',
  recurring BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON expenses(recurring);

-- RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select_policy" ON expenses;
CREATE POLICY "expenses_select_policy" ON expenses
FOR SELECT USING (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "expenses_insert_policy" ON expenses;
CREATE POLICY "expenses_insert_policy" ON expenses
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "expenses_update_policy" ON expenses;
CREATE POLICY "expenses_update_policy" ON expenses
FOR UPDATE USING (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "expenses_delete_policy" ON expenses;
CREATE POLICY "expenses_delete_policy" ON expenses
FOR DELETE USING (
  can_access_tenant(tenant_id)
);

GRANT ALL ON expenses TO authenticated;

-- 4. AUTO-UPDATE TIMESTAMPS TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_finance_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS incomes_updated_at ON incomes;
CREATE TRIGGER incomes_updated_at
  BEFORE UPDATE ON incomes
  FOR EACH ROW EXECUTE FUNCTION update_finance_timestamps();

DROP TRIGGER IF EXISTS installments_updated_at ON installments;
CREATE TRIGGER installments_updated_at
  BEFORE UPDATE ON installments
  FOR EACH ROW EXECUTE FUNCTION update_finance_timestamps();

DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_finance_timestamps();

-- 5. AUTO-UPDATE INCOME STATUS based on installment statuses
-- ============================================================

CREATE OR REPLACE FUNCTION update_income_status()
RETURNS TRIGGER AS $$
DECLARE
  total_count INTEGER;
  paid_count INTEGER;
  overdue_count INTEGER;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'paid'),
    COUNT(*) FILTER (WHERE status = 'overdue')
  INTO total_count, paid_count, overdue_count
  FROM installments
  WHERE income_id = COALESCE(NEW.income_id, OLD.income_id);

  IF total_count = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE incomes SET status = CASE
    WHEN paid_count = total_count THEN 'paid'
    WHEN overdue_count > 0 THEN 'overdue'
    WHEN paid_count > 0 THEN 'partial'
    ELSE 'pending'
  END
  WHERE id = COALESCE(NEW.income_id, OLD.income_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS installment_status_sync ON installments;
CREATE TRIGGER installment_status_sync
  AFTER INSERT OR UPDATE OR DELETE ON installments
  FOR EACH ROW EXECUTE FUNCTION update_income_status();

-- 6. Notify PostgREST to reload schema cache
-- ============================================================
NOTIFY pgrst, 'reload config';

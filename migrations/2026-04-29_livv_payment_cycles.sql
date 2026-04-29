-- =============================================
-- LIVV Payment Cycles + Profit Distribution + Sales Pipeline
--
-- Mirrors the LIVV Creative Studio finance spreadsheet:
--   • finance_partners — co-founders / profit-share recipients
--   • finance_payment_cycles — monthly payment cycles (1 or 2 per month)
--   • finance_cycle_revenues — per-client revenue lines inside a cycle
--   • finance_cycle_costs — tool / service cost lines inside a cycle
--   • finance_cycle_distributions — partner entitlement / sent / balance
--   • finance_pipeline_projects — Ventas & Utilidades (project-level pipeline)
--
-- Net Revenue, Net Profit, Profit Margin, Distributable Amount, and
-- Pending columns are GENERATED so derived values are always consistent.
-- =============================================

-- ─── Partners ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_split_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0
    CHECK (default_split_percentage >= 0 AND default_split_percentage <= 100),
  color TEXT NOT NULL DEFAULT '#10b981',
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_partners_tenant ON finance_partners(tenant_id, sort_order);

-- ─── Payment Cycles ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_payment_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  period_month DATE NOT NULL,
  cycle_number SMALLINT NOT NULL DEFAULT 1 CHECK (cycle_number IN (1, 2)),
  period_description TEXT NOT NULL DEFAULT '',
  processing_fee_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.047
    CHECK (processing_fee_rate >= 0 AND processing_fee_rate <= 1),
  marketing_budget NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (marketing_budget >= 0),
  prior_balance_eneas NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'closed')),
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_month, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_finance_payment_cycles_tenant_period
  ON finance_payment_cycles(tenant_id, period_month DESC, cycle_number);

-- ─── Cycle Revenue Lines ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_cycle_revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES finance_payment_cycles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_cycle_revenues_cycle ON finance_cycle_revenues(cycle_id);
CREATE INDEX IF NOT EXISTS idx_finance_cycle_revenues_tenant ON finance_cycle_revenues(tenant_id);

-- ─── Cycle Cost Lines ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_cycle_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES finance_payment_cycles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  externally_covered BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_cycle_costs_cycle ON finance_cycle_costs(cycle_id);
CREATE INDEX IF NOT EXISTS idx_finance_cycle_costs_tenant ON finance_cycle_costs(tenant_id);

-- ─── Cycle Distributions ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_cycle_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES finance_payment_cycles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES finance_partners(id) ON DELETE SET NULL,
  partner_name TEXT NOT NULL,
  split_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0
    CHECK (split_percentage >= 0 AND split_percentage <= 100),
  sent_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  prior_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_cycle_distributions_cycle ON finance_cycle_distributions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_finance_cycle_distributions_tenant ON finance_cycle_distributions(tenant_id);

-- ─── Pipeline Projects (Ventas & Utilidades) ────────────────────────

CREATE TABLE IF NOT EXISTS finance_pipeline_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_group TEXT NOT NULL DEFAULT 'Otros Clientes',
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  collected_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (collected_amount >= 0),
  pending_amount NUMERIC(14, 2) GENERATED ALWAYS AS (
    GREATEST(total_amount - collected_amount, 0)
  ) STORED,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'closed', 'lost')),
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_pipeline_tenant_group
  ON finance_pipeline_projects(tenant_id, client_group, sort_order);

-- ─── RLS ────────────────────────────────────────────────────────────

ALTER TABLE finance_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_payment_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_cycle_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_cycle_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_cycle_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_pipeline_projects ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finance_partners',
    'finance_payment_cycles',
    'finance_cycle_revenues',
    'finance_cycle_costs',
    'finance_cycle_distributions',
    'finance_pipeline_projects'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select_policy" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_insert_policy" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update_policy" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete_policy" ON %1$I', t);

    EXECUTE format(
      'CREATE POLICY "%1$s_select_policy" ON %1$I FOR SELECT USING (can_access_tenant(tenant_id))', t);
    EXECUTE format(
      'CREATE POLICY "%1$s_insert_policy" ON %1$I FOR INSERT WITH CHECK (can_access_tenant(tenant_id))', t);
    EXECUTE format(
      'CREATE POLICY "%1$s_update_policy" ON %1$I FOR UPDATE USING (can_access_tenant(tenant_id))', t);
    EXECUTE format(
      'CREATE POLICY "%1$s_delete_policy" ON %1$I FOR DELETE USING (can_access_tenant(tenant_id))', t);

    EXECUTE format('GRANT ALL ON %I TO authenticated', t);
  END LOOP;
END$$;

-- ─── Updated_at Triggers ────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finance_partners',
    'finance_payment_cycles',
    'finance_cycle_revenues',
    'finance_cycle_costs',
    'finance_cycle_distributions',
    'finance_pipeline_projects'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_updated_at ON %1$I', t);
    EXECUTE format(
      'CREATE TRIGGER %1$s_updated_at BEFORE UPDATE ON %1$I
       FOR EACH ROW EXECUTE FUNCTION update_finance_timestamps()', t);
  END LOOP;
END$$;

-- ─── Realtime Publication ───────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finance_partners',
    'finance_payment_cycles',
    'finance_cycle_revenues',
    'finance_cycle_costs',
    'finance_cycle_distributions',
    'finance_pipeline_projects'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END$$;

-- ─── Seed default partners (Eneas / Luis) when tenant has none ─────
-- Idempotent: only inserts if no partners exist for the tenant yet.

INSERT INTO finance_partners (tenant_id, name, default_split_percentage, color, sort_order)
SELECT t.id, 'Eneas', 73.60, '#10b981', 0
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM finance_partners p WHERE p.tenant_id = t.id
);

INSERT INTO finance_partners (tenant_id, name, default_split_percentage, color, sort_order)
SELECT t.id, 'Luis', 26.40, '#6366f1', 1
FROM tenants t
WHERE EXISTS (
  SELECT 1 FROM finance_partners p
  WHERE p.tenant_id = t.id AND p.name = 'Eneas'
)
AND NOT EXISTS (
  SELECT 1 FROM finance_partners p
  WHERE p.tenant_id = t.id AND p.name = 'Luis'
);

NOTIFY pgrst, 'reload config';

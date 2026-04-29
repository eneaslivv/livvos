-- =============================================
-- LIVV Creative Studio — seed initial data
--
-- Idempotent: only inserts rows that don't already exist.
-- Targets the tenant where the Eneas+Luis partners are already seeded
-- (i.e. the active LIVV tenant). If you have multiple tenants and want
-- to target a specific one, replace the tenant CTE with an explicit ID.
--
-- Math reference (per the spreadsheet):
--   Net Revenue = Total Revenue × (1 - processing_fee_rate)
--   Net Profit  = Net Revenue - Total Costs
--   Distributable = Net Profit - Marketing
--   Eneas / Luis split percentages back-calculated to match the
--   spreadsheet's "TO ENEAS" / "TO LUIS" amounts exactly.
-- =============================================

WITH target_tenant AS (
  SELECT DISTINCT tenant_id
  FROM finance_partners
  WHERE name = 'Eneas'
  LIMIT 1
)
-- ─── Pipeline projects (Ventas & Utilidades) ─────────────────
INSERT INTO finance_pipeline_projects (
  tenant_id, client_group, client_name, project_name,
  total_amount, collected_amount, status, sort_order
)
SELECT t.tenant_id, v.client_group, v.client_name, v.project_name,
       v.total_amount, v.collected_amount, v.status, v.sort_order
FROM target_tenant t
CROSS JOIN (VALUES
  -- Christie group
  ('Christie', 'Christie King', 'Cremona Capital',   1900.00,  950.00, 'in_progress'::TEXT, 0),
  ('Christie', 'Christie King', 'Mobilita',          1800.00, 1800.00, 'closed',             1),
  ('Christie', 'Christie King', 'Back Office Team',  2100.00, 1050.00, 'in_progress',        2),
  ('Christie', 'Christie King', 'The Bloom',         1500.00,    0.00, 'open',               3),
  ('Christie', 'Christie King', 'Ethos Group',          0.00,    0.00, 'open',               4),
  ('Christie', 'Christie King', 'Frenetic Sports',   7000.00, 3500.00, 'in_progress',        5),
  ('Christie', 'Christie King', 'CK Studio',         2200.00, 1100.00, 'in_progress',        6),
  -- Otros Clientes
  ('Otros Clientes', 'Wendell', 'Wendell',           4300.00, 2300.00, 'in_progress',       10),
  ('Otros Clientes', 'Joseph',  'Joseph',            2000.00, 1000.00, 'in_progress',       11)
) AS v(client_group, client_name, project_name, total_amount, collected_amount, status, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM finance_pipeline_projects p
  WHERE p.tenant_id = t.tenant_id AND p.project_name = v.project_name AND p.client_group = v.client_group
);

-- ─── Payment cycles ──────────────────────────────────────────
-- Feb cycle 1, Marzo cycle 1, Abril cycle 1, Abril cycle 2, Mayo cycle 1
WITH target_tenant AS (
  SELECT DISTINCT tenant_id FROM finance_partners WHERE name = 'Eneas' LIMIT 1
)
INSERT INTO finance_payment_cycles (
  tenant_id, label, period_month, cycle_number, period_description,
  processing_fee_rate, marketing_budget, prior_balance_eneas, status, notes
)
SELECT t.tenant_id, c.label, c.period_month::DATE, c.cycle_number, c.period_description,
       c.processing_fee_rate, c.marketing_budget, c.prior_balance_eneas, c.status, c.notes
FROM target_tenant t
CROSS JOIN (VALUES
  ('1er pago (Febrero)',   '2026-02-01', 1, 'Period: Febrero — primer pago',     0.0470, 0.00, 128.00, 'closed'::TEXT, ''),
  ('2do pago (Marzo)',     '2026-03-01', 1, 'Period: Marzo',                     0.0470, 0.00,   0.00, 'closed',         ''),
  ('Abril — 1er pago',     '2026-04-01', 1, 'Period: Abril — primer pago (hasta Apr 6)', 0.0470, 0.00, 0.00, 'closed', ''),
  ('Abril — 2do pago',     '2026-04-01', 2, 'Period: Abril — segundo pago',      0.0470, 0.00,   0.00, 'draft',          ''),
  ('Mayo',                 '2026-05-01', 1, 'Period: Mayo',                      0.0470, 0.00,   0.00, 'draft',          '')
) AS c(label, period_month, cycle_number, period_description, processing_fee_rate, marketing_budget, prior_balance_eneas, status, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM finance_payment_cycles pc
  WHERE pc.tenant_id = t.tenant_id
    AND pc.period_month = c.period_month::DATE
    AND pc.cycle_number = c.cycle_number
);

-- ─── Per-cycle: one consolidated revenue line + one cost line ──
-- (User can split into per-client / per-tool detail later in the UI.)
-- Values back-calculated so net_profit / distributable match the spreadsheet.

-- Helper CTE pattern: insert revenue line if not present.
INSERT INTO finance_cycle_revenues (cycle_id, tenant_id, client_name, amount, notes, sort_order)
SELECT pc.id, pc.tenant_id, 'Total ingresos del periodo', v.amount, v.notes, 0
FROM finance_payment_cycles pc
JOIN (VALUES
  ('2026-02-01'::DATE, 1, 2203.57, 'WMF + CK Studio + KRU Foods + others (consolidated)'),
  ('2026-03-01'::DATE, 1, 3987.41, 'WMF + CK Studio + KRU Foods + others (consolidated)'),
  ('2026-04-01'::DATE, 1, 3512.07, 'WMF + CK Studio + KRU Foods + others (consolidated)'),
  ('2026-05-01'::DATE, 1, 3094.44, 'WMF + CK Studio + KRU Foods + others (consolidated)')
) AS v(period_month, cycle_number, amount, notes)
  ON pc.period_month = v.period_month AND pc.cycle_number = v.cycle_number
WHERE NOT EXISTS (
  SELECT 1 FROM finance_cycle_revenues r WHERE r.cycle_id = pc.id
);

-- Tools / Services (consolidated cost line)
INSERT INTO finance_cycle_costs (cycle_id, tenant_id, tool_name, cost, notes, externally_covered, sort_order)
SELECT pc.id, pc.tenant_id, 'Tools & Services (consolidated)', v.cost, v.notes, FALSE, 0
FROM finance_payment_cycles pc
JOIN (VALUES
  ('2026-02-01'::DATE, 1, 451.00, 'Lovable, Webflow, Antigravity, Elevenlabs, Google Workspace ×3, Claude, Flora, Aura, Jitter, Higgsfield, Supabase, V0, Contra, Cleanshot, APIs'),
  ('2026-03-01'::DATE, 1, 368.00, 'Lovable, Webflow, Antigravity, Elevenlabs, Google Workspace ×3, Claude, Flora, Aura, Jitter, Higgsfield, Supabase, V0, Contra, Cleanshot, APIs'),
  ('2026-04-01'::DATE, 1, 565.00, 'Abril 1er pago — share of monthly tools')
) AS v(period_month, cycle_number, cost, notes)
  ON pc.period_month = v.period_month AND pc.cycle_number = v.cycle_number
WHERE NOT EXISTS (
  SELECT 1 FROM finance_cycle_costs cc WHERE cc.cycle_id = pc.id
);

-- ─── Distributions per cycle ─────────────────────────────────
-- Splits are exact back-calculations from the spreadsheet's TO ENEAS / TO LUIS amounts.
-- Cycle defaults inserted by createPaymentCycle() are overwritten below where conflicts exist.

-- Eneas distributions
INSERT INTO finance_cycle_distributions (
  cycle_id, tenant_id, partner_id, partner_name, split_percentage, sent_amount, prior_balance, sort_order
)
SELECT pc.id, pc.tenant_id, p.id, 'Eneas', v.split_pct, 0, v.prior, 0
FROM finance_payment_cycles pc
JOIN finance_partners p ON p.tenant_id = pc.tenant_id AND p.name = 'Eneas'
JOIN (VALUES
  ('2026-02-01'::DATE, 1, 70.000, 0.00),
  ('2026-03-01'::DATE, 1, 73.720, 0.00),
  ('2026-04-01'::DATE, 1, 73.020, 0.00),
  ('2026-05-01'::DATE, 1, 80.130, 0.00)
) AS v(period_month, cycle_number, split_pct, prior)
  ON pc.period_month = v.period_month AND pc.cycle_number = v.cycle_number
WHERE NOT EXISTS (
  SELECT 1 FROM finance_cycle_distributions d
  WHERE d.cycle_id = pc.id AND d.partner_name = 'Eneas'
);

-- Luis distributions
INSERT INTO finance_cycle_distributions (
  cycle_id, tenant_id, partner_id, partner_name, split_percentage, sent_amount, prior_balance, sort_order
)
SELECT pc.id, pc.tenant_id, p.id, 'Luis', v.split_pct, 0, 0, 1
FROM finance_payment_cycles pc
JOIN finance_partners p ON p.tenant_id = pc.tenant_id AND p.name = 'Luis'
JOIN (VALUES
  ('2026-02-01'::DATE, 1, 30.000),
  ('2026-03-01'::DATE, 1, 26.280),
  ('2026-04-01'::DATE, 1, 26.980),
  ('2026-05-01'::DATE, 1, 19.870)
) AS v(period_month, cycle_number, split_pct)
  ON pc.period_month = v.period_month AND pc.cycle_number = v.cycle_number
WHERE NOT EXISTS (
  SELECT 1 FROM finance_cycle_distributions d
  WHERE d.cycle_id = pc.id AND d.partner_name = 'Luis'
);

NOTIFY pgrst, 'reload config';

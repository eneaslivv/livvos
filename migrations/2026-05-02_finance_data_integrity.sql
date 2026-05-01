-- =============================================
-- FINANCE DATA INTEGRITY
-- =============================================
-- Two purposes:
-- 1. One-shot cleanup: nullify any orphaned client_id / project_id / budget_id
--    on expenses/incomes (FKs already use ON DELETE SET NULL but legacy rows
--    inserted before the FKs existed could still hold dangling UUIDs).
-- 2. Triggers that enforce tenant consistency on every INSERT/UPDATE — the
--    foreign keys guarantee the referenced row exists, but NOT that it belongs
--    to the same tenant. Without this an AI-fabricated UUID belonging to
--    another tenant would slip past the FK and pollute the user's data.

-- ─── 1. Cleanup orphans (defensive — should be no-op if FKs were always present) ───

UPDATE expenses SET client_id = NULL
WHERE client_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM clients WHERE clients.id = expenses.client_id);

UPDATE expenses SET project_id = NULL
WHERE project_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM projects WHERE projects.id = expenses.project_id);

UPDATE expenses SET budget_id = NULL
WHERE budget_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM budgets WHERE budgets.id = expenses.budget_id);

UPDATE incomes SET client_id = NULL
WHERE client_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM clients WHERE clients.id = incomes.client_id);

UPDATE incomes SET project_id = NULL
WHERE project_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM projects WHERE projects.id = incomes.project_id);

-- Same for cross-tenant references that slipped past the FK (FK only checks
-- existence, not tenant). NULL them out so the trigger doesn't reject every
-- subsequent UPDATE on those rows.
UPDATE expenses SET client_id = NULL
WHERE client_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = expenses.client_id
      AND clients.tenant_id = expenses.tenant_id
  );

UPDATE expenses SET project_id = NULL
WHERE project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = expenses.project_id
      AND projects.tenant_id = expenses.tenant_id
  );

UPDATE expenses SET budget_id = NULL
WHERE budget_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM budgets
    WHERE budgets.id = expenses.budget_id
      AND budgets.tenant_id = expenses.tenant_id
  );

UPDATE incomes SET client_id = NULL
WHERE client_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = incomes.client_id
      AND clients.tenant_id = incomes.tenant_id
  );

UPDATE incomes SET project_id = NULL
WHERE project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = incomes.project_id
      AND projects.tenant_id = incomes.tenant_id
  );

-- ─── 2. Tenant-consistency triggers ───────────────────────────────

CREATE OR REPLACE FUNCTION enforce_expense_tenant_consistency()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clients WHERE id = NEW.client_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'client_id % does not belong to tenant %', NEW.client_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM projects WHERE id = NEW.project_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'project_id % does not belong to tenant %', NEW.project_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.budget_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM budgets WHERE id = NEW.budget_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'budget_id % does not belong to tenant %', NEW.budget_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS expenses_tenant_consistency ON expenses;
CREATE TRIGGER expenses_tenant_consistency
  BEFORE INSERT OR UPDATE OF client_id, project_id, budget_id, tenant_id ON expenses
  FOR EACH ROW EXECUTE FUNCTION enforce_expense_tenant_consistency();

CREATE OR REPLACE FUNCTION enforce_income_tenant_consistency()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clients WHERE id = NEW.client_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'client_id % does not belong to tenant %', NEW.client_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM projects WHERE id = NEW.project_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'project_id % does not belong to tenant %', NEW.project_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS incomes_tenant_consistency ON incomes;
CREATE TRIGGER incomes_tenant_consistency
  BEFORE INSERT OR UPDATE OF client_id, project_id, tenant_id ON incomes
  FOR EACH ROW EXECUTE FUNCTION enforce_income_tenant_consistency();

NOTIFY pgrst, 'reload schema';

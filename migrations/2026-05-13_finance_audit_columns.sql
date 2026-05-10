-- Track WHO last edited a finance row. Combined with the existing
-- updated_at timestamp this gives us a basic audit trail so when
-- somebody fixes a past-month entry we can see who touched it and when
-- ("queda todo bien marcado en el tiempo" — user feedback).
--
-- The column is nullable so existing rows aren't disrupted; the
-- trigger sets it on every UPDATE going forward.

ALTER TABLE incomes      ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE expenses     ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE installments ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION set_finance_updated_by()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- auth.uid() returns NULL when called outside a user context (e.g.
  -- service-role runs from edge functions). In that case we leave the
  -- column null rather than overwriting a previous user attribution.
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  -- Always touch updated_at so the existing 'last touched' indicator
  -- works even if the table didn't have its own trigger.
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incomes_set_updated_by      ON incomes;
DROP TRIGGER IF EXISTS trg_expenses_set_updated_by     ON expenses;
DROP TRIGGER IF EXISTS trg_installments_set_updated_by ON installments;

CREATE TRIGGER trg_incomes_set_updated_by
  BEFORE UPDATE ON incomes
  FOR EACH ROW EXECUTE FUNCTION set_finance_updated_by();

CREATE TRIGGER trg_expenses_set_updated_by
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_finance_updated_by();

CREATE TRIGGER trg_installments_set_updated_by
  BEFORE UPDATE ON installments
  FOR EACH ROW EXECUTE FUNCTION set_finance_updated_by();

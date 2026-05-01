-- =============================================
-- Recurring expenses: backfill ALL missing months
--
-- The previous version only created a copy for the current month. If you
-- created a recurring expense in January and didn't open the app until
-- April, February and March were never materialized.
--
-- This version loops month-by-month from the source's start month to the
-- current month and creates a copy for every missing one.
-- =============================================

CREATE OR REPLACE FUNCTION public.renew_recurring_expenses()
RETURNS INTEGER AS $$
DECLARE
  v_tenant UUID;
  v_rec RECORD;
  v_count INTEGER := 0;
  v_target_month DATE;
  v_source_month DATE;
  v_iter_month DATE;
  v_existing BOOLEAN;
BEGIN
  SELECT tenant_id INTO v_tenant FROM profiles WHERE id = auth.uid();
  IF v_tenant IS NULL THEN RETURN 0; END IF;

  v_target_month := date_trunc('month', CURRENT_DATE)::DATE;

  FOR v_rec IN
    SELECT * FROM expenses
    WHERE tenant_id = v_tenant
      AND recurring = true
      AND recurring_source_id IS NULL
  LOOP
    v_source_month := date_trunc('month', v_rec.date)::DATE;
    v_iter_month := (v_source_month + INTERVAL '1 month')::DATE;

    WHILE v_iter_month <= v_target_month LOOP
      SELECT EXISTS(
        SELECT 1 FROM expenses
        WHERE recurring_source_id = v_rec.id
          AND date >= v_iter_month
          AND date < (v_iter_month + INTERVAL '1 month')::DATE
      ) INTO v_existing;

      IF NOT v_existing THEN
        INSERT INTO expenses (
          tenant_id, category, subcategory, concept, amount, currency,
          date, project_id, project_name, vendor,
          recurring, status, budget_id, created_by, recurring_source_id
        ) VALUES (
          v_rec.tenant_id, v_rec.category, v_rec.subcategory, v_rec.concept,
          v_rec.amount, v_rec.currency,
          v_iter_month,
          v_rec.project_id, v_rec.project_name, v_rec.vendor,
          false,
          'paid',
          v_rec.budget_id, v_rec.created_by, v_rec.id
        );
        v_count := v_count + 1;
      END IF;

      v_iter_month := (v_iter_month + INTERVAL '1 month')::DATE;
    END LOOP;

    IF v_count > 0 THEN
      UPDATE expenses SET last_renewed_at = CURRENT_DATE, updated_at = now()
      WHERE id = v_rec.id;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.renew_recurring_expenses() TO authenticated;

NOTIFY pgrst, 'reload config';

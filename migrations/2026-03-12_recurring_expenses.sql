-- =============================================
-- Recurring expenses: auto-renewal system
-- =============================================

-- Track which expense was the source for a recurring copy
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_source_id UUID REFERENCES expenses(id) ON DELETE SET NULL;

-- Track the last time this recurring expense was renewed
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS last_renewed_at DATE;

-- Index for fast recurring lookups
CREATE INDEX IF NOT EXISTS idx_expenses_recurring_source ON expenses(recurring_source_id);

-- RPC: renew_recurring_expenses
-- For each recurring expense in the caller's tenant, checks if a copy
-- already exists for the current month. If not, creates one.
-- Returns the number of new expenses created.
CREATE OR REPLACE FUNCTION public.renew_recurring_expenses()
RETURNS INTEGER AS $$
DECLARE
  v_tenant UUID;
  v_rec RECORD;
  v_count INTEGER := 0;
  v_month_start DATE;
  v_existing BOOLEAN;
BEGIN
  -- Get caller's tenant
  SELECT tenant_id INTO v_tenant FROM profiles WHERE id = auth.uid();
  IF v_tenant IS NULL THEN RETURN 0; END IF;

  v_month_start := date_trunc('month', CURRENT_DATE)::DATE;

  -- Find all recurring expenses for this tenant
  FOR v_rec IN
    SELECT * FROM expenses
    WHERE tenant_id = v_tenant
      AND recurring = true
      AND recurring_source_id IS NULL  -- only originals, not copies
  LOOP
    -- Check if a copy already exists for this month
    SELECT EXISTS(
      SELECT 1 FROM expenses
      WHERE recurring_source_id = v_rec.id
        AND date >= v_month_start
        AND date < (v_month_start + INTERVAL '1 month')::DATE
    ) INTO v_existing;

    -- Also skip if the original itself is from this month
    IF v_rec.date >= v_month_start THEN
      v_existing := true;
    END IF;

    IF NOT v_existing THEN
      INSERT INTO expenses (
        tenant_id, category, subcategory, concept, amount, currency,
        date, project_id, project_name, client_id, vendor,
        recurring, status, budget_id, created_by, recurring_source_id
      ) VALUES (
        v_rec.tenant_id, v_rec.category, v_rec.subcategory, v_rec.concept,
        v_rec.amount, v_rec.currency,
        v_month_start,  -- first day of current month
        v_rec.project_id, v_rec.project_name, v_rec.client_id, v_rec.vendor,
        false,  -- the copy is NOT recurring (it's a generated instance)
        'pending',
        v_rec.budget_id, v_rec.created_by, v_rec.id
      );

      -- Mark the source as renewed
      UPDATE expenses SET last_renewed_at = CURRENT_DATE, updated_at = now()
      WHERE id = v_rec.id;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.renew_recurring_expenses() TO authenticated;

NOTIFY pgrst, 'reload config';

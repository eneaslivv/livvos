-- ============================================================================
-- expenses: allow negative amounts (partner-paid deductions / refunds)
-- ============================================================================
-- LIVV's accounting convention treats tools paid by a partner directly
-- (e.g. "Jitter -$19, Luis paga") as a negative line item that nets out
-- of the studio's total monthly costs. Same shape applies to refunds and
-- credits. The original `amount >= 0` check rejected these.
--
-- We replace the check with a sanity-only one (amount must be a real
-- number, not NaN). Sign is meaningful.
-- ============================================================================
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_amount_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_amount_check CHECK (amount = amount);

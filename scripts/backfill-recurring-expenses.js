// One-off backfill: materialize missing monthly copies of recurring expenses
// for every tenant. Idempotent. Also patches the renew_recurring_expenses
// RPC to match the live schema (the live `expenses` table has no client_id
// column, so the original RPC fails at INSERT time).
// Authorized by user explicitly ("DALE") on 2026-05-01.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sql = `
DO $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
  v_target_month DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_source_month DATE;
  v_iter_month DATE;
  v_existing BOOLEAN;
BEGIN
  FOR v_rec IN
    SELECT * FROM expenses
    WHERE recurring = true AND recurring_source_id IS NULL
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
          v_rec.amount, v_rec.currency, v_iter_month,
          v_rec.project_id, v_rec.project_name, v_rec.vendor,
          false, 'paid', v_rec.budget_id, v_rec.created_by, v_rec.id
        );
        v_count := v_count + 1;
      END IF;
      v_iter_month := (v_iter_month + INTERVAL '1 month')::DATE;
    END LOOP;
  END LOOP;
  UPDATE expenses SET last_renewed_at = CURRENT_DATE, updated_at = now()
  WHERE recurring = true AND recurring_source_id IS NULL;
END$$;

-- Patch RPC to match the live schema (no client_id column)
CREATE OR REPLACE FUNCTION public.renew_recurring_expenses()
RETURNS INTEGER AS $func$
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
          v_rec.amount, v_rec.currency, v_iter_month,
          v_rec.project_id, v_rec.project_name, v_rec.vendor,
          false, 'paid', v_rec.budget_id, v_rec.created_by, v_rec.id
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
$func$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.renew_recurring_expenses() TO authenticated;
NOTIFY pgrst, 'reload config';
`;

async function main() {
  const { error } = await supabase.rpc('exec_sql', { sql });
  if (error) { console.error('exec_sql error:', error); process.exit(1); }
  const { data, error: e2 } = await supabase
    .from('expenses')
    .select('recurring, recurring_source_id', { count: 'exact', head: false });
  if (e2) { console.error('count error:', e2); process.exit(1); }
  const sources = data.filter(r => r.recurring && !r.recurring_source_id).length;
  const copies = data.filter(r => r.recurring_source_id).length;
  console.log(`recurring sources: ${sources}`);
  console.log(`auto-generated copies: ${copies}`);
  console.log('done.');
}
main();

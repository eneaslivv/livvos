# SCHEMA_GAPS.md — Auditor output

> What the prompts assume vs. what the real Livv schema provides.
> Cross-referenced May 2026.

---

## Critical gaps (block writes)

### G-1 · `finances` vs `finance_records` duplicate
- **Source:** `cloud-code/SYSTEM.md` line 34, `finance-agent.md` line 47.
- **Resolution:** `2026-01-20_create_finances_table.sql` is the canonical. Drop or migrate `finance_records`. Until then, `Marina` reads from `finances` only.
- **Action item:** add a `DROP TABLE finance_records` step to the next migration once data is migrated.

### G-2 · `activity_logs` vs `activities` duplicate
- **Source:** `cloud-code/SYSTEM.md` line 35.
- **Resolution:** Canonical is `activity_logs` (referenced by all later migrations). `Solara` writes follow-up history to both `leads.history` (per-lead) AND `activity_logs` (tenant feed).

### G-3 · `leads.tenant_id` not in original `supabase_schema.sql`
- **Source:** `supabase_schema.sql` shows `leads` without `tenant_id`. Added via later migration.
- **Resolution:** Confirm in production DB that all rows have `tenant_id` populated. Run:
  ```sql
  SELECT COUNT(*) FROM leads WHERE tenant_id IS NULL;
  ```
  Must return 0 before agents are allowed to write.

### G-4 · No lead status state machine in DB
- **Source:** `crm-agent.md` line 55.
- **Resolution:** Agents enforce in app code (`skills-solara/deal-stage-coach.md`). Add a CHECK constraint:
  ```sql
  ALTER TABLE leads ADD CONSTRAINT leads_status_chk
    CHECK (status IN ('new','contacted','qualified','proposal','negotiation','won','lost'));
  ```
- **Risk:** prompts reference these statuses; if a tenant has rows with unexpected values, queries that filter by enum will silently drop them.

### G-5 · Plain-text credentials in `project_credentials`
- **Source:** `cloud-code/SYSTEM.md` line 37.
- **Resolution:** Already addressed by `2026-01-20_credential_encryption.sql`. Verify the migration ran in production.

---

## Required-for-this-work additions

### G-6 · `tenant_config.agent_mode`
Added by `db/migrations/01_agents_schema.sql`. Defaults to `'multi'`. Controls whether the dock shows 3 personalities or consolidates.

### G-7 · `tenant_config.default_currency_code`
Added by same migration. Used by Marina's `currency-formatter` skill.

### G-8 · `tenant_config.stage_probabilities`
Added by same migration. Override Nova's defaults per tenant.

### G-9 · `tenant_config.north_star_metric`
Added by same migration. Nova writes this.

### G-10 · The 11 `agents.*` tables
Added by same migration. Without these, audit/idempotency/kill-switch don't have storage.

---

## High-severity gaps (degrade UX, do not block)

### G-11 · No `invoices` standalone table
- **Symptom:** Marina's `draft_invoice_from_proposal` writes to `proposals.invoice_data` JSONB.
- **Plan:** ship a real `invoices` table in v2.

### G-12 · No `expenses` standalone table
- **Symptom:** Marina aggregates `direct_expenses` + `imputed_expenses` on `finances`. Cannot answer "show me individual expenses".
- **Plan:** ship `expenses(id, project_id, category, amount, occurred_at, ...)` in v2.

### G-13 · `web_analytics` is single-row, not time-series
- **Symptom:** `total_visits` and `unique_visitors` overwrite. Nova cannot show week-over-week from this table alone.
- **Workaround:** `daily_visits` JSONB has the time series. Nova reads from there.
- **Plan:** migrate to `web_analytics_daily(date, ...)` with one row per day.

### G-14 · `proposals` may not have `accepted_at` / `payment_terms_days`
- **Source:** `2026-01-28_proposals.sql` not fully inspected.
- **Action:** verify these columns; Marina's cash-projection skill assumes them.

### G-15 · No `milestones` migration confirmed
- **Source:** `cloud-code/agents/project-agent.md` references but core migrations not located.
- **Action:** confirm or remove reference.

### G-16 · `projects.client` is freetext (no FK)
- **Symptom:** Nova's source-attribution joins `projects.client = leads.company` best-effort. Surfacing this caveat in her output.
- **Plan:** add `projects.client_id` FK to `clients(id)` in v2 + backfill.

---

## Medium-severity gaps

### G-17 · No `currency` column on `finances`
- **Symptom:** Marina assumes tenant default. Mixed-currency projects within a tenant cannot be represented.
- **Plan:** add `finances.currency TEXT DEFAULT (tenant default)` for multi-currency tenants.

### G-18 · `ai_analysis` schema not enforced
- **Symptom:** Solara reads `ai_analysis.decision_maker_confirmed`, `budget_signal`, etc. — these are by-convention only.
- **Plan:** add JSON Schema validation via DB trigger or move to typed columns.

### G-19 · `permission_audit_log` records permission checks but not WRITE outcomes
- **Symptom:** different log than `agents.audit_log`. Both will exist.
- **Plan:** keep both; document the distinction (perm-check log vs action-result log).

### G-20 · RLS coverage incomplete
- **Source:** `2026-01-20_comprehensive_rls_policies.sql` is partial.
- **Plan:** before going live, run the RLS coverage script under `scripts/fix-auth-rls.sql` and verify every domain table has tenant-isolated policies.

---

## How the agents handle gaps at runtime

When a prompt-referenced column or table doesn't exist, the tool layer returns:
```json
{"ok":false,"code":"SCHEMA_GAP","message":"column finances.currency not present","hint":"Esta cuenta no soporta multi-moneda todavía"}
```
And the agent surfaces the hint. Never invents the column, never returns a fake value.

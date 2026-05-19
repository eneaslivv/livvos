-- Cross-module automations (4 triggers):
--   1. Lead won → create project + invoice (sales_leads → projects, incomes, installments)
--   2. Project completed → seed case-study content draft (projects → content_pieces)
--   3. Outreach response → advance lead status (sales_outreach → sales_leads)
--   4. Content published → stamp engagement_metrics placeholder (content_pieces)
--
-- All defensive: only fire on TRUE transitions, write scoped by tenant_id,
-- include dedup so re-toggling status doesn't create duplicates.
-- (See applied migration for full body.)

ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS spawned_project_id UUID;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS spawned_income_id  UUID;

-- Function + trigger definitions live in the applied migration in
-- the Supabase project; this file is documentation. See:
--   • sales_lead_won_to_project
--   • project_completed_to_case_study
--   • outreach_response_to_lead_status
--   • content_published_metric_placeholder

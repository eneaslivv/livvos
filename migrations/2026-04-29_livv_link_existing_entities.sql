-- =============================================
-- LIVV — connect pipeline + cycle revenue to existing clients/projects
--
-- Adds project_id FK on finance_pipeline_projects and auto-populates
-- client_id / project_id by case-insensitive name match against the
-- existing `clients` and `projects` tables. Idempotent.
-- =============================================

-- ─── Add project_id FK on pipeline ──────────────────────────
ALTER TABLE finance_pipeline_projects
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_pipeline_project_id
  ON finance_pipeline_projects(project_id);

-- ─── Auto-link pipeline.client_id by name match ─────────────
UPDATE finance_pipeline_projects pp
SET client_id = c.id
FROM clients c
WHERE pp.client_id IS NULL
  AND pp.tenant_id = c.tenant_id
  AND TRIM(LOWER(pp.client_name)) = TRIM(LOWER(c.name));

-- ─── Auto-link pipeline.project_id by title match ───────────
UPDATE finance_pipeline_projects pp
SET project_id = p.id
FROM projects p
WHERE pp.project_id IS NULL
  AND pp.tenant_id = p.tenant_id
  AND TRIM(LOWER(pp.project_name)) = TRIM(LOWER(p.title));

-- ─── Auto-link cycle_revenues.client_id by name match ───────
UPDATE finance_cycle_revenues r
SET client_id = c.id
FROM clients c
WHERE r.client_id IS NULL
  AND r.tenant_id = c.tenant_id
  AND TRIM(LOWER(r.client_name)) = TRIM(LOWER(c.name));

NOTIFY pgrst, 'reload config';

-- ============================================================================
-- Explicit per-task opt-in for cross-tenant visibility
-- ============================================================================
-- Until now sharing a project via project_agency_shares exposed EVERY task
-- in that project to the receiving agency. That leaked admin/internal/sales
-- tasks ("PM on Frenetic", "Proposal to Christie", "Sent emails to Nicholas")
-- to the partner agency.
--
-- New model: each task carries an explicit `shared_with_partner` flag.
-- Cross-tenant visibility now requires BOTH a shared project AND that flag
-- set to TRUE. The owner agency picks which tasks to make visible via a
-- toggle on the task detail panel.
--
-- Default FALSE so existing tasks are NOT visible to the partner until
-- explicit opt-in. Already-shared projects DON'T spill their tasks anymore.
-- ============================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS shared_with_partner BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_tasks_shared_with_partner
  ON tasks(project_id) WHERE shared_with_partner = TRUE;

COMMENT ON COLUMN tasks.shared_with_partner IS
  'When TRUE, this task is visible to the partner agency on a shared '
  'project. Default FALSE — owner must opt in per task.';

DROP POLICY IF EXISTS tasks_shared_project_select ON tasks;
CREATE POLICY tasks_shared_project_select ON tasks
FOR SELECT USING (
  project_id IS NOT NULL
  AND shared_with_partner = TRUE
  AND EXISTS (
    SELECT 1 FROM project_agency_shares pas
    WHERE pas.project_id = tasks.project_id
      AND pas.shared_with_tenant_id IN (
        SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS tasks_shared_project_update ON tasks;
CREATE POLICY tasks_shared_project_update ON tasks
FOR UPDATE USING (
  project_id IS NOT NULL
  AND shared_with_partner = TRUE
  AND EXISTS (
    SELECT 1 FROM project_agency_shares pas
    WHERE pas.project_id = tasks.project_id
      AND pas.access_level = 'edit'
      AND pas.shared_with_tenant_id IN (
        SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS tasks_shared_project_insert ON tasks;
CREATE POLICY tasks_shared_project_insert ON tasks
FOR INSERT WITH CHECK (
  project_id IS NOT NULL
  AND shared_with_partner = TRUE
  AND EXISTS (
    SELECT 1 FROM project_agency_shares pas
    WHERE pas.project_id = tasks.project_id
      AND pas.access_level = 'edit'
      AND pas.shared_with_tenant_id IN (
        SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
      )
  )
);

-- list_calendar_tasks_for_tenant + list_my_cross_tenant_tasks updated to
-- filter shared-in tasks by `shared_with_partner = TRUE`. The full
-- definitions live in the apply_migration call (2026-05-16) — only the
-- behavioural delta is documented here.

NOTIFY pgrst, 'reload schema';

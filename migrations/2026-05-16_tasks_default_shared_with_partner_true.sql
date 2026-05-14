-- Flip default + backfill: tasks in shared projects sync to partner by default
-- =========================================================================
-- Replaces the opt-IN model (2026-05-16_tasks_explicit_partner_sharing.sql)
-- with opt-OUT. The user's actual workflow is "90% of tasks should sync,
-- only a handful need hiding" — opt-in forced a tedious per-task toggle on
-- the owner's part. Opt-out: shared by default, owner ticks "Keep internal"
-- on the handful of admin/sales tasks they want to hide.
--
-- DOES NOT touch the RLS policies — they still require shared_with_partner
-- = TRUE for cross-tenant access. The change is just the default and the
-- backfill of existing rows in already-shared projects.

ALTER TABLE tasks
  ALTER COLUMN shared_with_partner SET DEFAULT TRUE;

UPDATE tasks t
SET shared_with_partner = TRUE
WHERE shared_with_partner = FALSE
  AND t.project_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM project_agency_shares pas
    WHERE pas.project_id = t.project_id
  );

COMMENT ON COLUMN tasks.shared_with_partner IS
  'When TRUE (default), this task is visible to the partner agency on a '
  'shared project. Set to FALSE to keep the task internal to the owner '
  'agency even when the project itself is shared.';

-- =============================================
-- Tracks who marked each task as complete (separate from assignee_id).
-- Trigger auto-populates completed_by = auth.uid() when `completed` flips
-- from FALSE to TRUE. Pre-existing completed tasks fall back to assignee_id.
-- =============================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: for tasks already completed, default attribution to assignee_id.
UPDATE tasks
SET completed_by = assignee_id
WHERE completed = TRUE AND completed_by IS NULL AND assignee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION set_task_completed_by()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only act when `completed` transitions from false → true and caller didn't set it explicitly.
  IF NEW.completed = TRUE AND (OLD.completed IS DISTINCT FROM TRUE) AND NEW.completed_by IS NULL THEN
    NEW.completed_by := COALESCE(auth.uid(), NEW.assignee_id);
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  -- Clear attribution when un-completed.
  IF NEW.completed = FALSE AND OLD.completed = TRUE THEN
    NEW.completed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_set_completed_by ON tasks;
CREATE TRIGGER tasks_set_completed_by
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_completed_by();

NOTIFY pgrst, 'reload config';

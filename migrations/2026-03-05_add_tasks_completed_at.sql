-- Add completed_at column to tasks table
-- Used to pin completed tasks to their completion date in the calendar
-- and to calculate elapsed time (start → completion)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- Trigger: auto-set completed_at when task is marked done
CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed = true AND (OLD.completed IS DISTINCT FROM true) THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
  END IF;
  IF NEW.completed = false AND (OLD.completed IS DISTINCT FROM false) THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_task_completed_at ON tasks;
CREATE TRIGGER trigger_set_task_completed_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_completed_at();

-- Backfill: set completed_at for already-completed tasks
UPDATE public.tasks
SET completed_at = updated_at
WHERE completed = true AND completed_at IS NULL;

NOTIFY pgrst, 'reload config';

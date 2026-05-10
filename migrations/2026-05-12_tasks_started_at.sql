-- Track WHEN a task entered status='in-progress' so we can measure
-- real time-to-complete (started_at → completed_at), not just calendar
-- days from creation. Surfaces in the Activity → Member panel as a
-- "took 3d 4h" label on every completed row, and the AI recap can call
-- out slow closures.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- Helpful index for "slowest in window" queries.
CREATE INDEX IF NOT EXISTS idx_tasks_completed_started
  ON tasks (tenant_id, completed_at DESC)
  WHERE completed = true AND started_at IS NOT NULL;

-- Trigger: stamp started_at the first time status flips to 'in-progress'.
-- We DON'T overwrite if it's already set, so re-opening + re-starting a
-- task doesn't reset the clock — tracks the FIRST time real work began.
-- A multi-cycle history would need a status_history table; that's a
-- bigger refactor we're explicitly deferring.
CREATE OR REPLACE FUNCTION set_task_started_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in-progress'
     AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'in-progress')
     AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;

  -- Safety net: if a task is being marked completed but somehow never
  -- got a started_at (e.g. moved directly from todo → done), assume the
  -- work spanned the full lifetime from created_at. Best-effort, lets
  -- the duration analytics keep working even when status was skipped.
  IF NEW.completed = true
     AND (OLD IS NULL OR OLD.completed IS DISTINCT FROM true)
     AND NEW.started_at IS NULL THEN
    NEW.started_at := COALESCE(NEW.created_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_set_started_at ON tasks;
CREATE TRIGGER trg_tasks_set_started_at
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_started_at();

-- Backfill: completed tasks that don't have started_at yet get their
-- created_at as the best-effort start. Future updates will use the
-- trigger; this just makes existing data usable for analytics today.
UPDATE tasks
SET started_at = created_at
WHERE completed = true AND started_at IS NULL;

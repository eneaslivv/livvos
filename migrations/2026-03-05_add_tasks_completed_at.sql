-- Add completed_at column to tasks table
-- This column is used by the UI to track when a task was completed

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN completed_at timestamptz;
  END IF;
END $$;

-- Backfill: set completed_at for already-completed tasks
UPDATE public.tasks
SET completed_at = updated_at
WHERE completed = true AND completed_at IS NULL;

NOTIFY pgrst, 'reload config';

-- Multi-assignee support: tasks can now have multiple assignees
-- Uses a UUID array column instead of a junction table for simplicity

-- 1. Add assignee_ids array column
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assignee_ids uuid[] DEFAULT '{}';

-- 2. Migrate existing single-assignee data into the array
UPDATE public.tasks
  SET assignee_ids = ARRAY[assigned_to]
  WHERE assigned_to IS NOT NULL
    AND (assignee_ids IS NULL OR assignee_ids = '{}');

-- 3. Create GIN index for fast array containment queries (e.g. WHERE auth.uid() = ANY(assignee_ids))
CREATE INDEX IF NOT EXISTS tasks_assignee_ids_gin_idx
  ON public.tasks USING GIN (assignee_ids);

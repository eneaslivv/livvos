-- Add blocked_by column for task dependencies
-- A task with blocked_by = <another_task_id> is "blocked" until that task is completed

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tasks_blocked_by ON public.tasks(blocked_by) WHERE blocked_by IS NOT NULL;

-- Unify tasks across app (calendar, projects, global)
-- Idempotent migration

DO $$
BEGIN
  IF to_regclass('public.tasks') IS NULL THEN
    CREATE TABLE public.tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      completed boolean DEFAULT false,
      priority text DEFAULT 'medium',
      status text DEFAULT 'todo',
      owner_id uuid,
      assignee_id uuid,
      project_id uuid,
      client_id uuid,
      due_date date,
      start_date date,
      end_date date,
      start_time time,
      duration integer,
      order_index integer DEFAULT 0,
      parent_task_id uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'description') THEN
    ALTER TABLE public.tasks ADD COLUMN description text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'completed') THEN
    ALTER TABLE public.tasks ADD COLUMN completed boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'priority') THEN
    ALTER TABLE public.tasks ADD COLUMN priority text DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'status') THEN
    ALTER TABLE public.tasks ADD COLUMN status text DEFAULT 'todo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'owner_id') THEN
    ALTER TABLE public.tasks ADD COLUMN owner_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'assignee_id') THEN
    ALTER TABLE public.tasks ADD COLUMN assignee_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'project_id') THEN
    ALTER TABLE public.tasks ADD COLUMN project_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'client_id') THEN
    ALTER TABLE public.tasks ADD COLUMN client_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'due_date') THEN
    ALTER TABLE public.tasks ADD COLUMN due_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'start_date') THEN
    ALTER TABLE public.tasks ADD COLUMN start_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'end_date') THEN
    ALTER TABLE public.tasks ADD COLUMN end_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'start_time') THEN
    ALTER TABLE public.tasks ADD COLUMN start_time time;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'duration') THEN
    ALTER TABLE public.tasks ADD COLUMN duration integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'order_index') THEN
    ALTER TABLE public.tasks ADD COLUMN order_index integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'parent_task_id') THEN
    ALTER TABLE public.tasks ADD COLUMN parent_task_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'created_at') THEN
    ALTER TABLE public.tasks ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'updated_at') THEN
    ALTER TABLE public.tasks ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'tasks_project_id_idx') THEN
    CREATE INDEX tasks_project_id_idx ON public.tasks(project_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'tasks_assignee_id_idx') THEN
    CREATE INDEX tasks_assignee_id_idx ON public.tasks(assignee_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'tasks_due_date_idx') THEN
    CREATE INDEX tasks_due_date_idx ON public.tasks(due_date);
  END IF;
END $$;

-- Migrate existing calendar_tasks into tasks if the table exists
DO $$
BEGIN
  IF to_regclass('public.calendar_tasks') IS NOT NULL THEN
    INSERT INTO public.tasks (
      id,
      title,
      description,
      completed,
      priority,
      status,
      owner_id,
      assignee_id,
      project_id,
      client_id,
      due_date,
      start_date,
      end_date,
      start_time,
      duration,
      order_index,
      parent_task_id,
      created_at,
      updated_at
    )
    SELECT
      ct.id,
      ct.title,
      ct.description,
      ct.completed,
      ct.priority,
      ct.status,
      ct.owner_id,
      ct.assignee_id,
      ct.project_id,
      ct.client_id,
      ct.start_date,
      ct.start_date,
      ct.end_date,
      ct.start_time,
      ct.duration,
      ct.order_index,
      ct.parent_task_id,
      ct.created_at,
      ct.updated_at
    FROM public.calendar_tasks ct
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      completed = EXCLUDED.completed,
      priority = EXCLUDED.priority,
      status = EXCLUDED.status,
      owner_id = EXCLUDED.owner_id,
      assignee_id = EXCLUDED.assignee_id,
      project_id = EXCLUDED.project_id,
      client_id = EXCLUDED.client_id,
      due_date = EXCLUDED.due_date,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      start_time = EXCLUDED.start_time,
      duration = EXCLUDED.duration,
      order_index = EXCLUDED.order_index,
      parent_task_id = EXCLUDED.parent_task_id,
      updated_at = EXCLUDED.updated_at;
  END IF;
END $$;

NOTIFY pgrst, 'reload config';

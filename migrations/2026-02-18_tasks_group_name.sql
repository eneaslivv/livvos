-- Add tasks table if missing and then group_name column
DO $$
BEGIN
  -- Ensure tasks table exists
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

  -- Add group_name column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'tasks'
    AND column_name = 'group_name'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN group_name text DEFAULT 'General';
  END IF;
END $$;

-- Backfill group_name from projects.tasks_groups JSONB if data exists
DO $$
DECLARE
  proj RECORD;
  grp JSONB;
  tsk JSONB;
BEGIN
  FOR proj IN SELECT id, tasks_groups FROM public.projects WHERE tasks_groups IS NOT NULL AND tasks_groups != '[]'::jsonb LOOP
    IF jsonb_typeof(proj.tasks_groups) = 'array' THEN
      FOR grp IN SELECT * FROM jsonb_array_elements(proj.tasks_groups) LOOP
        IF grp->>'name' IS NOT NULL AND jsonb_typeof(grp->'tasks') = 'array' THEN
          FOR tsk IN SELECT * FROM jsonb_array_elements(grp->'tasks') LOOP
            UPDATE public.tasks
            SET group_name = grp->>'name'
            WHERE id = (tsk->>'id')::uuid
              AND (group_name IS NULL OR group_name = 'General');
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload config';

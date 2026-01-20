ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS client_name TEXT,
ADD COLUMN IF NOT EXISTS client_avatar TEXT,
ADD COLUMN IF NOT EXISTS deadline DATE,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS team TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tasks_groups JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS activity JSONB DEFAULT '[]';

COMMENT ON COLUMN public.projects.tasks_groups IS 'Array de fases con tareas en formato JSON';
COMMENT ON COLUMN public.projects.files IS 'Archivos asociados al proyecto en formato JSON';
COMMENT ON COLUMN public.projects.activity IS 'Actividad del proyecto en formato JSON';

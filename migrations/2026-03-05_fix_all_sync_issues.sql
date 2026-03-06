-- =============================================
-- COMPREHENSIVE FIX: tasks sync, RLS functions, data consistency
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. FIX RLS HELPER FUNCTIONS (critical!)
--    current_user_tenant() was using "user_id" but profiles column is "id"
-- =============================================

CREATE OR REPLACE FUNCTION current_user_tenant()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id
    FROM profiles
    WHERE id = auth.uid()  -- MUST be "id", NOT "user_id"
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION can_access_tenant(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_user_tenant() = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. FIX TASKS: add completed_at if missing + fix owner_id nulls
-- =============================================

-- Add completed_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN completed_at timestamptz;
  END IF;
END $$;

-- Backfill completed_at for completed tasks
UPDATE public.tasks
SET completed_at = updated_at
WHERE completed = true AND completed_at IS NULL;

-- Fix tasks with null owner_id: assign to the tenant owner
UPDATE public.tasks t
SET owner_id = (
  SELECT p.id FROM profiles p WHERE p.tenant_id = t.tenant_id LIMIT 1
)
WHERE t.owner_id IS NULL AND t.tenant_id IS NOT NULL;

-- Fix status inconsistency: completed=true should have status='done'
UPDATE public.tasks
SET status = 'done'
WHERE completed = true AND status != 'done';

-- Fix status inconsistency: completed=false should not have status='done'
UPDATE public.tasks
SET status = 'todo'
WHERE completed = false AND status = 'done';

-- =============================================
-- 3. TASKS RLS POLICIES (ensure correct)
-- =============================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_insert_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_update_policy" ON tasks;
DROP POLICY IF EXISTS "tasks_delete_policy" ON tasks;
-- Drop any legacy policies
DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can create own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;

CREATE POLICY "tasks_select_policy" ON tasks
FOR SELECT USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

CREATE POLICY "tasks_insert_policy" ON tasks
FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "tasks_update_policy" ON tasks
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

CREATE POLICY "tasks_delete_policy" ON tasks
FOR DELETE USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
);

GRANT ALL ON tasks TO authenticated;

-- =============================================
-- 4. FOLDERS + FILES RLS POLICIES
-- =============================================
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing folder policies
DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can create their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;
DROP POLICY IF EXISTS "client_folders_select" ON public.folders;
DROP POLICY IF EXISTS "client_folders_project_select" ON public.folders;
DROP POLICY IF EXISTS "folders_select_policy" ON public.folders;
DROP POLICY IF EXISTS "folders_insert_policy" ON public.folders;
DROP POLICY IF EXISTS "folders_update_policy" ON public.folders;
DROP POLICY IF EXISTS "folders_delete_policy" ON public.folders;

CREATE POLICY "folders_select_policy" ON public.folders
FOR SELECT USING (
  auth.uid() = owner_id
  OR can_access_tenant(tenant_id)
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = folders.client_id AND c.auth_user_id = auth.uid()
  )
);

CREATE POLICY "folders_insert_policy" ON public.folders
FOR INSERT WITH CHECK (
  auth.uid() = owner_id
  OR can_access_tenant(tenant_id)
);

CREATE POLICY "folders_update_policy" ON public.folders
FOR UPDATE USING (
  auth.uid() = owner_id
  OR can_access_tenant(tenant_id)
);

CREATE POLICY "folders_delete_policy" ON public.folders
FOR DELETE USING (
  auth.uid() = owner_id
  OR can_access_tenant(tenant_id)
);

-- Drop ALL existing file policies
DROP POLICY IF EXISTS "Users can view their own files" ON public.files;
DROP POLICY IF EXISTS "Users can create their own files" ON public.files;
DROP POLICY IF EXISTS "Users can update their own files" ON public.files;
DROP POLICY IF EXISTS "Users can delete their own files" ON public.files;
DROP POLICY IF EXISTS "client_files_select" ON public.files;
DROP POLICY IF EXISTS "client_files_project_select" ON public.files;
DROP POLICY IF EXISTS "files_select_policy" ON public.files;
DROP POLICY IF EXISTS "files_insert_policy" ON public.files;
DROP POLICY IF EXISTS "files_update_policy" ON public.files;
DROP POLICY IF EXISTS "files_delete_policy" ON public.files;

CREATE POLICY "files_select_policy" ON public.files
FOR SELECT USING (
  auth.uid() = owner_id
  OR can_access_tenant(tenant_id)
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = files.client_id AND c.auth_user_id = auth.uid()
  )
);

CREATE POLICY "files_insert_policy" ON public.files
FOR INSERT WITH CHECK (
  auth.uid() = owner_id
  OR can_access_tenant(tenant_id)
);

CREATE POLICY "files_update_policy" ON public.files
FOR UPDATE USING (
  auth.uid() = owner_id
  OR can_access_tenant(tenant_id)
);

CREATE POLICY "files_delete_policy" ON public.files
FOR DELETE USING (
  auth.uid() = owner_id
  OR can_access_tenant(tenant_id)
);

GRANT ALL ON public.folders TO authenticated;
GRANT ALL ON public.files TO authenticated;

-- =============================================
-- 5. RELOAD CONFIG
-- =============================================
NOTIFY pgrst, 'reload config';

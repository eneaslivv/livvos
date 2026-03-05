-- =============================================
-- Fix folders + files: RLS policies with tenant support
-- =============================================

-- Ensure RLS is enabled
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- =============================================
-- FOLDERS policies
-- =============================================

-- Drop all existing folder policies
DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can create their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;
DROP POLICY IF EXISTS "client_folders_select" ON public.folders;
DROP POLICY IF EXISTS "client_folders_project_select" ON public.folders;

-- SELECT: owner OR same tenant OR client portal
CREATE POLICY "folders_select_policy" ON public.folders
FOR SELECT USING (
  auth.uid() = owner_id
  OR (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = folders.client_id
    AND c.auth_user_id = auth.uid()
  )
);

-- INSERT: authenticated user sets themselves as owner, or same tenant
CREATE POLICY "folders_insert_policy" ON public.folders
FOR INSERT WITH CHECK (
  auth.uid() = owner_id
  OR (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  )
);

-- UPDATE: owner OR same tenant
CREATE POLICY "folders_update_policy" ON public.folders
FOR UPDATE USING (
  auth.uid() = owner_id
  OR (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  )
);

-- DELETE: owner OR same tenant
CREATE POLICY "folders_delete_policy" ON public.folders
FOR DELETE USING (
  auth.uid() = owner_id
  OR (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  )
);

-- =============================================
-- FILES policies
-- =============================================

DROP POLICY IF EXISTS "Users can view their own files" ON public.files;
DROP POLICY IF EXISTS "Users can create their own files" ON public.files;
DROP POLICY IF EXISTS "Users can update their own files" ON public.files;
DROP POLICY IF EXISTS "Users can delete their own files" ON public.files;
DROP POLICY IF EXISTS "client_files_select" ON public.files;
DROP POLICY IF EXISTS "client_files_project_select" ON public.files;

-- SELECT: owner OR same tenant OR client portal
CREATE POLICY "files_select_policy" ON public.files
FOR SELECT USING (
  auth.uid() = owner_id
  OR (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = files.client_id
    AND c.auth_user_id = auth.uid()
  )
);

-- INSERT: owner OR same tenant
CREATE POLICY "files_insert_policy" ON public.files
FOR INSERT WITH CHECK (
  auth.uid() = owner_id
  OR (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  )
);

-- UPDATE: owner OR same tenant
CREATE POLICY "files_update_policy" ON public.files
FOR UPDATE USING (
  auth.uid() = owner_id
  OR (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  )
);

-- DELETE: owner OR same tenant
CREATE POLICY "files_delete_policy" ON public.files
FOR DELETE USING (
  auth.uid() = owner_id
  OR (
    tenant_id IS NOT NULL
    AND tenant_id IN (SELECT p.tenant_id FROM profiles p WHERE p.id = auth.uid())
  )
);

-- =============================================
-- GRANTS
-- =============================================
GRANT ALL ON public.folders TO authenticated;
GRANT ALL ON public.files TO authenticated;

-- Reload PostgREST
NOTIFY pgrst, 'reload config';

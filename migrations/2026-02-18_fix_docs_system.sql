-- =============================================
-- REPARACIÓN DEL SISTEMA DE DOCUMENTOS
-- =============================================

DO $$
BEGIN
  -- 1. Asegurar tablas base
  IF to_regclass('public.folders') IS NULL THEN
    CREATE TABLE public.folders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
      color TEXT DEFAULT '#3b82f6',
      is_favorite BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  END IF;

  IF to_regclass('public.files') IS NULL THEN
    CREATE TABLE public.files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      type TEXT,
      size BIGINT,
      url TEXT NOT NULL,
      is_favorite BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  END IF;

  -- 2. Asegurar columnas de multi-tenant y relación
  -- tenant_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'folders' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.folders ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'files' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.files ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  -- client_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'folders' AND column_name = 'client_id') THEN
    ALTER TABLE public.folders ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'files' AND column_name = 'client_id') THEN
    ALTER TABLE public.files ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;

  -- project_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'folders' AND column_name = 'project_id') THEN
    ALTER TABLE public.folders ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'files' AND column_name = 'project_id') THEN
    ALTER TABLE public.files ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;

  -- 3. Índices para performance
  CREATE INDEX IF NOT EXISTS idx_folders_tenant_id ON public.folders(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_files_tenant_id ON public.files(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_folders_project_id ON public.folders(project_id);
  CREATE INDEX IF NOT EXISTS idx_files_project_id ON public.files(project_id);

END $$;

-- 4. Habilitar RLS
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de RLS para tablas (Limpiar y recrear para asegurar consistencia)
DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
CREATE POLICY "Users can view their own folders" ON public.folders
  FOR SELECT USING (auth.uid() = owner_id OR (tenant_id IS NOT NULL AND tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Users can create their own folders" ON public.folders;
CREATE POLICY "Users can create their own folders" ON public.folders
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
CREATE POLICY "Users can update their own folders" ON public.folders
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;
CREATE POLICY "Users can delete their own folders" ON public.folders
  FOR DELETE USING (auth.uid() = owner_id);

-- Políticas para files
DROP POLICY IF EXISTS "Users can view their own files" ON public.files;
CREATE POLICY "Users can view their own files" ON public.files
  FOR SELECT USING (auth.uid() = owner_id OR (tenant_id IS NOT NULL AND tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Users can create their own files" ON public.files;
CREATE POLICY "Users can create their own files" ON public.files
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own files" ON public.files;
CREATE POLICY "Users can update their own files" ON public.files
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own files" ON public.files;
CREATE POLICY "Users can delete their own files" ON public.files
  FOR DELETE USING (auth.uid() = owner_id);


-- 6. Configuración de Storage (Bucket 'documents')
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT TO authenticated 
USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE TO authenticated 
USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE TO authenticated 
USING (bucket_id = 'documents');

-- 7. Recargar configuración de PostgREST
NOTIFY pgrst, 'reload config';

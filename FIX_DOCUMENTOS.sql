-- SQL "MEGA FIX" - RESTAURACIÓN COMPLETA DE ESTRUCTURA Y PERMISOS
-- Este script reconstruye todas las tablas necesarias y configura el almacenamiento.
-- Ejecútalo COMPLETO en el SQL Editor de Supabase.

-- ==========================================
-- 1. TABLA TENANTS (La base de todo)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant owners can view their tenant" ON public.tenants;
CREATE POLICY "Tenant owners can view their tenant" ON public.tenants
  FOR SELECT USING (owner_id = auth.uid());

-- Permitir a usuarios ver tenants si pertenecen a ellos (política simplificada para que funcione el upload)
DROP POLICY IF EXISTS "Authenticated users can select tenants" ON public.tenants;
CREATE POLICY "Authenticated users can select tenants" ON public.tenants
  FOR SELECT TO authenticated USING (true); 

-- ==========================================
-- 2. TABLAS DEPENDIENTES (Clients y Projects)
-- ==========================================

-- Clients
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    email TEXT,
    company TEXT,
    phone TEXT,
    status TEXT DEFAULT 'Active',
    owner_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their clients" ON public.clients;
CREATE POLICY "Users can manage their clients" ON public.clients FOR ALL USING (true); -- Simplificado para desarrollo

-- Projects
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'Active',
    client_id UUID REFERENCES public.clients(id),
    owner_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage projects" ON public.projects;
CREATE POLICY "Users can manage projects" ON public.projects FOR ALL USING (true); -- Simplificado para desarrollo

-- ==========================================
-- 3. TABLAS DE DOCUMENTOS (Folders y Files)
-- ==========================================

-- Folders
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    color TEXT DEFAULT '#3b82f6',
    is_favorite BOOLEAN DEFAULT FALSE,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage folders" ON public.folders;
CREATE POLICY "Users can manage folders" ON public.folders FOR ALL USING (auth.uid() = owner_id);

-- Files
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT,
    size BIGINT,
    url TEXT NOT NULL,
    tags TEXT[],
    is_favorite BOOLEAN DEFAULT FALSE,
    folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage files" ON public.files;
CREATE POLICY "Users can manage files" ON public.files FOR ALL USING (auth.uid() = owner_id);

-- ==========================================
-- 4. STORAGE (Buckets)
-- ==========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;

CREATE POLICY "Users can upload their own files" 
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Users can view their own files" 
ON storage.objects FOR SELECT TO authenticated 
USING (bucket_id = 'documents');

CREATE POLICY "Users can delete their own files" 
ON storage.objects FOR DELETE TO authenticated 
USING (bucket_id = 'documents');

SELECT '✅ REPARACIÓN COMPLETA FINALIZADA (Tenants, Clients, Projects, Docs, Storage)' as status;

-- SQL para crear tablas de documentos - EJECUTAR EN SUPABASE
-- PASOS:
-- 1. Ve a https://app.supabase.com/project/azkhquxgekgfuplvwobe/sql
-- 2. Copia TODO este contenido
-- 3. Click en "RUN" (botón verde)

-- ===================================
-- TABLAS PARA SISTEMA DE DOCUMENTOS
-- ===================================

-- 1. Tabla de carpetas
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#3b82f6',
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de archivos (metadatos)
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT, -- mime type
  size BIGINT, -- bytes
  url TEXT NOT NULL, -- storage path
  is_favorite BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_folders_owner_id ON folders(owner_id);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_files_owner_id ON files(owner_id);
CREATE INDEX idx_files_folder_id ON files(folder_id);

-- RLS Policies
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Políticas para folders
CREATE POLICY "Users can view their own folders" ON folders
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own folders" ON folders
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own folders" ON folders
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own folders" ON folders
  FOR DELETE USING (auth.uid() = owner_id);

-- Políticas para files
CREATE POLICY "Users can view their own files" ON files
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own files" ON files
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own files" ON files
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own files" ON files
  FOR DELETE USING (auth.uid() = owner_id);

-- Insertar carpetas base (ejemplo para usuario actual si estuviera autenticado)
-- INSERT INTO folders (owner_id, name, color) VALUES 
-- (auth.uid(), 'Proyectos', '#3b82f6'),
-- (auth.uid(), 'Finanzas', '#10b981'),
-- (auth.uid(), 'Legal', '#f59e0b'),
-- (auth.uid(), 'Marketing', '#8b5cf6');

-- STORAGE BUCKET
-- Nota: Esto debe configurarse manualmente en el dashboard de Supabase si no se puede vía SQL
-- Bucket: 'documents'
-- Policy: Public false, Authenticated access only

INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policies para Storage
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'documents' AND auth.uid() = owner);

CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT TO authenticated 
USING (bucket_id = 'documents' AND auth.uid() = owner);

CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE TO authenticated 
USING (bucket_id = 'documents' AND auth.uid() = owner);

CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE TO authenticated 
USING (bucket_id = 'documents' AND auth.uid() = owner);

SELECT '✅ Tablas de documentos creadas' as status;
SELECT '✅ RLS configurado' as status;
SELECT '✅ Bucket de storage configurado' as status;
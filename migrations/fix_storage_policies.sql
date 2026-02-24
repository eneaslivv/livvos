-- =============================================
-- FIX: Storage bucket y políticas para uploads
-- Pega esto en: https://supabase.com/dashboard → SQL Editor → New Query
-- =============================================

-- 1. Crear bucket si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  52428800,  -- 50MB max
  NULL       -- Permite todos los tipos: imágenes, videos, PDFs, etc.
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = NULL;

-- 2. Borrar políticas viejas que puedan estar mal
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;

-- 3. Crear políticas nuevas y correctas
-- INSERT: cualquier usuario autenticado puede subir al bucket 'documents'
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents');

-- SELECT: cualquier usuario autenticado puede ver archivos del bucket 'documents'
CREATE POLICY "Allow authenticated reads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents');

-- UPDATE: cualquier usuario autenticado puede actualizar sus archivos
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'documents');

-- DELETE: cualquier usuario autenticado puede borrar sus archivos
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents');

-- 4. Asegurar que RLS esté habilitado
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 5. Verificar
SELECT 'Bucket creado:' as status, id, name, public, file_size_limit FROM storage.buckets WHERE id = 'documents'
UNION ALL
SELECT 'OK - Storage listo para uploads', '', '', true, 0;

-- SQL FIX V2 PARA STORAGE (Ejecutar en Supabase SQL Editor)
-- Este script elimina explícitamente cualquier política anterior y crea nuevas con nombres únicos.

-- 1. Habilitar RLS (por si acaso)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Limpieza de políticas antiguas (varios nombres posibles para asegurar limpieza)
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow owners to delete" ON storage.objects;

-- 3. Crear Nuevas Políticas (Nombres únicos v2)

-- Permitir INSERT (Subida) a cualquier usuario autenticado en el bucket 'documents'
CREATE POLICY "v2_insert_documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Permitir SELECT (Lectura) en el bucket 'documents'
CREATE POLICY "v2_select_documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents');

-- Permitir DELETE (Borrado) si el usuario es el dueño (owner)
CREATE POLICY "v2_delete_documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND auth.uid() = owner);

-- 4. Verificar estado
SELECT '✅ Políticas V2 aplicadas correctamente' as status;

-- SQL FIX FINAL PARA STORAGE (Ejecutar en Supabase SQL Editor)
-- Este script fuerza la configuración pública del bucket y simplifica los permisos al máximo.

-- 1. Forzar que el bucket 'documents' sea PÚBLICO
-- (Si se creó como privado antes, esto lo arregla)
UPDATE storage.buckets 
SET public = true, file_size_limit = 52428800, allowed_mime_types = null
WHERE id = 'documents';

-- 2. Asegurar owner del bucket (opcional pero ayuda)
UPDATE storage.buckets
SET owner = auth.uid()
WHERE id = 'documents' AND owner IS NULL;

-- 3. ELIMINAR TODAS LAS POLÍTICAS PREVIAS DE STORAGE para 'documents'
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
-- DROP NEW POLICIES IF THEY EXIST (To avoid "already exists" error)
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow owners to delete" ON storage.objects;

-- 4. CREAR POLÍTICAS PERMISIVAS (Standard Supabase)

-- Permitir INSERT (Subida) a cualquier usuario autenticado
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Permitir SELECT (Ver/Descargar) a cualquier usuario autenticado
CREATE POLICY "Allow authenticated downloads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents');

-- Permitir DELETE a propietarios
CREATE POLICY "Allow owners to delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND (auth.uid() = owner));

-- 5. VERIFICACIÓN
SELECT id, name, public, created_at FROM storage.buckets WHERE id = 'documents';

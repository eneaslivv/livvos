-- SQL FIX V4 (Limpieza definitiva + Debug Público)
-- Este script elimina TODAS las políticas anteriores (incluidos duplicados) y prueba una política PÚBLICA.

-- 1. Limpieza Agresiva (Borrar todo lo que tenga que ver con documents)
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow owners to delete" ON storage.objects;
DROP POLICY IF EXISTS "v2_insert_documents" ON storage.objects;
DROP POLICY IF EXISTS "v2_select_documents" ON storage.objects;
DROP POLICY IF EXISTS "v2_delete_documents" ON storage.objects;
DROP POLICY IF EXISTS "v3_insert_documents_fix" ON storage.objects;
DROP POLICY IF EXISTS "v3_select_documents_fix" ON storage.objects;
DROP POLICY IF EXISTS "v3_delete_documents_fix" ON storage.objects;

-- 2. Crear Política "Apertura Total" (Solo para el bucket documents)
-- TO public significa: anon + authenticated. Si esto falla, el problema no es el usuario.

CREATE POLICY "v4_debug_insert_public"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "v4_debug_select_public"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'documents');

CREATE POLICY "v4_debug_delete_public"
ON storage.objects FOR DELETE TO public
USING (bucket_id = 'documents');

SELECT '✅ Políticas V4 (Debug Público) aplicadas. Limpieza realizada.' as status;

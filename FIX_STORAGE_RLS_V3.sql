-- SQL FIX V3 (Solo crear política, sin ALTER TABLE)
-- Este script intenta SOLO añadir el permiso necesario, saltándose pasos que requieren ser "owner" de la tabla.

-- No ejecutamos ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; (Ya debe estar habilitado)

-- Intentamos crear UNA política nueva permisiva. 
-- Al ser políticas "PERMISSIVE" por defecto, basta con que una lo permita.

-- 1. Insert Permission (Upload)
CREATE POLICY "v3_insert_documents_fix"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents');

-- 2. Select Permission (Download/View)
CREATE POLICY "v3_select_documents_fix"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents');

-- 3. Delete Permission
CREATE POLICY "v3_delete_documents_fix"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND auth.uid() = owner);

SELECT '✅ Políticas V3 creadas. Prueba subir archivo.' as status;

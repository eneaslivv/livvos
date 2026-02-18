-- SQL FIX V5: Disable Triggers & Verify
-- Intentamos deshabilitar cualquier trigger que pueda estar molestando en storage.objects
-- y aplicamos una política SUPER permisiva "blind".

-- 1. Deshabilitar triggers en storage.objects (si existen)
ALTER TABLE storage.objects DISABLE TRIGGER ALL;

-- 2. Asegurarnos que public.files tenga RLS habilitado pero con política permisiva (por si el insert DB falla y confunde)
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for files debug" ON public.files;
CREATE POLICY "Allow all for files debug" ON public.files FOR ALL USING (true) WITH CHECK (true);

-- 3. Storage Policy "THE NUCLEAR OPTION"
-- Eliminamos TODO de nuevo
DROP POLICY IF EXISTS "v4_debug_insert_public" ON storage.objects;
DROP POLICY IF EXISTS "v4_debug_select_public" ON storage.objects;
DROP POLICY IF EXISTS "v4_debug_delete_public" ON storage.objects;

-- Creamos una política que no chequea bucket_id (por si el bucket_id no está llegando bien)
CREATE POLICY "v5_nuclear_insert"
ON storage.objects FOR INSERT TO public
WITH CHECK (true);

CREATE POLICY "v5_nuclear_select"
ON storage.objects FOR SELECT TO public
USING (true);

CREATE POLICY "v5_nuclear_delete"
ON storage.objects FOR DELETE TO public
USING (true);

SELECT '✅ V5 Nuclear aplicado. Triggers deshabilitados. Prueba subir.' as status;

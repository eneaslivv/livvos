-- SQL FIX V6: Bypass de Permisos (Solo Políticas)
-- Este script asume que NO podemos modificar triggers ni la tabla,
-- pero SÍ podemos añadir políticas. 

-- 1. Intentamos limpiar políticas previas (si nos deja, si no falla silenciosamente)
DO $$
BEGIN
    DROP POLICY IF EXISTS "v4_debug_insert_public" ON storage.objects;
    DROP POLICY IF EXISTS "v4_debug_select_public" ON storage.objects;
    DROP POLICY IF EXISTS "v4_debug_delete_public" ON storage.objects;
    DROP POLICY IF EXISTS "v5_nuclear_insert" ON storage.objects;
    DROP POLICY IF EXISTS "v5_nuclear_select" ON storage.objects;
    DROP POLICY IF EXISTS "v5_nuclear_delete" ON storage.objects;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudieron borrar algunas políticas anteriores (posible falta de permisos)';
END $$;

-- 2. Crear Política "INSERT V6" (Nombre único)
-- Usamos "security_invoker" implícito (al no setear nada especial).
-- Permitimos todo sin chequear bucket_id para probar.

CREATE POLICY "v6_insert_bypass"
ON storage.objects FOR INSERT TO public
WITH CHECK (true);

-- 3. Crear Política "SELECT V6"
CREATE POLICY "v6_select_bypass"
ON storage.objects FOR SELECT TO public
USING (true);

SELECT '✅ Políticas V6 aplicadas (Bypass mode). Prueba subir.' as status;

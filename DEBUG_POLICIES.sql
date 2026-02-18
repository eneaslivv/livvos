-- SCRIPT DE DIAGNÓSTICO DE POLÍTICAS
-- Ejecuta esto para ver qué reglas de seguridad tiene realmente la tabla de almacenamiento.

SELECT policyname, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects';

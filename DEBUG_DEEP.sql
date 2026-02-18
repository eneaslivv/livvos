-- DEBUG DEEP: Triggers, Policies y Buckets
-- Vamos a ver qué está pasando realmente en las tripas de la base de datos.

-- 1. Ver si hay TRIGGERS ocultos en storage.objects
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'storage' 
AND event_object_table = 'objects';

-- 2. Ver si el bucket sigue siendo público
SELECT id, name, public, owner FROM storage.buckets WHERE id = 'documents';

-- 3. Ver qué políticas sobrevivieron a la limpieza
SELECT policyname, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects';

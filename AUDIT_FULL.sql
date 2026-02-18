-- AUDITORÍA COMPLETA DE SUPABASE STORAGE
-- Ejecuta este script para diagnosticar por qué fallan los permisos.

-- 1. Detalle de todas las políticas en storage.objects (incluyendo si son restrictivas)
SELECT 
    polname as policy_name,
    polroles as roles,
    polcmd as command,
    CASE WHEN polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END as type,
    pg_get_expr(polqual, polrelid) as usage_limit,
    pg_get_expr(polwithcheck, polrelid) as insert_limit
FROM pg_policy
WHERE polrelid = 'storage.objects'::regclass;

-- 2. Triggers activos en storage.objects
-- Algunos triggers pueden interceptar el insert y fallar.
SELECT 
    tgname as trigger_name,
    CASE WHEN tgenabled = 'O' THEN 'ENABLED' ELSE 'DISABLED' END as status,
    tgtype as type
FROM pg_trigger
WHERE tgrelid = 'storage.objects'::regclass 
AND NOT tgisinternal;

-- 3. Estado del bucket 'documents'
SELECT id, name, public, owner, created_at 
FROM storage.buckets 
WHERE id = 'documents';

-- 4. Verificar el rol actual del usuario ejecutor
SELECT current_user, current_role, session_user;

-- 5. Ver si RLS está habilitado en storage.objects
SELECT relname, relrowsecurity, relforcerowsecurity 
FROM pg_class 
WHERE oid = 'storage.objects'::regclass;

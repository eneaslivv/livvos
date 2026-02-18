-- Verificación Post-Fix: ¿Qué políticas quedaron?
SELECT 
    policyname,
    roles::text,
    cmd,
    CASE WHEN polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END as type
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

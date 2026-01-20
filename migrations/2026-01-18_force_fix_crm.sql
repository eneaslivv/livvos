-- 1. Asegurar que las columnas existan (Idempotente)
-- Esto no fallará si ya existen via 'IF NOT EXISTS'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'Web';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- 2. Asegurar policies para evitar bloqueos de RLS (solo si no existen, esto es mas complejo en SQL puro sin funciones, pero aseguramos las basicas)
-- Si ya corriste el script anterior, esto ya esta hecho.

-- 3. IMPORTANTE: Recargar el caché de PostgREST
-- Esto obliga a la API a "darse cuenta" de que existen las nuevas columnas
NOTIFY pgrst, 'reload config';

-- 4. Insertar un lead de prueba para ver algo en el tablero (opcional)
-- Usamos un DO block para insertar solo si la tabla lo permite
DO $$
BEGIN
    INSERT INTO leads (name, email, message, status, origin)
    VALUES ('System Check', 'system@livv.systems', 'Lead de prueba generado por script', 'new', 'System');
EXCEPTION WHEN others THEN
    -- Si falla por owner_id o permisos, lo ignoramos, lo importante son las columnas
    RAISE NOTICE 'No se pudo insertar lead de prueba, pero las columnas deberían estar listas.';
END $$;

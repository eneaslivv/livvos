-- ============================================================
-- Fix projects.client_id FK constraint
-- The existing constraint may reference a stale/corrupt version
-- of the clients table. Drop and recreate it cleanly.
-- ============================================================

-- 1. Clear any orphaned client_id values that don't exist in clients
UPDATE projects
SET client_id = NULL
WHERE client_id IS NOT NULL
  AND client_id NOT IN (SELECT id FROM clients);

-- 2. Drop the potentially corrupt FK constraint
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_client_id_fkey;

-- 3. Recreate with ON DELETE SET NULL (prevents cascade issues)
ALTER TABLE projects
  ADD CONSTRAINT projects_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- Fix tenant isolation: remove "tenant_id IS NULL" from RLS policies
-- This clause allowed orphaned records to be visible to ALL authenticated users

-- Clients
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
CREATE POLICY "clients_select_policy" ON clients
FOR SELECT USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "clients_update_policy" ON clients;
CREATE POLICY "clients_update_policy" ON clients
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "clients_delete_policy" ON clients;
CREATE POLICY "clients_delete_policy" ON clients
FOR DELETE USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

-- Also fix insert to require tenant_id
DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
CREATE POLICY "clients_insert_policy" ON clients
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

-- Assign orphaned clients (NULL tenant_id) to the active tenant
-- so they don't become invisible after the policy change
UPDATE clients
SET tenant_id = (
  SELECT tenant_id FROM profiles WHERE id = clients.owner_id LIMIT 1
)
WHERE tenant_id IS NULL AND owner_id IS NOT NULL;

NOTIFY pgrst, 'reload config';

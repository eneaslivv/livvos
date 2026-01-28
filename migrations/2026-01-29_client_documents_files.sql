ALTER TABLE folders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE files ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE files ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_client_id ON files(client_id);
CREATE INDEX IF NOT EXISTS idx_folders_client_id ON folders(client_id);

DROP POLICY IF EXISTS "client_files_select" ON files;
CREATE POLICY "client_files_select" ON files
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = files.client_id
      AND c.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "client_folders_select" ON folders;
CREATE POLICY "client_folders_select" ON folders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = folders.client_id
      AND c.auth_user_id = auth.uid()
  )
);

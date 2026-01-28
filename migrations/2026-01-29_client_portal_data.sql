CREATE TABLE IF NOT EXISTS client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  doc_type TEXT DEFAULT 'document',
  url TEXT NOT NULL,
  size_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_documents_client_id ON client_documents(client_id);

ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_documents_select" ON client_documents;
CREATE POLICY "client_documents_select" ON client_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_documents.client_id
      AND c.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "client_documents_manage" ON client_documents;
CREATE POLICY "client_documents_manage" ON client_documents
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

CREATE TABLE IF NOT EXISTS client_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  username TEXT,
  secret TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_credentials_client_id ON client_credentials(client_id);

ALTER TABLE client_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_credentials_select" ON client_credentials;
CREATE POLICY "client_credentials_select" ON client_credentials
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_credentials.client_id
      AND c.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "client_credentials_manage" ON client_credentials;
CREATE POLICY "client_credentials_manage" ON client_credentials
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN owner_id UUID REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN client_id UUID REFERENCES clients(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN client_id UUID REFERENCES clients(id);
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "client_projects_select" ON projects';
  EXECUTE 'CREATE POLICY "client_projects_select" ON projects FOR SELECT USING (auth.uid() = owner_id OR EXISTS (SELECT 1 FROM clients c WHERE c.id = projects.client_id AND c.auth_user_id = auth.uid()))';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "client_tasks_select" ON tasks';
  EXECUTE 'CREATE POLICY "client_tasks_select" ON tasks FOR SELECT USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = tasks.client_id AND c.auth_user_id = auth.uid()) OR EXISTS (SELECT 1 FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = tasks.project_id AND c.auth_user_id = auth.uid()))';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "client_finances_select" ON finances';
  EXECUTE 'CREATE POLICY "client_finances_select" ON finances FOR SELECT USING (EXISTS (SELECT 1 FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = finances.project_id AND c.auth_user_id = auth.uid()))';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "client_logs_select" ON activity_logs';
  EXECUTE 'CREATE POLICY "client_logs_select" ON activity_logs FOR SELECT USING (auth.uid() = owner_id OR EXISTS (SELECT 1 FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.title = activity_logs.project_title AND c.auth_user_id = auth.uid()))';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

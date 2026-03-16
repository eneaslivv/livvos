-- =============================================
-- Documents Editor — Google Docs-style rich text documents
-- =============================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  title TEXT NOT NULL DEFAULT 'Untitled Document',
  content JSONB DEFAULT '{}',
  content_text TEXT DEFAULT '',

  status TEXT NOT NULL DEFAULT 'draft',
  is_favorite BOOLEAN DEFAULT FALSE,

  share_token UUID DEFAULT gen_random_uuid(),
  share_enabled BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_share_token ON documents(share_token);

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select" ON documents
FOR SELECT USING (can_access_tenant(tenant_id));

CREATE POLICY "documents_insert" ON documents
FOR INSERT WITH CHECK (can_access_tenant(tenant_id));

CREATE POLICY "documents_update" ON documents
FOR UPDATE USING (can_access_tenant(tenant_id));

CREATE POLICY "documents_delete" ON documents
FOR DELETE USING (can_access_tenant(tenant_id));

-- Public sharing RPC
CREATE OR REPLACE FUNCTION public.get_shared_document(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'content', d.content,
    'status', d.status,
    'created_at', d.created_at,
    'updated_at', d.updated_at
  ) INTO v_doc
  FROM documents d
  WHERE d.share_token = p_token AND d.share_enabled = true
  LIMIT 1;

  RETURN v_doc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_document(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload config';

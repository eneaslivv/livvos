-- =============================================
-- Document Comments + Interactive Checklists
-- Allows anonymous viewers (via share token) to leave comments
-- and toggle checklist items on shared documents.
-- =============================================

-- 1. Document Comments Table
CREATE TABLE IF NOT EXISTS document_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  author_email TEXT,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_comments_document ON document_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_comments_tenant ON document_comments(tenant_id);

-- 2. RLS
ALTER TABLE document_comments ENABLE ROW LEVEL SECURITY;

-- Authenticated users in the tenant can do everything
DROP POLICY IF EXISTS "doc_comments_tenant" ON document_comments;
CREATE POLICY "doc_comments_tenant" ON document_comments
  FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

-- Anonymous users can read comments on shared documents
DROP POLICY IF EXISTS "doc_comments_anon_select" ON document_comments;
CREATE POLICY "doc_comments_anon_select" ON document_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_comments.document_id
        AND d.share_enabled = true
    )
  );

-- 3. Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE document_comments;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN OTHERS THEN NULL;
  END;
END $$;

-- 4. RPC: Add comment to shared document (anonymous-safe)
CREATE OR REPLACE FUNCTION public.add_shared_document_comment(
  p_token UUID,
  p_author_name TEXT,
  p_author_email TEXT,
  p_comment TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc RECORD;
  v_comment_id UUID;
BEGIN
  -- Validate input
  IF p_comment IS NULL OR TRIM(p_comment) = '' THEN
    RETURN jsonb_build_object('error', 'Comment cannot be empty');
  END IF;

  -- Find the shared document
  SELECT id, tenant_id, owner_id, title INTO v_doc
  FROM documents
  WHERE share_token = p_token AND share_enabled = true
  LIMIT 1;

  IF v_doc.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Document not found or sharing disabled');
  END IF;

  -- Insert comment
  INSERT INTO document_comments (document_id, tenant_id, author_name, author_email, comment)
  VALUES (v_doc.id, v_doc.tenant_id, COALESCE(NULLIF(TRIM(p_author_name), ''), 'Anonymous'), NULLIF(TRIM(p_author_email), ''), TRIM(p_comment))
  RETURNING id INTO v_comment_id;

  -- Notify document owner
  BEGIN
    PERFORM create_notification(
      v_doc.owner_id,
      'document',
      COALESCE(NULLIF(TRIM(p_author_name), ''), 'Someone') || ' commented on "' || v_doc.title || '"',
      LEFT(TRIM(p_comment), 80) || CASE WHEN LENGTH(TRIM(p_comment)) > 80 THEN '...' ELSE '' END,
      '/documents',
      jsonb_build_object('document_id', v_doc.id, 'comment_id', v_comment_id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Don't fail if notification fails
    NULL;
  END;

  RETURN jsonb_build_object(
    'id', v_comment_id,
    'document_id', v_doc.id,
    'author_name', COALESCE(NULLIF(TRIM(p_author_name), ''), 'Anonymous'),
    'comment', TRIM(p_comment),
    'created_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_shared_document_comment(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 5. RPC: Get comments for shared document (anonymous-safe)
CREATE OR REPLACE FUNCTION public.get_shared_document_comments(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc_id UUID;
  v_comments JSONB;
BEGIN
  SELECT id INTO v_doc_id
  FROM documents
  WHERE share_token = p_token AND share_enabled = true
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', dc.id,
      'author_name', dc.author_name,
      'comment', dc.comment,
      'created_at', dc.created_at
    ) ORDER BY dc.created_at ASC
  ), '[]'::JSONB) INTO v_comments
  FROM document_comments dc
  WHERE dc.document_id = v_doc_id;

  RETURN v_comments;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_document_comments(UUID) TO anon, authenticated;

-- 6. RPC: Toggle checklist item in shared document (anonymous-safe)
CREATE OR REPLACE FUNCTION public.toggle_shared_document_checklist(
  p_token UUID,
  p_content JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc_id UUID;
BEGIN
  -- Find the shared document
  SELECT id INTO v_doc_id
  FROM documents
  WHERE share_token = p_token AND share_enabled = true
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Document not found or sharing disabled');
  END IF;

  -- Update the content JSON (the full TipTap JSON with toggled checkbox)
  UPDATE documents
  SET content = p_content, updated_at = now()
  WHERE id = v_doc_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_shared_document_checklist(UUID, JSONB) TO anon, authenticated;

NOTIFY pgrst, 'reload config';

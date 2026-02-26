-- =============================================
-- Project Interactivity: Comments + Deliverable Approvals
-- =============================================

-- 1. Project Comments (threaded)
CREATE TABLE IF NOT EXISTS project_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'task', 'file', 'deliverable')),
  entity_id UUID,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  author_name TEXT NOT NULL,
  author_email TEXT,
  is_external BOOLEAN DEFAULT false,
  parent_id UUID REFERENCES project_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_comments_project_id ON project_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_comments_entity ON project_comments(entity_type, entity_id);

ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

-- Tenant members: full access
DROP POLICY IF EXISTS "project_comments_tenant_manage" ON project_comments;
CREATE POLICY "project_comments_tenant_manage" ON project_comments
FOR ALL USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

-- Shared users: read
DROP POLICY IF EXISTS "project_comments_shared_select" ON project_comments;
CREATE POLICY "project_comments_shared_select" ON project_comments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM project_shares ps
    WHERE ps.project_id = project_comments.project_id
    AND ps.user_id = auth.uid()
    AND ps.status = 'accepted'
  )
);

-- Shared collaborators: insert their own comments
DROP POLICY IF EXISTS "project_comments_shared_insert" ON project_comments;
CREATE POLICY "project_comments_shared_insert" ON project_comments
FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND is_external = true
  AND EXISTS (
    SELECT 1 FROM project_shares ps
    WHERE ps.project_id = project_comments.project_id
    AND ps.user_id = auth.uid()
    AND ps.status = 'accepted'
    AND ps.role IN ('collaborator', 'editor')
  )
);

-- 2. Deliverable Approvals
CREATE TABLE IF NOT EXISTS deliverable_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revision_requested')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverable_approvals_project_id ON deliverable_approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_approvals_status ON deliverable_approvals(status);

ALTER TABLE deliverable_approvals ENABLE ROW LEVEL SECURITY;

-- Tenant members: full access
DROP POLICY IF EXISTS "deliverable_approvals_tenant_manage" ON deliverable_approvals;
CREATE POLICY "deliverable_approvals_tenant_manage" ON deliverable_approvals
FOR ALL USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

-- Shared users: read
DROP POLICY IF EXISTS "deliverable_approvals_shared_select" ON deliverable_approvals;
CREATE POLICY "deliverable_approvals_shared_select" ON deliverable_approvals
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM project_shares ps
    WHERE ps.project_id = deliverable_approvals.project_id
    AND ps.user_id = auth.uid()
    AND ps.status = 'accepted'
  )
);

-- Shared collaborators: update (approve/reject)
DROP POLICY IF EXISTS "deliverable_approvals_shared_update" ON deliverable_approvals;
CREATE POLICY "deliverable_approvals_shared_update" ON deliverable_approvals
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM project_shares ps
    WHERE ps.project_id = deliverable_approvals.project_id
    AND ps.user_id = auth.uid()
    AND ps.status = 'accepted'
    AND ps.role IN ('collaborator', 'editor')
  )
);

-- 3. RPC: Submit a comment
CREATE OR REPLACE FUNCTION submit_project_comment(
  p_project_id UUID,
  p_entity_type TEXT,
  p_content TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_parent_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_share project_shares%ROWTYPE;
  v_user RECORD;
  v_comment_id UUID;
  v_is_external BOOLEAN := true;
  v_tenant_id UUID;
BEGIN
  -- Get project tenant
  SELECT p.tenant_id INTO v_tenant_id FROM projects p WHERE p.id = p_project_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Proyecto no encontrado');
  END IF;

  -- Check if tenant member
  IF can_access_tenant(v_tenant_id) THEN
    v_is_external := false;
  ELSE
    -- Check project share access
    SELECT * INTO v_share FROM project_shares
    WHERE project_id = p_project_id AND user_id = auth.uid() AND status = 'accepted'
    AND role IN ('collaborator', 'editor')
    LIMIT 1;

    IF v_share.id IS NULL THEN
      RETURN jsonb_build_object('error', 'Sin acceso para comentar');
    END IF;
  END IF;

  SELECT id, email, COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)) AS name
  FROM auth.users WHERE id = auth.uid() INTO v_user;

  INSERT INTO project_comments (
    project_id, tenant_id, entity_type, entity_id, content,
    author_id, author_name, author_email, is_external, parent_id
  ) VALUES (
    p_project_id, v_tenant_id, p_entity_type, p_entity_id, p_content,
    auth.uid(), v_user.name, v_user.email, v_is_external, p_parent_id
  ) RETURNING id INTO v_comment_id;

  RETURN jsonb_build_object('id', v_comment_id, 'success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_project_comment TO authenticated;

-- 4. RPC: Review a deliverable
CREATE OR REPLACE FUNCTION review_deliverable(
  p_deliverable_id UUID,
  p_status TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deliverable deliverable_approvals%ROWTYPE;
BEGIN
  SELECT * INTO v_deliverable FROM deliverable_approvals WHERE id = p_deliverable_id;
  IF v_deliverable.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Entregable no encontrado');
  END IF;

  -- Verify access
  IF NOT can_access_tenant(v_deliverable.tenant_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM project_shares ps
      WHERE ps.project_id = v_deliverable.project_id
      AND ps.user_id = auth.uid() AND ps.status = 'accepted'
      AND ps.role IN ('collaborator', 'editor')
    ) THEN
      RETURN jsonb_build_object('error', 'Sin acceso para revisar');
    END IF;
  END IF;

  UPDATE deliverable_approvals
  SET status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_comment = p_comment,
      updated_at = now()
  WHERE id = p_deliverable_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION review_deliverable TO authenticated;

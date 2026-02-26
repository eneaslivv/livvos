-- =============================================
-- Project Sharing System
-- Invite-only access to projects for external users.
-- Follows the ProposalPublic pattern: SECURITY DEFINER RPCs.
-- =============================================

-- 1. project_shares: tracks who has access to which project
CREATE TABLE IF NOT EXISTS project_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'collaborator' CHECK (role IN ('viewer', 'collaborator', 'editor')),
  token UUID DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, email)
);

CREATE INDEX IF NOT EXISTS idx_project_shares_project_id ON project_shares(project_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_user_id ON project_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_token ON project_shares(token);

ALTER TABLE project_shares ENABLE ROW LEVEL SECURITY;

-- Tenant members can manage shares
DROP POLICY IF EXISTS "project_shares_tenant_manage" ON project_shares;
CREATE POLICY "project_shares_tenant_manage" ON project_shares
FOR ALL USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

-- Shared users can read their own share record
DROP POLICY IF EXISTS "project_shares_self_select" ON project_shares;
CREATE POLICY "project_shares_self_select" ON project_shares
FOR SELECT USING (
  user_id = auth.uid()
);

-- Anyone can read a share by token (for invite acceptance)
DROP POLICY IF EXISTS "project_shares_token_select" ON project_shares;
CREATE POLICY "project_shares_token_select" ON project_shares
FOR SELECT USING (true);

-- 2. RPC: Accept a project share invitation
CREATE OR REPLACE FUNCTION accept_project_share(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_share project_shares%ROWTYPE;
  v_user_email TEXT;
BEGIN
  SELECT email FROM auth.users WHERE id = auth.uid() INTO v_user_email;

  SELECT * INTO v_share
  FROM project_shares
  WHERE token = p_token
    AND status = 'pending'
  LIMIT 1;

  IF v_share.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invitación no encontrada o ya aceptada');
  END IF;

  -- Verify email matches (case-insensitive)
  IF lower(v_share.email) != lower(v_user_email) THEN
    RETURN jsonb_build_object('error', 'Esta invitación es para otro email');
  END IF;

  UPDATE project_shares
  SET status = 'accepted',
      user_id = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  WHERE id = v_share.id;

  RETURN jsonb_build_object(
    'success', true,
    'project_id', v_share.project_id,
    'role', v_share.role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_project_share(UUID) TO authenticated;

-- 3. RPC: Get shared project data (bypasses RLS for external users)
CREATE OR REPLACE FUNCTION get_shared_project(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_share project_shares%ROWTYPE;
  v_project RECORD;
  v_result JSONB;
  v_is_tenant_member BOOLEAN := false;
BEGIN
  -- Check if user is a tenant member (can access via normal RLS)
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id
    AND can_access_tenant(p.tenant_id)
  ) INTO v_is_tenant_member;

  -- If not tenant member, check project_shares
  IF NOT v_is_tenant_member THEN
    SELECT * INTO v_share
    FROM project_shares
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND status = 'accepted'
    LIMIT 1;

    IF v_share.id IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Fetch project
  SELECT p.id, p.title, p.description, p.status, p.created_at, p.updated_at,
         c.name AS client_name, c.company AS client_company
  INTO v_project
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  WHERE p.id = p_project_id;

  IF v_project.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_result := jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'title', v_project.title,
      'description', v_project.description,
      'status', v_project.status,
      'created_at', v_project.created_at,
      'updated_at', v_project.updated_at,
      'client_name', v_project.client_name,
      'client_company', v_project.client_company
    ),
    'share_role', COALESCE(v_share.role, 'editor'),
    'tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'description', t.description,
        'completed', t.completed, 'status', t.status, 'priority', t.priority,
        'due_date', t.due_date, 'start_date', t.start_date,
        'parent_task_id', t.parent_task_id
      ) ORDER BY t.completed ASC, t.created_at DESC), '[]'::jsonb)
      FROM tasks t WHERE t.project_id = p_project_id
    ),
    'files', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'type', f.type,
        'size', f.size, 'url', f.url, 'created_at', f.created_at
      ) ORDER BY f.created_at DESC), '[]'::jsonb)
      FROM files f WHERE f.project_id = p_project_id
    ),
    'team', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', pr.name, 'email', pr.email, 'avatar_url', pr.avatar_url
      )), '[]'::jsonb)
      FROM project_members pm
      JOIN profiles pr ON pr.id = pm.member_id
      WHERE pm.project_id = p_project_id
    ),
    'shares', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'email', ps.email, 'role', ps.role, 'status', ps.status,
        'accepted_at', ps.accepted_at
      )), '[]'::jsonb)
      FROM project_shares ps WHERE ps.project_id = p_project_id AND ps.status != 'revoked'
    ),
    'comments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pc.id, 'entity_type', pc.entity_type, 'entity_id', pc.entity_id,
        'content', pc.content, 'author_name', pc.author_name,
        'is_external', pc.is_external, 'parent_id', pc.parent_id,
        'created_at', pc.created_at
      ) ORDER BY pc.created_at ASC), '[]'::jsonb)
      FROM project_comments pc WHERE pc.project_id = p_project_id
    ),
    'deliverables', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', da.id, 'task_id', da.task_id, 'title', da.title,
        'description', da.description, 'status', da.status,
        'reviewed_by', da.reviewed_by, 'reviewed_at', da.reviewed_at,
        'review_comment', da.review_comment, 'created_at', da.created_at
      ) ORDER BY da.created_at DESC), '[]'::jsonb)
      FROM deliverable_approvals da WHERE da.project_id = p_project_id
    )
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_shared_project(UUID) TO authenticated;

-- Extend get_shared_project RPC with fields needed for portal-style view:
-- tasks: group_name, completed_at
-- project: client_id
-- new subqueries: incomes (with installments), activity, credentials, client_documents

CREATE OR REPLACE FUNCTION get_shared_project(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_share project_shares%ROWTYPE;
  v_project RECORD;
  v_result JSONB;
  v_is_tenant_member BOOLEAN := false;
  v_client_id UUID;
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
         p.client_id,
         c.name AS client_name, c.company AS client_company
  INTO v_project
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  WHERE p.id = p_project_id;

  IF v_project.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_client_id := v_project.client_id;

  v_result := jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'title', v_project.title,
      'description', v_project.description,
      'status', v_project.status,
      'created_at', v_project.created_at,
      'updated_at', v_project.updated_at,
      'client_id', v_project.client_id,
      'client_name', v_project.client_name,
      'client_company', v_project.client_company
    ),
    'share_role', COALESCE(v_share.role, 'editor'),
    'tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'description', t.description,
        'completed', t.completed, 'status', t.status, 'priority', t.priority,
        'due_date', t.due_date, 'start_date', t.start_date,
        'parent_task_id', t.parent_task_id,
        'group_name', t.group_name,
        'completed_at', t.completed_at
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
    ),
    -- New portal fields
    'incomes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'concept', i.concept,
        'total_amount', i.total_amount,
        'status', i.status,
        'due_date', i.due_date,
        'installments', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', inst.id, 'number', inst.number, 'amount', inst.amount,
            'due_date', inst.due_date, 'paid_date', inst.paid_date, 'status', inst.status
          ) ORDER BY inst.number), '[]'::jsonb)
          FROM installments inst WHERE inst.income_id = i.id
        )
      ) ORDER BY i.due_date), '[]'::jsonb)
      FROM incomes i WHERE i.project_id = p_project_id
    ),
    'activity', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', al.id,
        'action', al.action,
        'created_at', al.created_at
      ) ORDER BY al.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, action, created_at
        FROM activity_logs
        WHERE project_id = p_project_id
        ORDER BY created_at DESC
        LIMIT 8
      ) al
    ),
    'credentials', CASE WHEN v_client_id IS NOT NULL THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', cc.id, 'service', cc.service,
        'username', cc.username, 'secret', cc.secret
      )), '[]'::jsonb)
      FROM client_credentials cc WHERE cc.client_id = v_client_id
    ) ELSE '[]'::jsonb END,
    'client_documents', CASE WHEN v_client_id IS NOT NULL THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', cd.id, 'name', cd.name,
        'doc_type', cd.doc_type, 'url', cd.url, 'size_label', cd.size_label
      )), '[]'::jsonb)
      FROM client_documents cd WHERE cd.client_id = v_client_id
    ) ELSE '[]'::jsonb END
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_shared_project(UUID) TO authenticated;

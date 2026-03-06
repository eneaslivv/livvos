-- =============================================
-- Public Portal Sharing System
-- Adds public/request-access modes for project portals.
-- =============================================

-- 1. New columns on projects for portal sharing
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portal_share_mode TEXT DEFAULT 'disabled'
  CHECK (portal_share_mode IN ('disabled','public','request'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portal_share_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_portal_token ON projects(portal_share_token);

-- 2. Access requests table
CREATE TABLE IF NOT EXISTS portal_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, email)
);

CREATE INDEX IF NOT EXISTS idx_portal_access_requests_project ON portal_access_requests(project_id);
ALTER TABLE portal_access_requests ENABLE ROW LEVEL SECURITY;

-- Tenant members can manage requests
DROP POLICY IF EXISTS "portal_access_requests_tenant" ON portal_access_requests;
CREATE POLICY "portal_access_requests_tenant" ON portal_access_requests
FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

-- 3. RPC: Get public portal data (works for anon + authenticated)
CREATE OR REPLACE FUNCTION get_public_portal(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_project RECORD;
  v_client_id UUID;
BEGIN
  -- Find project by portal_share_token
  SELECT p.id, p.title, p.description, p.status, p.created_at, p.updated_at,
         p.portal_share_mode, p.client_id, p.tenant_id,
         c.name AS client_name, c.company AS client_company
  INTO v_project
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  WHERE p.portal_share_token = p_token;

  IF v_project.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- If disabled, return null
  IF v_project.portal_share_mode = 'disabled' THEN
    RETURN NULL;
  END IF;

  -- If request mode, return only basic info (for the request form)
  IF v_project.portal_share_mode = 'request' THEN
    RETURN jsonb_build_object(
      'mode', 'request',
      'project', jsonb_build_object(
        'id', v_project.id,
        'title', v_project.title,
        'status', v_project.status,
        'client_name', v_project.client_name,
        'client_company', v_project.client_company
      )
    );
  END IF;

  -- Public mode: return full portal data
  v_client_id := v_project.client_id;

  RETURN jsonb_build_object(
    'mode', 'public',
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
    'tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title,
        'completed', t.completed, 'status', t.status, 'priority', t.priority,
        'due_date', t.due_date, 'start_date', t.start_date,
        'parent_task_id', t.parent_task_id,
        'group_name', t.group_name,
        'completed_at', t.completed_at
      ) ORDER BY t.completed ASC, t.created_at DESC), '[]'::jsonb)
      FROM tasks t WHERE t.project_id = v_project.id
    ),
    'files', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'type', f.type,
        'size', f.size, 'url', f.url
      ) ORDER BY f.created_at DESC), '[]'::jsonb)
      FROM files f WHERE f.project_id = v_project.id
    ),
    'incomes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.id, 'concept', i.concept, 'total_amount', i.total_amount,
        'status', i.status, 'due_date', i.due_date,
        'installments', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', inst.id, 'number', inst.number, 'amount', inst.amount,
            'due_date', inst.due_date, 'paid_date', inst.paid_date, 'status', inst.status
          ) ORDER BY inst.number), '[]'::jsonb)
          FROM installments inst WHERE inst.income_id = i.id
        )
      ) ORDER BY i.due_date), '[]'::jsonb)
      FROM incomes i WHERE i.project_id = v_project.id
    ),
    'activity', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', al.id, 'action', al.action, 'created_at', al.created_at
      ) ORDER BY al.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, action, created_at FROM activity_logs
        WHERE project_id = v_project.id ORDER BY created_at DESC LIMIT 8
      ) al
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_portal(UUID) TO anon, authenticated;

-- 4. RPC: Request access to a portal (works for anon)
CREATE OR REPLACE FUNCTION request_portal_access(p_token UUID, p_name TEXT, p_email TEXT, p_message TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_project RECORD;
  v_request_id UUID;
  v_owner_id UUID;
BEGIN
  -- Find project
  SELECT p.id, p.title, p.portal_share_mode, p.tenant_id,
         (SELECT pr.id FROM profiles pr WHERE pr.tenant_id = p.tenant_id AND pr.role = 'owner' LIMIT 1) AS owner_id
  INTO v_project
  FROM projects p
  WHERE p.portal_share_token = p_token;

  IF v_project.id IS NULL OR v_project.portal_share_mode != 'request' THEN
    RETURN jsonb_build_object('error', 'This link does not accept access requests');
  END IF;

  -- Check for existing request
  IF EXISTS (SELECT 1 FROM portal_access_requests WHERE project_id = v_project.id AND email = lower(p_email)) THEN
    RETURN jsonb_build_object('error', 'You have already requested access to this project');
  END IF;

  -- Insert request
  INSERT INTO portal_access_requests (project_id, tenant_id, name, email, message)
  VALUES (v_project.id, v_project.tenant_id, p_name, lower(p_email), p_message)
  RETURNING id INTO v_request_id;

  -- Get project owner for notification
  v_owner_id := v_project.owner_id;
  IF v_owner_id IS NULL THEN
    -- Fallback: get any admin/owner profile
    SELECT pr.id INTO v_owner_id
    FROM profiles pr WHERE pr.tenant_id = v_project.tenant_id
    ORDER BY CASE WHEN pr.role = 'owner' THEN 0 WHEN pr.role = 'admin' THEN 1 ELSE 2 END
    LIMIT 1;
  END IF;

  -- Create notification for the owner
  IF v_owner_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, tenant_id, type, title, message,
      action_required, metadata, priority, category, read)
    VALUES (
      v_owner_id,
      v_project.tenant_id,
      'invite',
      'Portal access request',
      p_name || ' requests access to ' || v_project.title,
      true,
      jsonb_build_object(
        'request_id', v_request_id,
        'project_id', v_project.id,
        'project_title', v_project.title,
        'email', lower(p_email),
        'name', p_name,
        'message', p_message
      ),
      'medium',
      'project',
      false
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION request_portal_access(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 5. RPC: Review (approve/reject) a portal access request
CREATE OR REPLACE FUNCTION review_portal_request(p_request_id UUID, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_project RECORD;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('error', 'Status must be approved or rejected');
  END IF;

  -- Get request
  SELECT * INTO v_request FROM portal_access_requests WHERE id = p_request_id;
  IF v_request.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Request not found');
  END IF;

  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Request already reviewed');
  END IF;

  -- Verify caller has access to the tenant
  IF NOT can_access_tenant(v_request.tenant_id) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  -- Update request
  UPDATE portal_access_requests
  SET status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_request_id;

  -- If approved, create a project_share entry so they can view via SharedProjectView
  IF p_status = 'approved' THEN
    INSERT INTO project_shares (project_id, tenant_id, email, role, status, invited_by, accepted_at)
    VALUES (v_request.project_id, v_request.tenant_id, v_request.email, 'viewer', 'accepted', auth.uid(), now())
    ON CONFLICT (project_id, email) DO UPDATE SET status = 'accepted', role = 'viewer', accepted_at = now();
  END IF;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION review_portal_request(UUID, TEXT) TO authenticated;

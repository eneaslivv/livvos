-- Fix get_public_portal: activity_logs has no project_id column
-- Use metadata->>'project_id' instead, with fallback to empty array

CREATE OR REPLACE FUNCTION get_public_portal(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_project RECORD;
  v_client_id UUID;
  v_activity JSONB;
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

  -- Safely get activity (activity_logs may not have project_id column)
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', al.id, 'action', al.action, 'created_at', al.created_at
    ) ORDER BY al.created_at DESC), '[]'::jsonb)
    INTO v_activity
    FROM (
      SELECT id, action, created_at FROM activity_logs
      WHERE metadata->>'project_id' = v_project.id::text
      ORDER BY created_at DESC LIMIT 8
    ) al;
  EXCEPTION WHEN OTHERS THEN
    v_activity := '[]'::jsonb;
  END;

  -- Public mode: return full portal data
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
    'activity', v_activity
  );
END;
$$;

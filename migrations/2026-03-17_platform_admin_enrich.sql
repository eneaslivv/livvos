-- Enrich platform_get_dashboard() with task_count and last_activity per tenant

CREATE OR REPLACE FUNCTION platform_get_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform admin';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total_tenants', (SELECT count(*) FROM tenants),
      'active_tenants', (SELECT count(*) FROM tenants WHERE status = 'active'),
      'suspended_tenants', (SELECT count(*) FROM tenants WHERE status = 'suspended'),
      'trial_tenants', (SELECT count(*) FROM tenants WHERE status = 'trial'),
      'total_users', (SELECT count(*) FROM profiles),
      'total_projects', (SELECT count(*) FROM projects),
      'tenants_created_last_30d', (SELECT count(*) FROM tenants WHERE created_at > now() - interval '30 days'),
      'tenants', (
        SELECT coalesce(jsonb_agg(t_row ORDER BY created_at DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'slug', t.slug,
            'status', t.status,
            'plan', COALESCE(t.plan, 'starter'),
            'owner_id', t.owner_id,
            'logo_url', t.logo_url,
            'contact_email', t.contact_email,
            'contact_name', t.contact_name,
            'trial_ends_at', t.trial_ends_at,
            'suspended_at', t.suspended_at,
            'suspended_reason', t.suspended_reason,
            'notes', t.notes,
            'created_at', t.created_at,
            'user_count', (SELECT count(*) FROM profiles WHERE tenant_id = t.id),
            'project_count', (SELECT count(*) FROM projects WHERE tenant_id = t.id),
            'task_count', (SELECT count(*) FROM tasks WHERE tenant_id = t.id),
            'owner_email', (SELECT email FROM profiles WHERE id = t.owner_id LIMIT 1),
            'last_activity', GREATEST(
              (SELECT max(updated_at) FROM projects WHERE tenant_id = t.id),
              (SELECT max(updated_at) FROM tasks WHERE tenant_id = t.id)
            )
          ) AS t_row, t.created_at
          FROM tenants t
        ) sub
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION platform_get_dashboard() TO authenticated;

NOTIFY pgrst, 'reload config';

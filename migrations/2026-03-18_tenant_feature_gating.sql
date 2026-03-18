-- Tenant Feature Gating: plan-based defaults, per-tenant overrides, feature enforcement
-- Adds projects_module, finance_module, documents_module to features
-- Fixes platform_create_tenant to write features properly
-- Extends platform_update_tenant to update tenant_config features/limits

-- 1. Helper: get default features + resource limits for a plan
CREATE OR REPLACE FUNCTION get_plan_defaults(p_plan TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_plan
    WHEN 'enterprise' THEN
      RETURN jsonb_build_object(
        'features', jsonb_build_object(
          'projects_module', true,
          'team_management', true,
          'sales_module', true,
          'finance_module', true,
          'documents_module', true,
          'notifications', true,
          'ai_assistant', true,
          'analytics', true,
          'calendar_integration', true,
          'client_portal', true,
          'document_versioning', true,
          'advanced_permissions', true
        ),
        'resource_limits', jsonb_build_object(
          'max_users', 100,
          'max_projects', 500,
          'max_storage_mb', 51200,
          'max_api_calls_per_month', 500000
        )
      );
    WHEN 'professional' THEN
      RETURN jsonb_build_object(
        'features', jsonb_build_object(
          'projects_module', true,
          'team_management', true,
          'sales_module', true,
          'finance_module', true,
          'documents_module', true,
          'notifications', true,
          'ai_assistant', true,
          'analytics', true,
          'calendar_integration', true,
          'client_portal', true,
          'document_versioning', false,
          'advanced_permissions', false
        ),
        'resource_limits', jsonb_build_object(
          'max_users', 25,
          'max_projects', 100,
          'max_storage_mb', 5120,
          'max_api_calls_per_month', 50000
        )
      );
    ELSE -- starter (default)
      RETURN jsonb_build_object(
        'features', jsonb_build_object(
          'projects_module', true,
          'team_management', true,
          'sales_module', true,
          'finance_module', true,
          'documents_module', true,
          'notifications', true,
          'ai_assistant', false,
          'analytics', true,
          'calendar_integration', false,
          'client_portal', false,
          'document_versioning', false,
          'advanced_permissions', false
        ),
        'resource_limits', jsonb_build_object(
          'max_users', 5,
          'max_projects', 20,
          'max_storage_mb', 1024,
          'max_api_calls_per_month', 10000
        )
      );
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION get_plan_defaults(TEXT) TO authenticated;

-- 2. Fix platform_create_tenant: write features + resource_limits as proper columns
DROP FUNCTION IF EXISTS platform_create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION platform_create_tenant(
  p_name TEXT,
  p_slug TEXT,
  p_owner_email TEXT,
  p_plan TEXT DEFAULT 'starter',
  p_contact_email TEXT DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL,
  p_features JSONB DEFAULT NULL,
  p_resource_limits JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_owner_role_id UUID;
  v_defaults JSONB;
  v_features JSONB;
  v_resource_limits JSONB;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform admin';
  END IF;

  IF EXISTS (SELECT 1 FROM tenants WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'Slug already exists: %', p_slug;
  END IF;

  -- Get plan defaults and merge with overrides
  v_defaults := get_plan_defaults(p_plan);
  v_features := COALESCE(p_features, v_defaults->'features');
  v_resource_limits := COALESCE(p_resource_limits, v_defaults->'resource_limits');

  -- Create tenant
  INSERT INTO tenants (name, slug, status, plan, contact_email, contact_name, created_at, updated_at)
  VALUES (p_name, p_slug, 'setup', p_plan, p_contact_email, p_contact_name, now(), now())
  RETURNING id INTO v_tenant_id;

  -- Create tenant_config with proper features and resource_limits columns
  INSERT INTO tenant_config (tenant_id, branding, features, resource_limits, security_settings, integrations, created_at, updated_at)
  VALUES (
    v_tenant_id,
    jsonb_build_object(
      'name', p_name,
      'primaryColor', '#6366f1',
      'secondaryColor', '#8b5cf6'
    ),
    v_features,
    v_resource_limits,
    jsonb_build_object(
      'require_2fa', false,
      'session_timeout_minutes', 480,
      'password_min_length', 8,
      'allow_public_sharing', false
    ),
    jsonb_build_object(
      'email_provider', null,
      'calendar_provider', null,
      'payment_processor', null,
      'ai_service', null
    ),
    now(), now()
  );

  -- Create invitation for the owner with 'owner' role
  SELECT id INTO v_owner_role_id FROM roles WHERE name = 'owner' LIMIT 1;

  INSERT INTO invitations (tenant_id, email, role_id, created_by, status, created_at, updated_at)
  VALUES (v_tenant_id, p_owner_email, v_owner_role_id, auth.uid(), 'pending', now(), now());

  RETURN v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated;

-- 3. Extend platform_update_tenant to also update tenant_config features/limits
DROP FUNCTION IF EXISTS platform_update_tenant(UUID, JSONB);

CREATE OR REPLACE FUNCTION platform_update_tenant(p_tenant_id UUID, p_updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform admin';
  END IF;

  -- Update tenant table fields
  UPDATE tenants SET
    plan = COALESCE(p_updates->>'plan', plan),
    notes = COALESCE(p_updates->>'notes', notes),
    contact_email = COALESCE(p_updates->>'contact_email', contact_email),
    contact_name = COALESCE(p_updates->>'contact_name', contact_name),
    trial_ends_at = CASE
      WHEN p_updates ? 'trial_ends_at' THEN (p_updates->>'trial_ends_at')::timestamptz
      ELSE trial_ends_at
    END,
    updated_at = now()
  WHERE id = p_tenant_id;

  -- Update tenant_config features and resource_limits if provided
  IF p_updates ? 'features' OR p_updates ? 'resource_limits' THEN
    UPDATE tenant_config SET
      features = CASE
        WHEN p_updates ? 'features' THEN p_updates->'features'
        ELSE features
      END,
      resource_limits = CASE
        WHEN p_updates ? 'resource_limits' THEN p_updates->'resource_limits'
        ELSE resource_limits
      END,
      updated_at = now()
    WHERE tenant_id = p_tenant_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_update_tenant(UUID, JSONB) TO authenticated;

-- 4. Backfill existing tenant_configs: add new feature keys with true (don't break existing tenants)
UPDATE tenant_config
SET features = features
  || jsonb_build_object('projects_module', true)
  || jsonb_build_object('finance_module', true)
  || jsonb_build_object('documents_module', true)
WHERE NOT (features ? 'projects_module');

-- 5. Update platform_get_dashboard to include features per tenant
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
            ),
            'features', (SELECT tc.features FROM tenant_config tc WHERE tc.tenant_id = t.id LIMIT 1),
            'resource_limits', (SELECT tc.resource_limits FROM tenant_config tc WHERE tc.tenant_id = t.id LIMIT 1)
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

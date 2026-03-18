-- =============================================
-- Platform Superadmin Layer
-- Allows platform owner to manage all tenants
-- from a centralized admin panel.
-- =============================================

-- 1. Platform Admins Table
CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(user_id)
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
-- No permissive policies — all access via SECURITY DEFINER functions only

-- 2. Extend tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'starter';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_name TEXT;

-- 3. Helper: is_platform_admin()
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated;

-- 4. RPC: Platform Dashboard
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
            'owner_email', (SELECT email FROM profiles WHERE id = t.owner_id LIMIT 1)
          ) AS t_row, t.created_at
          FROM tenants t
        ) sub
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION platform_get_dashboard() TO authenticated;

-- 5. RPC: Create Tenant
CREATE OR REPLACE FUNCTION platform_create_tenant(
  p_name TEXT,
  p_slug TEXT,
  p_owner_email TEXT,
  p_plan TEXT DEFAULT 'starter',
  p_contact_email TEXT DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_owner_role_id UUID;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform admin';
  END IF;

  -- Validate slug unique
  IF EXISTS (SELECT 1 FROM tenants WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'Slug already exists: %', p_slug;
  END IF;

  -- Create tenant
  INSERT INTO tenants (name, slug, status, plan, contact_email, contact_name, created_at, updated_at)
  VALUES (p_name, p_slug, 'setup', p_plan, p_contact_email, p_contact_name, now(), now())
  RETURNING id INTO v_tenant_id;

  -- Create tenant_config with defaults
  INSERT INTO tenant_config (tenant_id, branding, created_at, updated_at)
  VALUES (
    v_tenant_id,
    jsonb_build_object(
      'name', p_name,
      'primaryColor', '#6366f1',
      'secondaryColor', '#8b5cf6',
      'features', jsonb_build_object(
        'salesModule', true,
        'teamManagement', true,
        'clientPortal', false,
        'notifications', true,
        'aiAssistant', false
      )
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

GRANT EXECUTE ON FUNCTION platform_create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 6. RPC: Suspend Tenant
CREATE OR REPLACE FUNCTION platform_suspend_tenant(p_tenant_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform admin';
  END IF;

  UPDATE tenants
  SET status = 'suspended',
      suspended_at = now(),
      suspended_reason = p_reason,
      updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_suspend_tenant(UUID, TEXT) TO authenticated;

-- 7. RPC: Reactivate Tenant
CREATE OR REPLACE FUNCTION platform_reactivate_tenant(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform admin';
  END IF;

  UPDATE tenants
  SET status = 'active',
      suspended_at = NULL,
      suspended_reason = NULL,
      updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_reactivate_tenant(UUID) TO authenticated;

-- 8. RPC: Update Tenant (plan, notes, contact info)
CREATE OR REPLACE FUNCTION platform_update_tenant(p_tenant_id UUID, p_updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform admin';
  END IF;

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
END;
$$;

GRANT EXECUTE ON FUNCTION platform_update_tenant(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload config';

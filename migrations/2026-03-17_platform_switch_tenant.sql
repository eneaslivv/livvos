-- =============================================
-- Platform Admin: Switch Tenant
-- Allows platform admin to temporarily switch
-- into any tenant's context for viewing/demo.
-- =============================================

-- 1. Add original_tenant_id to profiles (to remember home tenant)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS original_tenant_id UUID REFERENCES tenants(id);

-- 2. Switch to any tenant (platform admin only)
CREATE OR REPLACE FUNCTION platform_switch_to_tenant(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform admin';
  END IF;

  -- Verify target tenant exists
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- Save original tenant_id if not already saved
  UPDATE profiles
  SET original_tenant_id = CASE
        WHEN original_tenant_id IS NULL THEN tenant_id
        ELSE original_tenant_id
      END,
      tenant_id = p_tenant_id
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION platform_switch_to_tenant(UUID) TO authenticated;

-- 3. Return to home tenant
CREATE OR REPLACE FUNCTION platform_return_to_home_tenant()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_original UUID;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform admin';
  END IF;

  SELECT original_tenant_id INTO v_original
  FROM profiles WHERE id = auth.uid();

  IF v_original IS NULL THEN
    RAISE EXCEPTION 'No original tenant to return to';
  END IF;

  UPDATE profiles
  SET tenant_id = v_original,
      original_tenant_id = NULL
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION platform_return_to_home_tenant() TO authenticated;

NOTIFY pgrst, 'reload config';

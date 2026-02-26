-- ==============================================================================
-- FIX: RLS helper functions use wrong column name (user_id → id)
-- The profiles table PK is "id" (references auth.users), NOT "user_id"
-- This bug causes can_access_tenant() to always return FALSE,
-- blocking ALL tenant-scoped data (projects, tasks, finances, etc.)
-- ==============================================================================

-- 1. Fix current_user_tenant()
CREATE OR REPLACE FUNCTION current_user_tenant()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id
    FROM profiles
    WHERE id = auth.uid()  -- FIX: was "user_id", correct column is "id"
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix is_tenant_owner()
CREATE OR REPLACE FUNCTION is_tenant_owner(p_tenant_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  v_tenant_id UUID;
  v_user_tenant UUID;
  v_tenant_owner_id UUID;
BEGIN
  v_tenant_id := COALESCE(p_tenant_id, current_user_tenant());

  SELECT tenant_id INTO v_user_tenant
  FROM profiles
  WHERE id = auth.uid();  -- FIX: was "user_id"

  SELECT owner_id INTO v_tenant_owner_id
  FROM tenants
  WHERE id = v_tenant_id;

  RETURN v_user_tenant = v_tenant_id
         AND auth.uid() = v_tenant_owner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix has_permission() — user_roles.user_id IS correct (that column exists)
CREATE OR REPLACE FUNCTION has_permission(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = auth.uid()
    AND p.module = p_module
    AND p.action = p_action
  ) OR is_tenant_owner();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Fix can_access_tenant()
CREATE OR REPLACE FUNCTION can_access_tenant(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_user_tenant() = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Fix get_user_roles()
CREATE OR REPLACE FUNCTION get_user_roles()
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT r.name
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

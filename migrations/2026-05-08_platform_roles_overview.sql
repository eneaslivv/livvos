-- ============================================================================
-- Platform-level RPCs for the Master mode "Roles & Access" panel
-- ============================================================================
-- Lets the platform admin (Eneas) see the global picture of roles across
-- every tenant in one place: which roles exist, how many users hold each
-- role, how many tenants use it, and what permissions each role has.
-- All RPCs are SECURITY DEFINER and gated on is_platform_admin().
--
-- Surfaces:
--   • pages/PlatformRoles.tsx — main cross-tenant roles UI in Master mode.
-- ============================================================================

-- 1) Roles overview: one row per role with usage counts.
CREATE OR REPLACE FUNCTION platform_roles_overview()
RETURNS TABLE (
  role_id          UUID,
  role_name        TEXT,
  description      TEXT,
  is_system        BOOLEAN,
  user_count       INTEGER,
  tenant_count     INTEGER,
  permission_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin required';
  END IF;

  RETURN QUERY
  SELECT
    r.id                                              AS role_id,
    r.name                                            AS role_name,
    r.description                                     AS description,
    r.is_system                                       AS is_system,
    COALESCE((SELECT COUNT(DISTINCT tm.user_id)::INTEGER
              FROM tenant_members tm
              WHERE tm.role = r.name), 0)             AS user_count,
    COALESCE((SELECT COUNT(DISTINCT tm.tenant_id)::INTEGER
              FROM tenant_members tm
              WHERE tm.role = r.name), 0)             AS tenant_count,
    COALESCE((SELECT COUNT(*)::INTEGER
              FROM role_permissions rp
              WHERE rp.role_id = r.id), 0)            AS permission_count
  FROM roles r
  ORDER BY r.is_system DESC, r.name;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_roles_overview() TO authenticated;

-- 2) Permissions catalog: every (module, action) defined in the system.
CREATE OR REPLACE FUNCTION platform_permissions_catalog()
RETURNS TABLE (
  permission_id UUID,
  module        TEXT,
  action        TEXT,
  description   TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin required';
  END IF;

  RETURN QUERY
  SELECT p.id, p.module, p.action, p.description
  FROM permissions p
  ORDER BY p.module, p.action;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_permissions_catalog() TO authenticated;

-- 3) Permissions per role: lists each (role_id, permission_id) pairing.
CREATE OR REPLACE FUNCTION platform_role_permissions()
RETURNS TABLE (
  role_id       UUID,
  permission_id UUID,
  module        TEXT,
  action        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin required';
  END IF;

  RETURN QUERY
  SELECT rp.role_id, rp.permission_id, p.module, p.action
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_role_permissions() TO authenticated;

-- 4) Cross-tenant usage stats: counts of users by role per tenant.
--    Powers the Master Dashboard "where are users concentrated" widget.
CREATE OR REPLACE FUNCTION platform_users_by_role_by_tenant()
RETURNS TABLE (
  tenant_id    UUID,
  tenant_name  TEXT,
  role_name    TEXT,
  user_count   INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin required';
  END IF;

  RETURN QUERY
  SELECT
    tm.tenant_id                                AS tenant_id,
    t.name                                      AS tenant_name,
    COALESCE(tm.role, 'unassigned')             AS role_name,
    COUNT(DISTINCT tm.user_id)::INTEGER         AS user_count
  FROM tenant_members tm
  JOIN tenants t ON t.id = tm.tenant_id
  GROUP BY tm.tenant_id, t.name, tm.role
  ORDER BY t.name, tm.role NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_users_by_role_by_tenant() TO authenticated;

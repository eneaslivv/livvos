-- ============================================================================
-- platform_tenant_members — list members of a tenant for the Master panel
-- ============================================================================
-- Used by the Customer detail panel in Master → Customers to render a small
-- members table next to the feature toggles, so Eneas can see which users
-- live in a tenant and what role they hold without "switching into" it.
-- ============================================================================

CREATE OR REPLACE FUNCTION platform_tenant_members(p_tenant_id UUID)
RETURNS TABLE (
  user_id      UUID,
  email        TEXT,
  full_name    TEXT,
  role         TEXT,
  source       TEXT,
  joined_at    TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
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
    tm.user_id,
    u.email::text                                AS email,
    COALESCE(p.full_name, p.name, u.email::text) AS full_name,
    COALESCE(tm.role, 'unassigned')              AS role,
    COALESCE(tm.source, 'invite')                AS source,
    tm.created_at                                AS joined_at,
    u.last_sign_in_at                            AS last_seen_at
  FROM tenant_members tm
  JOIN auth.users u  ON u.id = tm.user_id
  LEFT JOIN profiles p ON p.id = tm.user_id
  WHERE tm.tenant_id = p_tenant_id
  ORDER BY tm.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_tenant_members(UUID) TO authenticated;

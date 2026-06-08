-- get_tenant_members(p_tenant_id) — stable Members-panel source
--
-- The Members panel previously listed `profiles WHERE tenant_id = <tenant>`.
-- But switch_active_tenant() rewrites profiles.tenant_id to the user's
-- *currently active* workspace, so a member who switched into another
-- workspace disappeared from this tenant's Members list, and multi-tenant
-- members (e.g. someone who belongs to both an agency and a client tenant)
-- flickered in and out of each tenant's list depending on where they last
-- logged in.
--
-- This RPC returns the STABLE membership (tenant_members ∪ tenant owner)
-- joined to profile fields, independent of the transient profiles.tenant_id.
-- SECURITY DEFINER so a non-owner admin can read co-members and so members
-- whose profile currently points at another workspace are still returned.
-- Authorization is enforced inside the function: the caller must belong to
-- (or own) the tenant. Granted to `authenticated` only.
CREATE OR REPLACE FUNCTION public.get_tenant_members(p_tenant_id uuid)
RETURNS TABLE (
  id          uuid,
  email       text,
  name        text,
  avatar_url  text,
  status      text,
  member_role text,
  source      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: caller must belong to (or own) the tenant.
  IF NOT EXISTS (
        SELECT 1 FROM tenant_members tm
        WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid()
      )
     AND NOT EXISTS (
        SELECT 1 FROM tenants t
        WHERE t.id = p_tenant_id AND t.owner_id = auth.uid()
      )
  THEN
    RAISE EXCEPTION 'Not authorized to view members of this tenant';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.email,
         p.name,
         p.avatar_url,
         COALESCE(p.status, 'active')                                   AS status,
         COALESCE(tm.role, CASE WHEN t.owner_id = p.id THEN 'owner' END) AS member_role,
         tm.source
  FROM profiles p
  JOIN tenants t ON t.id = p_tenant_id
  LEFT JOIN LATERAL (
        SELECT m.role, m.source
        FROM tenant_members m
        WHERE m.tenant_id = p_tenant_id AND m.user_id = p.id
        LIMIT 1
  ) tm ON true
  WHERE EXISTS (
          SELECT 1 FROM tenant_members m2
          WHERE m2.tenant_id = p_tenant_id AND m2.user_id = p.id
        )
     OR t.owner_id = p.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_members(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_tenant_members(uuid) FROM anon, public;

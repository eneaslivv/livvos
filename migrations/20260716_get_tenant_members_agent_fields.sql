-- get_tenant_members v3: add agent designation fields.
--
-- Why: TeamContext used to build the team list from an UNSCOPED
-- `profiles.select('*')`, relying on the "same-tenant profiles" RLS policy.
-- That policy filters by profiles.tenant_id — the user's *currently active
-- workspace* (rewritten by switch_active_tenant), NOT tenant membership.
-- Result: while browsing CK Studio, the Calendar team filter showed every
-- Livv Studio member (cross-tenant data leak, e.g. wworjroh@gmail.com).
--
-- TeamContext now sources members from this RPC (like UserManagement and
-- refreshUsage already do — one source of truth: tenant_members). It needs
-- the profiles.is_agent / agent_* columns, so we extend the return table.
-- DROP first: CREATE OR REPLACE cannot change an OUT/RETURNS TABLE shape.

DROP FUNCTION IF EXISTS public.get_tenant_members(uuid);

CREATE FUNCTION public.get_tenant_members(p_tenant_id uuid)
RETURNS TABLE(
  id uuid,
  email text,
  name text,
  avatar_url text,
  status text,
  member_role text,
  source text,
  last_seen_at timestamptz,
  is_agent boolean,
  agent_type text,
  agent_description text,
  agent_connected boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
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
         COALESCE(p.status, 'active')                                    AS status,
         COALESCE(tm.role, CASE WHEN t.owner_id = p.id THEN 'owner' END) AS member_role,
         tm.source,
         p.last_seen_at,
         COALESCE(p.is_agent, false)                                     AS is_agent,
         p.agent_type,
         p.agent_description,
         COALESCE(p.agent_connected, false)                              AS agent_connected
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_tenant_members(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_tenant_members(uuid) FROM anon;

-- =============================================
-- Super Agency: cross-tenant membership + connections
--
-- A super-agency tenant (LIVV) can connect to client-agency tenants.
-- After the client owner accepts, the super-agency owner becomes a
-- member of the client tenant and can switch into it via TenantSwitcher.
--
-- Phase 1: connection lifecycle + multi-tenant membership.
-- Phase 2 (separate migration): mention-triggered task mirroring.
-- =============================================

-- 1. Tenant flags + parent linkage
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_super_agency BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS parent_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_parent ON tenants(parent_tenant_id) WHERE parent_tenant_id IS NOT NULL;

-- 2. Multi-tenant membership (user can belong to N tenants)
CREATE TABLE IF NOT EXISTS tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin', -- 'owner', 'admin', 'external_collaborator'
  source TEXT NOT NULL DEFAULT 'native', -- 'native' | 'connection' (came in via tenant_connections)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON tenant_members(tenant_id);

-- 3. Backfill existing profiles → tenant_members (everyone keeps current access)
INSERT INTO tenant_members (user_id, tenant_id, role, source)
SELECT
  p.id,
  p.tenant_id,
  CASE
    WHEN t.owner_id = p.id THEN 'owner'
    ELSE 'admin'
  END,
  'native'
FROM profiles p
JOIN tenants t ON t.id = p.tenant_id
WHERE p.tenant_id IS NOT NULL
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- 4. Connection table (parent agency ↔ child agency, with invite flow)
CREATE TABLE IF NOT EXISTS tenant_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  child_tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- null until accepted (invitee may create new tenant)
  invited_email TEXT NOT NULL,
  invited_agency_name TEXT NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'revoked')),
  invited_by UUID REFERENCES auth.users(id),
  accepted_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(token)
);

CREATE INDEX IF NOT EXISTS idx_tenant_connections_parent ON tenant_connections(parent_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_connections_child ON tenant_connections(child_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_connections_token ON tenant_connections(token);
CREATE INDEX IF NOT EXISTS idx_tenant_connections_email ON tenant_connections(invited_email);

-- 5. RLS
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own memberships" ON tenant_members;
CREATE POLICY "Users see own memberships" ON tenant_members
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Tenant owners see their members" ON tenant_members;
CREATE POLICY "Tenant owners see their members" ON tenant_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tenants t WHERE t.id = tenant_members.tenant_id AND t.owner_id = auth.uid())
  );

-- Connections: parent owner sees outbound, child owner sees inbound
DROP POLICY IF EXISTS "Connection participants can read" ON tenant_connections;
CREATE POLICY "Connection participants can read" ON tenant_connections
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tenants t WHERE t.id = tenant_connections.parent_tenant_id AND t.owner_id = auth.uid())
    OR (
      child_tenant_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = tenant_connections.child_tenant_id AND t.owner_id = auth.uid())
    )
    OR invited_email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

-- 6. RPC: list tenants the current user can switch into
CREATE OR REPLACE FUNCTION get_my_tenants()
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  tenant_slug TEXT,
  logo_url TEXT,
  role TEXT,
  source TEXT,
  is_super_agency BOOLEAN,
  parent_tenant_id UUID,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_tenant UUID;
BEGIN
  SELECT p.tenant_id INTO v_active_tenant FROM profiles p WHERE p.id = auth.uid();

  RETURN QUERY
    SELECT
      t.id,
      t.name,
      t.slug,
      t.logo_url,
      tm.role,
      tm.source,
      COALESCE(t.is_super_agency, FALSE),
      t.parent_tenant_id,
      (t.id = v_active_tenant)
    FROM tenant_members tm
    JOIN tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = auth.uid()
    ORDER BY
      COALESCE(t.is_super_agency, FALSE) DESC,
      t.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_tenants() TO authenticated;

-- 7. RPC: switch active tenant (validates membership)
CREATE OR REPLACE FUNCTION switch_active_tenant(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'You are not a member of this tenant';
  END IF;

  UPDATE profiles SET tenant_id = p_tenant_id WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION switch_active_tenant(UUID) TO authenticated;

-- 8. RPC: super-agency creates a connection invite
CREATE OR REPLACE FUNCTION create_connection_invite(
  p_invited_email TEXT,
  p_invited_agency_name TEXT
)
RETURNS TABLE (
  connection_id UUID,
  invite_token UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_tenant UUID;
  v_connection_id UUID;
  v_token UUID;
BEGIN
  -- Resolve caller's active tenant + verify it's a super agency
  SELECT p.tenant_id INTO v_parent_tenant FROM profiles p WHERE p.id = auth.uid();

  IF v_parent_tenant IS NULL THEN
    RAISE EXCEPTION 'No active tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tenants
    WHERE id = v_parent_tenant
      AND COALESCE(is_super_agency, FALSE) = TRUE
      AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only super agency owners can create connection invites';
  END IF;

  INSERT INTO tenant_connections (
    parent_tenant_id, invited_email, invited_agency_name,
    invited_by, status
  ) VALUES (
    v_parent_tenant, lower(trim(p_invited_email)), trim(p_invited_agency_name),
    auth.uid(), 'pending'
  )
  RETURNING id, token INTO v_connection_id, v_token;

  RETURN QUERY SELECT v_connection_id, v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION create_connection_invite(TEXT, TEXT) TO authenticated;

-- 9. RPC: verify connection token (public — used by accept page before login)
CREATE OR REPLACE FUNCTION verify_connection_token(p_token UUID)
RETURNS TABLE (
  parent_tenant_name TEXT,
  parent_tenant_logo TEXT,
  invited_email TEXT,
  invited_agency_name TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      t.name,
      t.logo_url,
      tc.invited_email,
      tc.invited_agency_name,
      tc.status
    FROM tenant_connections tc
    JOIN tenants t ON t.id = tc.parent_tenant_id
    WHERE tc.token = p_token
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_connection_token(UUID) TO anon, authenticated;

-- 10. RPC: child agency owner accepts connection
CREATE OR REPLACE FUNCTION accept_connection(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection tenant_connections%ROWTYPE;
  v_user_email TEXT;
  v_child_tenant UUID;
  v_parent_owner UUID;
BEGIN
  SELECT * INTO v_connection FROM tenant_connections WHERE token = p_token;

  IF v_connection IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_connection.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer pending (status: %)', v_connection.status;
  END IF;

  SELECT email INTO v_user_email FROM profiles WHERE id = auth.uid();
  IF lower(v_user_email) <> v_connection.invited_email THEN
    RAISE EXCEPTION 'This invitation is for a different email';
  END IF;

  -- Resolve child tenant: caller's currently active tenant (must be its owner)
  SELECT tenant_id INTO v_child_tenant FROM profiles WHERE id = auth.uid();

  IF v_child_tenant IS NULL THEN
    RAISE EXCEPTION 'You must have an active tenant to accept';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tenants WHERE id = v_child_tenant AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the tenant owner can accept connection invites';
  END IF;

  IF v_child_tenant = v_connection.parent_tenant_id THEN
    RAISE EXCEPTION 'Cannot connect a tenant to itself';
  END IF;

  -- Mark connection accepted, set child + parent linkage
  UPDATE tenant_connections SET
    status = 'accepted',
    child_tenant_id = v_child_tenant,
    accepted_by = auth.uid(),
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_connection.id;

  UPDATE tenants SET parent_tenant_id = v_connection.parent_tenant_id, updated_at = NOW()
  WHERE id = v_child_tenant AND parent_tenant_id IS NULL;

  -- Add the parent agency owner as a member of the child tenant
  SELECT owner_id INTO v_parent_owner FROM tenants WHERE id = v_connection.parent_tenant_id;
  IF v_parent_owner IS NOT NULL THEN
    INSERT INTO tenant_members (user_id, tenant_id, role, source)
    VALUES (v_parent_owner, v_child_tenant, 'admin', 'connection')
    ON CONFLICT (user_id, tenant_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'parent_tenant_id', v_connection.parent_tenant_id,
    'child_tenant_id', v_child_tenant
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_connection(UUID) TO authenticated;

-- 11. RPC: list connections for current super-agency tenant
CREATE OR REPLACE FUNCTION list_connections()
RETURNS TABLE (
  id UUID,
  child_tenant_id UUID,
  child_tenant_name TEXT,
  invited_email TEXT,
  invited_agency_name TEXT,
  status TEXT,
  token UUID,
  created_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT p.tenant_id INTO v_tenant FROM profiles p WHERE p.id = auth.uid();

  RETURN QUERY
    SELECT
      tc.id,
      tc.child_tenant_id,
      ct.name,
      tc.invited_email,
      tc.invited_agency_name,
      tc.status,
      tc.token,
      tc.created_at,
      tc.accepted_at
    FROM tenant_connections tc
    LEFT JOIN tenants ct ON ct.id = tc.child_tenant_id
    WHERE tc.parent_tenant_id = v_tenant
    ORDER BY tc.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION list_connections() TO authenticated;

-- 12. RPC: revoke a pending connection
CREATE OR REPLACE FUNCTION revoke_connection(p_connection_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT p.tenant_id INTO v_tenant FROM profiles p WHERE p.id = auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM tenant_connections
    WHERE id = p_connection_id AND parent_tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Connection not found or you are not the parent agency';
  END IF;

  UPDATE tenant_connections SET status = 'revoked', updated_at = NOW()
  WHERE id = p_connection_id;
END;
$$;

GRANT EXECUTE ON FUNCTION revoke_connection(UUID) TO authenticated;

NOTIFY pgrst, 'reload config';

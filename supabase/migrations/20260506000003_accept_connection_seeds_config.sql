-- ============================================================================
-- accept_connection — auto-seed tenant_config for the child tenant
-- ============================================================================
-- The child tenant created/used in accept_connection had no tenant_config
-- row, so every UI feature gate (FeatureGate / hasFeature) returned false
-- and the new agency saw "No disponible" everywhere — even though they
-- were just invited and were supposed to have access.
--
-- Two changes:
--   (1) The accept_connection RPC now upserts a sensible default config
--       for the child tenant, EXCLUDING features that only the parent
--       super-agency should own (sales_module, analytics, sms — those
--       are super-admin features). Everything else (clients, projects,
--       calendar, docs, finance, AI) is on by default.
--   (2) One-shot UPDATE backfills any existing child tenants (created
--       under the old RPC) with the same config so they're not stuck.
--
-- Default features for invited child agencies (the user's intent):
--   ENABLED:
--     ai_assistant, client_portal, notifications, finance_module,
--     projects_module, team_management, documents_module,
--     calendar_integration
--   DISABLED (parent decides if they're enabled):
--     sales_module    — full CRM + leads pipeline
--     analytics       — site analytics integration
-- (sms is not a tracked feature today — added here as a comment for
--  when it lands so the gate is in the right place.)
-- ============================================================================

-- Helper: returns the default features jsonb for a freshly-onboarded child
-- agency. Stored as a function so future migrations can extend it without
-- touching the RPC body.
CREATE OR REPLACE FUNCTION default_child_tenant_features()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'ai_assistant', true,
    'client_portal', true,
    'notifications', true,
    'finance_module', true,
    'projects_module', true,
    'team_management', true,
    'documents_module', true,
    'calendar_integration', true,
    'sales_module', false,
    'analytics', false,
    'document_versioning', false,
    'advanced_permissions', false
  )
$$;

CREATE OR REPLACE FUNCTION default_child_tenant_resource_limits()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'max_users', 10,
    'max_projects', 50,
    'max_storage_mb', 5000,
    'max_api_calls_per_month', 10000
  )
$$;

-- Helper: idempotent seeder. Returns true when a row was inserted.
CREATE OR REPLACE FUNCTION seed_tenant_config(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exists_already int;
BEGIN
  SELECT 1 INTO exists_already FROM tenant_config WHERE tenant_id = p_tenant_id LIMIT 1;
  IF exists_already IS NOT NULL THEN RETURN false; END IF;

  INSERT INTO tenant_config (
    tenant_id, features, resource_limits, security_settings, integrations,
    sales_enabled, team_enabled, notifications_enabled,
    max_users, max_projects, max_storage_mb
  ) VALUES (
    p_tenant_id,
    default_child_tenant_features(),
    default_child_tenant_resource_limits(),
    jsonb_build_object('require_2fa', false, 'password_min_length', 8, 'allow_public_sharing', false, 'session_timeout_minutes', 480),
    '{}'::jsonb,
    false, true, true,
    10, 50, 5000
  );
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_tenant_config(uuid) TO authenticated;

-- Replace accept_connection to seed the child tenant config at the end.
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

  UPDATE tenant_connections SET
    status = 'accepted',
    child_tenant_id = v_child_tenant,
    accepted_by = auth.uid(),
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_connection.id;

  UPDATE tenants SET parent_tenant_id = v_connection.parent_tenant_id, updated_at = NOW()
  WHERE id = v_child_tenant AND parent_tenant_id IS NULL;

  SELECT owner_id INTO v_parent_owner FROM tenants WHERE id = v_connection.parent_tenant_id;
  IF v_parent_owner IS NOT NULL THEN
    INSERT INTO tenant_members (user_id, tenant_id, role, source)
    VALUES (v_parent_owner, v_child_tenant, 'admin', 'connection')
    ON CONFLICT (user_id, tenant_id) DO NOTHING;
  END IF;

  -- NEW: ensure the child tenant has a feature config so they can
  -- actually use the workspace. No-op if one exists.
  PERFORM seed_tenant_config(v_child_tenant);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'parent_tenant_id', v_connection.parent_tenant_id,
    'child_tenant_id', v_child_tenant
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_connection(UUID) TO authenticated;

-- ── One-shot backfill ────────────────────────────────────────────────
-- Any tenant that exists but has no config row gets seeded with the
-- default. This catches both "child tenants accepted under the old
-- RPC" and "tenants created via other paths that forgot the config".
DO $$
DECLARE r RECORD; n int := 0;
BEGIN
  FOR r IN
    SELECT t.id FROM tenants t
    LEFT JOIN tenant_config tc ON tc.tenant_id = t.id
    WHERE tc.id IS NULL
  LOOP
    PERFORM seed_tenant_config(r.id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Backfilled tenant_config for % tenants', n;
END $$;

NOTIFY pgrst, 'reload schema';

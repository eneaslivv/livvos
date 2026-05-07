-- ============================================================================
-- One-shot backfill: payper2025@gmail.com signed up to their own tenant
-- via the invite flow but never clicked the explicit "Accept" button on
-- the AcceptConnection page. Their connection was stuck pending despite
-- the user being fully operational in the workspace. Manually applies
-- the same effects accept_connection() would have applied.
--
-- Companion to the AcceptConnection.tsx auto-accept fix shipped in the
-- same commit — the frontend change prevents this from happening again
-- for new invites; this script repairs the existing one.
--
-- Idempotent: re-running is a no-op when the connection is already
-- 'accepted'.
-- ============================================================================

DO $$
DECLARE
  v_conn RECORD;
  v_child_tenant_id UUID;
  v_parent_owner_id UUID;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'payper2025@gmail.com' LIMIT 1;
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT tenant_id INTO v_child_tenant_id FROM profiles WHERE id = v_user_id;
  IF v_child_tenant_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_conn FROM tenant_connections
  WHERE invited_email = 'payper2025@gmail.com' AND status = 'pending'
  LIMIT 1;
  IF v_conn.id IS NULL THEN RETURN; END IF;

  SELECT owner_id INTO v_parent_owner_id FROM tenants WHERE id = v_conn.parent_tenant_id;

  UPDATE tenant_connections
  SET status = 'accepted', child_tenant_id = v_child_tenant_id,
      accepted_by = v_user_id, accepted_at = NOW(), updated_at = NOW()
  WHERE id = v_conn.id;

  UPDATE tenants
  SET parent_tenant_id = v_conn.parent_tenant_id, updated_at = NOW()
  WHERE id = v_child_tenant_id AND parent_tenant_id IS NULL;

  IF v_parent_owner_id IS NOT NULL THEN
    INSERT INTO tenant_members (user_id, tenant_id, role, source)
    VALUES (v_parent_owner_id, v_child_tenant_id, 'admin', 'connection')
    ON CONFLICT (user_id, tenant_id) DO NOTHING;
  END IF;

  PERFORM seed_tenant_config(v_child_tenant_id);
END $$;

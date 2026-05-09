-- See description in the corresponding apply_migration call. Stored here for
-- repo history.

CREATE OR REPLACE FUNCTION auto_accept_my_pending_connections()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_email     TEXT;
  v_tenant_id UUID;
  v_owns_tenant BOOLEAN;
  v_conn      tenant_connections%ROWTYPE;
  v_accepted  INT := 0;
  v_skipped   INT := 0;
  v_acc_ids   UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_session');
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_user_id;
  IF v_email IS NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  END IF;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_email');
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_user_id;
  v_owns_tenant := EXISTS (
    SELECT 1 FROM tenants WHERE id = v_tenant_id AND owner_id = v_user_id
  );

  FOR v_conn IN
    SELECT * FROM tenant_connections
    WHERE LOWER(invited_email) = LOWER(v_email)
      AND status = 'pending'
  LOOP
    IF NOT v_owns_tenant OR v_tenant_id = v_conn.parent_tenant_id THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    UPDATE tenant_connections SET
      status          = 'accepted',
      child_tenant_id = v_tenant_id,
      accepted_by     = v_user_id,
      accepted_at     = NOW(),
      updated_at      = NOW()
    WHERE id = v_conn.id;

    UPDATE tenants SET parent_tenant_id = v_conn.parent_tenant_id, updated_at = NOW()
    WHERE id = v_tenant_id AND parent_tenant_id IS NULL;

    INSERT INTO tenant_members (user_id, tenant_id, role, source)
    SELECT t.owner_id, v_tenant_id, 'admin', 'connection'
    FROM tenants t WHERE t.id = v_conn.parent_tenant_id AND t.owner_id IS NOT NULL
    ON CONFLICT (user_id, tenant_id) DO NOTHING;

    BEGIN
      PERFORM seed_tenant_config(v_tenant_id);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;

    v_accepted := v_accepted + 1;
    v_acc_ids  := v_acc_ids || v_conn.id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'accepted', v_accepted,
    'skipped',  v_skipped,
    'accepted_ids', v_acc_ids,
    'owns_tenant', v_owns_tenant
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_accept_my_pending_connections() TO authenticated;

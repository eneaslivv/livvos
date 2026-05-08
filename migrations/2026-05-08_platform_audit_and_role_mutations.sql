-- ============================================================================
-- Platform audit log + role-mutation RPCs
-- ============================================================================
-- Adds:
--   • audit_log table — append-only log of platform-level admin actions.
--     RLS: only platform_admins can SELECT; INSERT happens via SECURITY
--     DEFINER triggers / RPCs (no direct client INSERT allowed).
--   • platform_audit_feed RPC — paginated reader for the master Audit page.
--   • platform_create_role / platform_delete_role RPCs — let the platform
--     owner add or remove global system roles from the Master panel.
--   • Trigger on role_permissions to log every (role, permission) change
--     so the matrix toggling in PlatformRoles surfaces in the audit feed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  scope       TEXT NOT NULL,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx     ON audit_log(action);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx      ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS audit_log_tenant_idx     ON audit_log(tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (is_platform_admin());

CREATE OR REPLACE FUNCTION _audit_role_permissions_trg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  TEXT;
  v_mod   TEXT;
  v_act   TEXT;
  v_email TEXT;
  v_rid   UUID;
  v_pid   UUID;
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN v_rid := NEW.role_id; v_pid := NEW.permission_id;
  ELSE                     v_rid := OLD.role_id; v_pid := OLD.permission_id;
  END IF;

  SELECT name INTO v_role FROM roles WHERE id = v_rid;
  SELECT module, action INTO v_mod, v_act FROM permissions WHERE id = v_pid;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO audit_log (actor_id, actor_email, scope, action, target_type, target_id, details)
  VALUES (auth.uid(), v_email, 'platform',
          CASE WHEN TG_OP = 'INSERT' THEN 'role_permission.grant' ELSE 'role_permission.revoke' END,
          'role_permission',
          v_rid::text || ':' || v_pid::text,
          jsonb_build_object('role_id', v_rid, 'role_name', v_role,
                             'permission_id', v_pid, 'module', v_mod, 'action', v_act));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS role_permissions_audit ON role_permissions;
CREATE TRIGGER role_permissions_audit
  AFTER INSERT OR DELETE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION _audit_role_permissions_trg();

CREATE OR REPLACE FUNCTION platform_audit_feed(p_limit INT DEFAULT 100, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID, actor_id UUID, actor_email TEXT,
  scope TEXT, tenant_id UUID, tenant_name TEXT,
  action TEXT, target_type TEXT, target_id TEXT,
  details JSONB, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'platform admin required'; END IF;
  RETURN QUERY
  SELECT a.id, a.actor_id, a.actor_email, a.scope, a.tenant_id, t.name,
         a.action, a.target_type, a.target_id, a.details, a.created_at
  FROM audit_log a LEFT JOIN tenants t ON t.id = a.tenant_id
  ORDER BY a.created_at DESC LIMIT p_limit OFFSET p_offset;
END; $$;
GRANT EXECUTE ON FUNCTION platform_audit_feed(INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION platform_create_role(p_name TEXT, p_description TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_email TEXT;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'platform admin required'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'role name required'; END IF;
  IF EXISTS (SELECT 1 FROM roles WHERE name = lower(trim(p_name))) THEN
    RAISE EXCEPTION 'role name already exists'; END IF;

  INSERT INTO roles (name, description, is_system)
  VALUES (lower(trim(p_name)), p_description, false) RETURNING id INTO v_id;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO audit_log (actor_id, actor_email, scope, action, target_type, target_id, details)
  VALUES (auth.uid(), v_email, 'platform', 'role.create', 'role', v_id::text,
          jsonb_build_object('role_name', lower(trim(p_name)), 'description', p_description));
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION platform_create_role(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION platform_delete_role(p_role_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role roles%ROWTYPE; v_user_count INT; v_email TEXT;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'platform admin required'; END IF;
  SELECT * INTO v_role FROM roles WHERE id = p_role_id;
  IF v_role.id IS NULL THEN RAISE EXCEPTION 'role not found'; END IF;
  IF v_role.is_system THEN RAISE EXCEPTION 'cannot delete system roles'; END IF;

  SELECT COUNT(*) INTO v_user_count FROM tenant_members WHERE role = v_role.name;
  IF v_user_count > 0 THEN
    RAISE EXCEPTION 'role still assigned to % user(s); reassign before deleting', v_user_count;
  END IF;

  DELETE FROM role_permissions WHERE role_id = p_role_id;
  DELETE FROM roles WHERE id = p_role_id;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO audit_log (actor_id, actor_email, scope, action, target_type, target_id, details)
  VALUES (auth.uid(), v_email, 'platform', 'role.delete', 'role', p_role_id::text,
          jsonb_build_object('role_name', v_role.name));
END; $$;
GRANT EXECUTE ON FUNCTION platform_delete_role(UUID) TO authenticated;

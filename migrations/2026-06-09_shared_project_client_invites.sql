-- Shared-project client invites + invitations RLS hardening
-- ─────────────────────────────────────────────────────────────────
-- Lets a partner agency with an edit share on a project invite that
-- project's client to the portal — even though the client record lives
-- in the owner agency's tenant (clients RLS blocks reading it directly,
-- and the invitation must be created under the OWNER tenant so the
-- portal scopes correctly).

CREATE OR REPLACE FUNCTION public.invite_client_for_shared_project(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_project record;
  v_client record;
  v_tenant record;
  v_role_id uuid;
  v_token uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'auth required');
  END IF;

  SELECT id, tenant_id, client_id INTO v_project FROM projects WHERE id = p_project_id;
  IF v_project.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Project not found');
  END IF;
  IF v_project.client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Project has no client linked');
  END IF;

  -- Caller must be a member of the owner tenant, or a member of a tenant
  -- the project was shared with at edit level.
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = v_project.tenant_id AND tm.user_id = v_caller
  ) AND NOT EXISTS (
    SELECT 1
    FROM project_agency_shares pas
    JOIN tenant_members tm
      ON tm.tenant_id = pas.shared_with_tenant_id AND tm.user_id = v_caller
    WHERE pas.project_id = p_project_id AND pas.access_level = 'edit'
  ) THEN
    RETURN jsonb_build_object('error', 'Not allowed to invite this project''s client');
  END IF;

  SELECT id, name, email, auth_user_id INTO v_client FROM clients WHERE id = v_project.client_id;
  IF v_client.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Client record not found');
  END IF;
  IF v_client.email IS NULL OR v_client.email = '' THEN
    RETURN jsonb_build_object('error', 'Client has no email — add one first');
  END IF;

  SELECT name, logo_url INTO v_tenant FROM tenants WHERE id = v_project.tenant_id;

  -- Already has a portal account — nothing to send.
  IF v_client.auth_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_registered', true,
      'client_name', v_client.name,
      'client_email', v_client.email,
      'tenant_name', v_tenant.name,
      'logo_url', v_tenant.logo_url,
      'tenant_id', v_project.tenant_id
    );
  END IF;

  -- Reuse a pending invitation when one exists (idempotent resend).
  SELECT token INTO v_token
  FROM invitations
  WHERE client_id = v_client.id
    AND tenant_id = v_project.tenant_id
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL THEN
    SELECT id INTO v_role_id FROM roles WHERE name = 'client' LIMIT 1;
    IF v_role_id IS NULL THEN
      RETURN jsonb_build_object('error', 'client role missing');
    END IF;
    INSERT INTO invitations (email, role_id, tenant_id, client_id, created_by, status, type)
    VALUES (v_client.email, v_role_id, v_project.tenant_id, v_client.id, v_caller, 'pending', 'client')
    RETURNING token INTO v_token;
  END IF;

  RETURN jsonb_build_object(
    'already_registered', false,
    'token', v_token,
    'client_name', v_client.name,
    'client_email', v_client.email,
    'tenant_name', v_tenant.name,
    'logo_url', v_tenant.logo_url,
    'tenant_id', v_project.tenant_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invite_client_for_shared_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_client_for_shared_project(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- Harden invitations INSERT: the old policy's `created_by = auth.uid()`
-- escape hatch let ANY authenticated user mint an invitation for ANY
-- tenant (and, with a known client uuid, link their auth account to a
-- foreign client record by self-accepting). Membership only; the
-- cross-tenant shared-project case goes through the SECURITY DEFINER
-- RPC above.
DROP POLICY IF EXISTS invitations_insert_policy ON public.invitations;
CREATE POLICY invitations_insert_policy ON public.invitations
FOR INSERT WITH CHECK (can_access_tenant(tenant_id));

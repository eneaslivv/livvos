-- =============================================
-- Fix invitation flow: tighten RLS + add RPCs
-- =============================================

-- 1. Remove the overly-permissive SELECT policy (has OR true)
DROP POLICY IF EXISTS "invitations_select_policy" ON invitations;

CREATE POLICY "invitations_select_policy" ON invitations
FOR SELECT USING (
  can_access_tenant(tenant_id)
  OR created_by = auth.uid()
);

-- 2. RPC: verify invitation token (SECURITY DEFINER bypasses RLS)
--    Used by AcceptInvite page before the user is authenticated/in-tenant
CREATE OR REPLACE FUNCTION public.verify_invitation_token(p_token UUID)
RETURNS TABLE(email TEXT, status TEXT, type TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT i.email::TEXT, i.status::TEXT, i.type::TEXT
  FROM invitations i
  WHERE i.token = p_token
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: accept invitation for existing users
--    When an already-registered user clicks an invite link, the handle_new_user
--    trigger doesn't fire (no INSERT into auth.users). This RPC handles:
--    - Assigning the invitation's role
--    - Updating the user's tenant_id
--    - Linking client record if applicable
--    - Marking invitation as accepted
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token UUID)
RETURNS JSONB AS $$
DECLARE
  v_inv invitations%ROWTYPE;
  v_caller_email TEXT;
BEGIN
  -- Get caller email
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Find pending invitation
  SELECT * INTO v_inv FROM invitations WHERE token = p_token AND status = 'pending';
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invitation not found or already used');
  END IF;

  -- Verify email matches
  IF v_inv.email != v_caller_email THEN
    RETURN jsonb_build_object('error', 'This invitation is for a different email address');
  END IF;

  -- Update profile tenant
  UPDATE profiles SET tenant_id = v_inv.tenant_id WHERE id = auth.uid();

  -- Assign role
  INSERT INTO user_roles (user_id, role_id)
  VALUES (auth.uid(), v_inv.role_id)
  ON CONFLICT DO NOTHING;

  -- Link client record if applicable
  IF v_inv.client_id IS NOT NULL THEN
    UPDATE clients SET auth_user_id = auth.uid() WHERE id = v_inv.client_id;
  END IF;

  -- Mark invitation as accepted
  UPDATE invitations SET status = 'accepted', updated_at = now() WHERE id = v_inv.id;

  RETURN jsonb_build_object('success', true, 'tenant_id', v_inv.tenant_id, 'type', v_inv.type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated and anon (verify_invitation_token needs anon access)
GRANT EXECUTE ON FUNCTION public.verify_invitation_token(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(UUID) TO authenticated;

NOTIFY pgrst, 'reload config';

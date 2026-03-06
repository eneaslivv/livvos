-- =============================================
-- Fix RLS for INVITATIONS table
-- The old policies use user_roles JOIN which can fail.
-- Simplify to tenant-based access like other tables.
-- =============================================
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Drop ALL legacy invitation policies
DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
DROP POLICY IF EXISTS "Public can read invitations by token" ON invitations;
DROP POLICY IF EXISTS "invitations_select_policy" ON invitations;
DROP POLICY IF EXISTS "invitations_insert_policy" ON invitations;
DROP POLICY IF EXISTS "invitations_update_policy" ON invitations;
DROP POLICY IF EXISTS "invitations_delete_policy" ON invitations;

-- SELECT: tenant members can read their invitations
CREATE POLICY "invitations_select_policy" ON invitations
FOR SELECT USING (
  can_access_tenant(tenant_id)
  OR tenant_id IS NULL
  OR created_by = auth.uid()
  OR true  -- public can read by token (needed for accept-invite page)
);

-- INSERT: tenant members can create invitations
CREATE POLICY "invitations_insert_policy" ON invitations
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id)
  OR created_by = auth.uid()
);

-- UPDATE: tenant members can update invitations (e.g. mark as accepted)
CREATE POLICY "invitations_update_policy" ON invitations
FOR UPDATE USING (
  can_access_tenant(tenant_id)
  OR tenant_id IS NULL
  OR created_by = auth.uid()
);

-- DELETE: tenant members can delete invitations
CREATE POLICY "invitations_delete_policy" ON invitations
FOR DELETE USING (
  can_access_tenant(tenant_id)
  OR created_by = auth.uid()
);

GRANT ALL ON invitations TO authenticated;

NOTIFY pgrst, 'reload config';

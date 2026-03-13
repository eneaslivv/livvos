-- =============================================
-- Fix handle_new_user trigger — member/client signup broken
-- Issues:
--   1. profiles.email UNIQUE constraint blocks re-registration
--   2. invitations.tenant_id might not exist
--   3. Trigger needs better error handling
-- =============================================

-- 1. Ensure invitations has tenant_id column
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- 2. Drop UNIQUE constraint on profiles.email if it exists
--    Multi-tenant: same email can exist in different tenants
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Find unique constraints on profiles.email using pg_catalog
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
  WHERE rel.relname = 'profiles'
    AND nsp.nspname = 'public'
    AND con.contype = 'u'
    AND att.attname = 'email'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE profiles DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped UNIQUE constraint % on profiles.email', v_constraint_name;
  END IF;

  -- Also drop any unique index on profiles.email (not backing a constraint)
  DECLARE
    v_index_name TEXT;
  BEGIN
    SELECT i.relname INTO v_index_name
    FROM pg_index idx
    JOIN pg_class i ON i.oid = idx.indexrelid
    JOIN pg_attribute a ON a.attrelid = idx.indrelid AND a.attnum = ANY(idx.indkey)
    JOIN pg_class t ON t.oid = idx.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'profiles'
      AND a.attname = 'email'
      AND idx.indisunique = true
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c WHERE c.conindid = idx.indexrelid
      )
    LIMIT 1;

    IF v_index_name IS NOT NULL THEN
      EXECUTE format('DROP INDEX IF EXISTS public.%I', v_index_name);
      RAISE NOTICE 'Dropped unique index % on profiles.email', v_index_name;
    END IF;
  END;
END $$;

-- 3. Ensure profiles PK column is 'id' (not 'user_id' from legacy migration)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'user_id' AND table_schema = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE profiles RENAME COLUMN user_id TO id;
    RAISE NOTICE 'Renamed profiles.user_id to profiles.id';
  END IF;
END $$;

-- 4. Recreate handle_new_user trigger
-- IMPORTANT: Use scalar variables (not RECORD) for the invitation lookup.
-- PostgreSQL has a known issue where SELECT INTO RECORD from RLS-enabled
-- tables fails inside auth.users AFTER INSERT triggers, even with
-- SECURITY DEFINER. Scalar variables work correctly.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_inv_id UUID;
  v_inv_tenant_id UUID;
  v_inv_role_id UUID;
  v_inv_client_id UUID;
  v_role_id UUID;
  v_tenant_id UUID;
  v_name TEXT;
  v_slug TEXT;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  -- Find pending invitation for this email (scalar vars, not RECORD)
  SELECT i.id, i.tenant_id, i.role_id, i.client_id
  INTO v_inv_id, v_inv_tenant_id, v_inv_role_id, v_inv_client_id
  FROM public.invitations i
  WHERE i.email = NEW.email AND i.status = 'pending'
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_inv_id IS NOT NULL THEN
    -- Invited user: use invitation's tenant
    v_tenant_id := v_inv_tenant_id;
  ELSE
    -- Self-signup: create new tenant
    v_slug := regexp_replace(lower(COALESCE(v_name, 'tenant')), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    IF v_slug = '' THEN
      v_slug := 'tenant';
    END IF;
    v_slug := v_slug || '-' || substring(gen_random_uuid()::text, 1, 8);

    INSERT INTO public.tenants (name, slug, owner_id, status, created_at, updated_at)
    VALUES (COALESCE(v_name, 'My Workspace'), v_slug, NEW.id, 'active', now(), now())
    RETURNING id INTO v_tenant_id;
  END IF;

  -- Delete any orphaned profile with same email but different user id
  DELETE FROM public.profiles
  WHERE email = NEW.email AND id != NEW.id;

  -- Create or update profile
  INSERT INTO public.profiles (id, email, name, status, tenant_id)
  VALUES (NEW.id, NEW.email, COALESCE(v_name, 'User'), 'active', v_tenant_id)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      name = EXCLUDED.name,
      tenant_id = COALESCE(EXCLUDED.tenant_id, profiles.tenant_id);

  -- Assign role
  IF v_inv_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_inv_role_id)
    ON CONFLICT DO NOTHING;

    IF v_inv_client_id IS NOT NULL THEN
      UPDATE public.clients SET auth_user_id = NEW.id WHERE id = v_inv_client_id;
    END IF;

    UPDATE public.invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = v_inv_id;
  ELSE
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'owner' LIMIT 1;
    IF v_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, v_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Fix invitations RLS: anonymous users need SELECT access for verify_invitation_token
--    (The 2026-03-12 migration removed OR true, but the RPC is SECURITY DEFINER so this
--     is actually fine for the RPC. However, the handle_new_user trigger also needs access
--     and it runs as SECURITY DEFINER too, so this is OK.)
--    What we DO need is: the UPDATE from handle_new_user works (it's SECURITY DEFINER).
--    And AcceptInvite.tsx line 114 does a direct update on invitations — this needs a policy.

-- Ensure authenticated users can update invitations they are accepting (by token)
DROP POLICY IF EXISTS "invitations_update_policy" ON invitations;
CREATE POLICY "invitations_update_policy" ON invitations
FOR UPDATE USING (
  can_access_tenant(tenant_id)
  OR created_by = auth.uid()
  -- Allow the newly registered user to mark their own invitation as accepted
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

NOTIFY pgrst, 'reload config';

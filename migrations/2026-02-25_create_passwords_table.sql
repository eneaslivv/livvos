-- ============================================================
-- Migration: Passwords table for secure credential storage
-- Date: 2026-02-25
-- Description: Creates passwords table with tenant isolation,
--              RLS policies, and proper grants
-- ============================================================

-- 1. Create the table
-- ============================================================
CREATE TABLE IF NOT EXISTS passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  username TEXT DEFAULT '',
  password_encrypted TEXT NOT NULL,
  url TEXT DEFAULT '',
  category TEXT DEFAULT 'general',
  notes TEXT DEFAULT '',
  visibility TEXT DEFAULT 'private',
  allowed_roles TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_passwords_tenant_id ON passwords(tenant_id);
CREATE INDEX IF NOT EXISTS idx_passwords_created_by ON passwords(created_by);
CREATE INDEX IF NOT EXISTS idx_passwords_visibility ON passwords(visibility);

-- 3. RLS Policies
-- ============================================================
ALTER TABLE passwords ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "passwords_select_own" ON passwords;
DROP POLICY IF EXISTS "passwords_insert" ON passwords;
DROP POLICY IF EXISTS "passwords_update" ON passwords;
DROP POLICY IF EXISTS "passwords_delete" ON passwords;
DROP POLICY IF EXISTS "passwords_select_policy" ON passwords;
DROP POLICY IF EXISTS "passwords_insert_policy" ON passwords;
DROP POLICY IF EXISTS "passwords_update_policy" ON passwords;
DROP POLICY IF EXISTS "passwords_delete_policy" ON passwords;

-- SELECT: user can see their own passwords, or team/role-visible ones within tenant
CREATE POLICY "passwords_select_policy" ON passwords
  FOR SELECT USING (
    auth.uid() = created_by
    OR (visibility = 'team' AND (can_access_tenant(tenant_id) OR tenant_id IS NULL))
    OR (visibility = 'role' AND (can_access_tenant(tenant_id) OR tenant_id IS NULL))
  );

-- INSERT: authenticated users can create passwords
CREATE POLICY "passwords_insert_policy" ON passwords
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- UPDATE: only creator can update
CREATE POLICY "passwords_update_policy" ON passwords
  FOR UPDATE USING (
    auth.uid() = created_by
  );

-- DELETE: only creator can delete
CREATE POLICY "passwords_delete_policy" ON passwords
  FOR DELETE USING (
    auth.uid() = created_by
  );

-- 4. Grant access to authenticated users
-- ============================================================
GRANT ALL ON passwords TO authenticated;

-- 5. Auto-update timestamp (only if the function exists)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS set_updated_at_passwords ON passwords;
    CREATE TRIGGER set_updated_at_passwords
      BEFORE UPDATE ON passwords
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  ELSE
    -- Create the function if it doesn't exist
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    CREATE TRIGGER set_updated_at_passwords
      BEFORE UPDATE ON passwords
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 6. Notify PostgREST to reload schema cache
-- ============================================================
NOTIFY pgrst, 'reload config';

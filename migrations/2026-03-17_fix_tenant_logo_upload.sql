-- Fix tenant logo upload: create bucket + fix RLS policy

-- 1. Create tenant-assets storage bucket (public for logo display)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-assets', 'tenant-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies for tenant-assets bucket
CREATE POLICY "tenant_assets_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tenant-assets');

CREATE POLICY "tenant_assets_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'tenant-assets');

CREATE POLICY "tenant_assets_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'tenant-assets');

CREATE POLICY "tenant_assets_select" ON storage.objects
FOR SELECT
USING (bucket_id = 'tenant-assets');

-- 3. Fix tenants UPDATE policies: drop old one without WITH CHECK, recreate with it
DROP POLICY IF EXISTS "Tenant owners can update their tenant" ON tenants;
DROP POLICY IF EXISTS "tenants_update_policy" ON tenants;
CREATE POLICY "tenants_update_policy" ON tenants
FOR UPDATE
USING (
  owner_id = auth.uid() OR
  has_permission('system', 'admin')
)
WITH CHECK (
  owner_id = auth.uid() OR
  has_permission('system', 'admin')
);

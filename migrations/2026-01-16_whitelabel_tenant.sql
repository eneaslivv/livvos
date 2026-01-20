-- =============================================
-- WHITE-LABEL / MULTI-TENANT INFRASTRUCTURE
-- Phase 5: White-Label Configuration
-- =============================================

-- Tenants table for multi-tenant support
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant configuration table
CREATE TABLE IF NOT EXISTS tenant_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Branding stored as JSONB for flexibility
  branding JSONB DEFAULT '{
    "name": "My App",
    "logoUrl": null,
    "faviconUrl": null,
    "primaryColor": "#6366f1",
    "secondaryColor": "#8b5cf6",
    "accentColor": "#ec4899",
    "gradientFrom": "#6366f1",
    "gradientTo": "#8b5cf6",
    "features": {
      "salesModule": true,
      "teamManagement": true,
      "clientPortal": true,
      "notifications": true,
      "aiAssistant": true
    }
  }'::jsonb,
  
  -- Feature toggles (also in branding JSON, but here for quick queries)
  sales_enabled BOOLEAN DEFAULT TRUE,
  team_enabled BOOLEAN DEFAULT TRUE,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  
  -- Limits
  max_users INTEGER DEFAULT 10,
  max_projects INTEGER DEFAULT 50,
  max_storage_mb INTEGER DEFAULT 5000,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id)
);

-- Add tenant_id to profiles for multi-tenant support
-- Only add if column doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenants
DROP POLICY IF EXISTS "Tenant owners can view their tenant" ON tenants;
CREATE POLICY "Tenant owners can view their tenant"
  ON tenants FOR SELECT
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Tenant owners can update their tenant" ON tenants;
CREATE POLICY "Tenant owners can update their tenant"
  ON tenants FOR UPDATE
  USING (owner_id = auth.uid());

-- RLS Policies for tenant_config
DROP POLICY IF EXISTS "Users can view their tenant config" ON tenant_config;
CREATE POLICY "Users can view their tenant config"
  ON tenant_config FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant owners can update config" ON tenant_config;
CREATE POLICY "Tenant owners can update config"
  ON tenant_config FOR UPDATE
  USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE owner_id = auth.uid()
    )
  );

-- Function to get current user's tenant branding
CREATE OR REPLACE FUNCTION get_tenant_branding()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_branding JSONB;
BEGIN
  -- Get user's tenant_id
  SELECT tenant_id INTO v_tenant_id
  FROM profiles
  WHERE id = auth.uid();
  
  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get tenant branding
  SELECT branding INTO v_branding
  FROM tenant_config
  WHERE tenant_id = v_tenant_id;
  
  RETURN v_branding;
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tenant_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_tenant_updated
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_timestamp();

CREATE TRIGGER trigger_tenant_config_updated
  BEFORE UPDATE ON tenant_config
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_timestamp();

-- Helper function to create a tenant with default config
CREATE OR REPLACE FUNCTION create_tenant_with_config(
  p_name TEXT,
  p_slug TEXT,
  p_owner_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Create tenant
  INSERT INTO tenants (name, slug, owner_id)
  VALUES (p_name, p_slug, COALESCE(p_owner_id, auth.uid()))
  RETURNING id INTO v_tenant_id;
  
  -- Create default config
  INSERT INTO tenant_config (tenant_id)
  VALUES (v_tenant_id);
  
  -- Link owner profile to tenant
  UPDATE profiles
  SET tenant_id = v_tenant_id
  WHERE id = COALESCE(p_owner_id, auth.uid());
  
  RETURN v_tenant_id;
END;
$$;

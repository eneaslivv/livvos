DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'status'
  ) THEN
    ALTER TABLE tenants ADD COLUMN status TEXT DEFAULT 'active';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_config' AND column_name = 'features'
  ) THEN
    ALTER TABLE tenant_config ADD COLUMN features JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_config' AND column_name = 'resource_limits'
  ) THEN
    ALTER TABLE tenant_config ADD COLUMN resource_limits JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_config' AND column_name = 'security_settings'
  ) THEN
    ALTER TABLE tenant_config ADD COLUMN security_settings JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_config' AND column_name = 'integrations'
  ) THEN
    ALTER TABLE tenant_config ADD COLUMN integrations JSONB;
  END IF;
END $$;

UPDATE tenant_config
SET features = COALESCE(
  features,
  jsonb_build_object(
    'sales_module', COALESCE(sales_enabled, true),
    'team_management', COALESCE(team_enabled, true),
    'client_portal', true,
    'notifications', COALESCE(notifications_enabled, true),
    'ai_assistant', false,
    'analytics', true,
    'calendar_integration', false,
    'document_versioning', false,
    'advanced_permissions', false
  )
)
WHERE true;

UPDATE tenant_config
SET resource_limits = COALESCE(
  resource_limits,
  jsonb_build_object(
    'max_users', COALESCE(max_users, 10),
    'max_projects', COALESCE(max_projects, 50),
    'max_storage_mb', COALESCE(max_storage_mb, 5000),
    'max_api_calls_per_month', 10000
  )
)
WHERE true;

UPDATE tenant_config
SET security_settings = COALESCE(
  security_settings,
  jsonb_build_object(
    'require_2fa', false,
    'session_timeout_minutes', 480,
    'password_min_length', 8,
    'allow_public_sharing', false
  )
)
WHERE true;

UPDATE tenant_config
SET integrations = COALESCE(
  integrations,
  jsonb_build_object(
    'email_provider', null,
    'calendar_provider', null,
    'payment_processor', null,
    'ai_service', null
  )
)
WHERE true;

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  token UUID DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_tenant_id ON invitations(tenant_id);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
CREATE POLICY "Admins can manage invitations" ON invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND (r.name = 'owner' OR r.name = 'admin')
    ) AND (tenant_id IS NULL OR can_access_tenant(tenant_id))
  );

DROP POLICY IF EXISTS "Public can read invitations by token" ON invitations;
CREATE POLICY "Public can read invitations by token" ON invitations
  FOR SELECT
  USING (true);

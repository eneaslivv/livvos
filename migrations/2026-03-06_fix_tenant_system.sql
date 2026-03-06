-- ============================================================
-- Fix tenant system: missing RPC, broken data, no tenant_config
-- Applied via Supabase MCP on 2026-03-06
-- ============================================================

-- 1. Fix tenants: set owner_id and slug
UPDATE tenants
SET owner_id = '93c8bd19-1957-4508-b260-6be0d79b80e3',
    slug = 'cafe-tactico-alpha'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND owner_id IS NULL;

-- 2. Assign tenant_id to ALL profiles missing it
UPDATE profiles
SET tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
WHERE tenant_id IS NULL;

-- 3. Create tenant_config for main tenant
INSERT INTO tenant_config (tenant_id, branding, features, resource_limits, security_settings, integrations, created_at, updated_at)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"name":"LIVV OS","primaryColor":"#3b82f6","secondaryColor":"#1e40af"}'::jsonb,
  '{"sales_module":true,"team_management":true,"client_portal":true,"notifications":true,"ai_assistant":true,"analytics":true,"calendar_integration":true,"document_versioning":true,"advanced_permissions":true}'::jsonb,
  '{"max_users":50,"max_projects":100,"max_storage_mb":10240,"max_api_calls_per_month":100000}'::jsonb,
  '{"require_2fa":false,"session_timeout_minutes":480,"password_min_length":8,"allow_public_sharing":false}'::jsonb,
  '{"email_provider":null,"calendar_provider":null,"payment_processor":null,"ai_service":null}'::jsonb,
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_config WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

-- 4. Create missing create_tenant_with_config RPC
CREATE OR REPLACE FUNCTION create_tenant_with_config(
  p_name text,
  p_slug text,
  p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  INSERT INTO tenants (id, name, slug, owner_id, config, is_active, status, created_at, updated_at)
  VALUES (gen_random_uuid(), p_name, p_slug, p_owner_id, '{}'::jsonb, true, 'active', now(), now())
  RETURNING id INTO v_tenant_id;

  INSERT INTO tenant_config (tenant_id, branding, features, resource_limits, security_settings, integrations, created_at, updated_at)
  VALUES (
    v_tenant_id,
    '{"name":"LIVV OS","primaryColor":"#3b82f6","secondaryColor":"#1e40af"}'::jsonb,
    '{"sales_module":true,"team_management":true,"client_portal":true,"notifications":true,"ai_assistant":true,"analytics":true,"calendar_integration":true,"document_versioning":true,"advanced_permissions":true}'::jsonb,
    '{"max_users":50,"max_projects":100,"max_storage_mb":10240,"max_api_calls_per_month":100000}'::jsonb,
    '{"require_2fa":false,"session_timeout_minutes":480,"password_min_length":8,"allow_public_sharing":false}'::jsonb,
    '{"email_provider":null,"calendar_provider":null,"payment_processor":null,"ai_service":null}'::jsonb,
    now(), now()
  );

  UPDATE profiles SET tenant_id = v_tenant_id WHERE id = p_owner_id;
  RETURN v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_tenant_with_config(text, text, uuid) TO authenticated;

-- =============================================
-- ENABLE AI ASSISTANT FOR ALL EXISTING TENANTS
-- =============================================
-- Context: tenant_config.features.ai_assistant defaulted to false from older
-- TenantContext seed code, but the gemini Edge Function now correctly reads
-- this flag from tenant_config (was previously reading the wrong table and
-- silently failing open). Without this migration, the table-reference fix
-- would lock out all existing tenants from AI features.
--
-- Strategy: set ai_assistant = true for any tenant_config row where it is
-- currently false or missing. Tenants that were intentionally disabled can
-- be turned off again via the platform admin UI after this runs.

UPDATE tenant_config
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('ai_assistant', true),
    updated_at = NOW()
WHERE features IS NULL
   OR features->>'ai_assistant' IS DISTINCT FROM 'true';

-- Sanity check: report how many rows were updated (visible in supabase logs)
DO $$
DECLARE
  updated_count INT;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM tenant_config
  WHERE features->>'ai_assistant' = 'true';
  RAISE NOTICE 'tenant_config rows with ai_assistant=true: %', updated_count;
END $$;

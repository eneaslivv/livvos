-- Backfill NULL tenant_config.resource_limits
--
-- Symptom: CK Studio (and any tenant whose tenant_config row was created via an
-- older path before seed_tenant_config) had resource_limits = NULL in the jsonb
-- column, even though the scalar columns (max_users, max_projects, ...) were set.
-- The client (context/TenantContext.tsx) reads tenantConfig.resource_limits.<key>
-- directly, so a NULL jsonb made isWithinResourceLimit / checkAndEnforceLimits
-- throw "Cannot read properties of null (reading 'max_users')" — crashing every
-- usage-gated screen (Team, add member/project, usage widgets) for that tenant
-- only. The owner of Livv Studio never saw it because its jsonb was populated.
--
-- Fix is two-layer: the client now coalesces NULL -> safe defaults (so it can
-- never crash again), and this migration backfills the real data from the
-- existing scalar columns so limit enforcement is actually correct.
--
-- Idempotent: only touches rows where resource_limits IS NULL.
UPDATE tenant_config
SET resource_limits = jsonb_build_object(
      'max_users',               COALESCE(max_users, 10),
      'max_projects',            COALESCE(max_projects, 50),
      'max_storage_mb',          COALESCE(max_storage_mb, 5000),
      'max_api_calls_per_month', 10000
    ),
    updated_at = now()
WHERE resource_limits IS NULL;

NOTIFY pgrst, 'reload schema';

# Tenant Agent — Multi-Tenancy & Configuration

## Owned Files
- `context/TenantContext.tsx` — Tenant config, branding, feature flags
- `config/whitelabel.ts` — CSS variable injection for branding
- `pages/TenantSettings.tsx` — Tenant settings page
- `components/config/GeneralSettings.tsx` — General config UI

## Database Tables
- `tenants` — Organization records
- `tenant_config` — Per-tenant settings (branding, features, limits)

## Known Issues
- Resource limits (max_users, max_projects, max_storage_mb) not enforced at DB level
- Branding applied via direct DOM manipulation
- Tenant isolation in some RLS policies uses only auth.uid() not tenant_id

## Rules
- Every tenant MUST have exactly one tenant_config record
- Branding CSS vars must merge with defaults before applying
- Feature flags must be accessible to all components via useTenant()

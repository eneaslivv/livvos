-- =============================================
-- ANON ROLE LOCKDOWN + DEBUG TABLE CLEANUP (CRITICAL)
-- =============================================
-- Audit revealed 18 tables with RLS disabled AND full CRUD permissions for
-- the anon role. Since the anon API key is shipped in the public JS bundle,
-- ANY visitor (no auth required) could:
--   • Read project_credentials_backup (mirror of project_credentials, with
--     password_text and encrypted_credential_json columns).
--   • INSERT into user_roles to self-assign the global 'owner' role, then
--     register an account and the frontend RBAC would treat them as admin.
--   • Modify roles / role_permissions / permissions to invent new
--     superuser roles or grant arbitrary permissions to existing ones.
--   • Read/write a dozen debug_* tables that may contain sensitive snapshots.
--
-- This migration removes all three exposures.

-- ─── 1. Drop the credentials backup ────────────────────────────────
-- Currently empty; was a one-shot backup from a 2025 re-encryption migration.
-- Live credentials live in project_credentials with proper RLS.
DROP TABLE IF EXISTS public.project_credentials_backup CASCADE;

-- ─── 2. Drop debug_* tables ────────────────────────────────────────
-- Per audit these are dev artefacts left behind by past schema explorations.
-- Some hold copies of activities/projects column lists, RLS config dumps,
-- query logs — none of which need to live in production.
DROP TABLE IF EXISTS public.debug_act_cols CASCADE;
DROP TABLE IF EXISTS public.debug_activities_cols CASCADE;
DROP TABLE IF EXISTS public.debug_activities_rls CASCADE;
DROP TABLE IF EXISTS public.debug_auth_check CASCADE;
DROP TABLE IF EXISTS public.debug_cols CASCADE;
DROP TABLE IF EXISTS public.debug_cols_projects CASCADE;
DROP TABLE IF EXISTS public.debug_indexes CASCADE;
DROP TABLE IF EXISTS public.debug_log CASCADE;
DROP TABLE IF EXISTS public.debug_rpc CASCADE;
DROP TABLE IF EXISTS public.debug_schema_cols CASCADE;
DROP TABLE IF EXISTS public.debug_sql_log CASCADE;
DROP TABLE IF EXISTS public.debug_tables CASCADE;
DROP TABLE IF EXISTS public.debug_triggers CASCADE;

-- ─── 3. Lock down RBAC tables ──────────────────────────────────────
-- These four tables back the entire permission system. Anyone able to write
-- to them can grant themselves arbitrary roles/perms.
--
-- Pattern: revoke EVERYTHING from anon. authenticated keeps SELECT only
-- (so the frontend can read role definitions for the RBAC config UI), but
-- INSERT/UPDATE/DELETE go through admin RPCs that validate caller permissions.

REVOKE ALL ON TABLE public.roles FROM anon;
REVOKE ALL ON TABLE public.permissions FROM anon;
REVOKE ALL ON TABLE public.role_permissions FROM anon;
REVOKE ALL ON TABLE public.user_roles FROM anon;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.permissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.role_permissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM authenticated;

GRANT SELECT ON TABLE public.roles TO authenticated;
GRANT SELECT ON TABLE public.permissions TO authenticated;
GRANT SELECT ON TABLE public.role_permissions TO authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;

-- Enable RLS on these so the SELECT grant is gated by policy too.
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Read-everything policies (the data here is the catalog of available
-- roles/perms — same shape across tenants — so reading it isn't a leak;
-- the prior issue was anon WRITES.)
DROP POLICY IF EXISTS roles_select_authenticated ON public.roles;
CREATE POLICY roles_select_authenticated ON public.roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS permissions_select_authenticated ON public.permissions;
CREATE POLICY permissions_select_authenticated ON public.permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS role_permissions_select_authenticated ON public.role_permissions;
CREATE POLICY role_permissions_select_authenticated ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- user_roles is per-user — restrict reads to the calling user's own rows.
-- Admin RPCs running as SECURITY DEFINER bypass this.
DROP POLICY IF EXISTS user_roles_select_self ON public.user_roles;
CREATE POLICY user_roles_select_self ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Pre-sale security lockdown — SECURITY DEFINER function exposure
-- ============================================================================
-- The Supabase security advisor flagged 122 SECURITY DEFINER functions
-- EXECUTE-able by the `anon` role. The anon key ships in the client bundle, so
-- anon-executable definer functions run with the OWNER's privileges and bypass
-- RLS entirely. The catastrophic ones run arbitrary SQL or mutate credentials.
-- This locks them down. Idempotent (REVOKE/GRANT are safe to re-run).
--
-- Kept executable by `service_role` (edge functions + migration tooling) and
-- `authenticated` where an internal guard already enforces real authorization.
-- ============================================================================

-- 1) exec_sql / exec_sql_read — `EXECUTE sql` as definer == arbitrary SQL /
--    full RLS bypass for anyone with the anon key. Service-role only.
REVOKE ALL ON FUNCTION public.exec_sql(text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exec_sql_read(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_sql_read(text) TO service_role;

-- 2) Credential-mutation helpers — no internal auth guard; anyone could
--    overwrite a project's encrypted credential by id. Service-role only.
REVOKE ALL ON FUNCTION public.application_encrypt_credential(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_credential_encrypted(uuid)            FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.application_encrypt_credential(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_credential_encrypted(uuid)            TO service_role;

-- 3) platform_* admin RPCs — these self-guard with is_platform_admin(), but
--    anon should never be able to invoke them at all. We must revoke the
--    implicit PUBLIC grant (anon inherits EXECUTE through PUBLIC, so revoking
--    "FROM anon" alone is a no-op) and re-grant `authenticated` + service_role
--    (the master dashboard calls them; the internal guard enforces authz).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS idargs
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND p.proname LIKE 'platform\_%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC;', r.proname, r.idargs);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.idargs);
  END LOOP;
END $$;

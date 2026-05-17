-- =============================================
-- Scheduled critique loop
--   • Adds last_critique_at to agent_user_profiles so the cron job can
--     skip users analyzed recently.
--   • Schedules the scheduled-critique Edge Function to run weekly.
--
-- The Edge Function itself enforces cooldown + min-turns + max-users
-- so the cron call is trivial: just POST and forget.
--
-- ── ONE-TIME OPERATOR SETUP (REQUIRED) ─────────────────────────────
-- Before the cron does anything useful, store the service role key in
-- Supabase Vault — run this ONCE via the SQL editor (Supabase dashboard):
--
--   SELECT vault.create_secret(
--     '<paste service role key here>',
--     'service_role_key',
--     'Service role key for scheduled background jobs'
--   );
--
-- The cron command below reads it via vault.decrypted_secrets; the key
-- never leaves the DB. If the secret is missing, the cron POSTs with an
-- empty bearer and the Edge Function rejects it with 401 — harmless.
-- =============================================

-- 1. Track when each user's profile was last analyzed by the critique
--    loop. NULL = never analyzed. Cron + the in-app "Run now" button
--    both update this column.
ALTER TABLE public.agent_user_profiles
  ADD COLUMN IF NOT EXISTS last_critique_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS agent_user_profiles_last_critique_idx
  ON public.agent_user_profiles (last_critique_at NULLS FIRST);

-- 2. pg_cron + pg_net should already be enabled, but make sure
--    (idempotent on Supabase-managed Postgres).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Drop any previous schedule for this job so re-applying the
--    migration doesn't pile up duplicates.
DO $$
BEGIN
  PERFORM cron.unschedule('weekly-scheduled-critique')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'weekly-scheduled-critique'
    );
EXCEPTION WHEN OTHERS THEN
  -- cron.unschedule throws when the job doesn't exist; harmless.
  NULL;
END $$;

-- 4. Schedule weekly — Sunday 03:00 UTC. Quiet time globally, and a
--    weekly cadence lines up with the 6-day cooldown the function
--    enforces so consecutive runs naturally rotate through users.
--
--    URL is hardcoded to the public project endpoint (not a secret).
--    Service role key lives in Vault — see operator setup at the top
--    of this file.
SELECT cron.schedule(
  'weekly-scheduled-critique',
  '0 3 * * 0',  -- Sunday 03:00 UTC
  $cron$
  SELECT net.http_post(
    url := 'https://ngswutcpsgdgmmjnfddi.supabase.co/functions/v1/scheduled-critique',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- 5. The in-app "Analyze my conversations" button (Settings → AI →
--    Your personal AI profile) goes through the user's session +
--    runCritique directly — doesn't need this Edge Function. Cron is
--    purely for keeping inactive users' learned_traits fresh.

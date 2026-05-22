-- =============================================================================
-- Aurora cron schedule + default proactive triggers per tenant owner
-- =============================================================================
-- Schedules the aurora-cron tick every 5 minutes via pg_cron + seeds 4
-- default proactive triggers per tenant owner (Orion Mon 9am, Cobra Tue 11am,
-- Selva Wed 4pm, Marina Fri 5pm).
-- =============================================================================

-- 1. Schedule the aurora-cron tick every 5 minutes.
DO $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key  := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM cron.unschedule('aurora-cron-tick')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aurora-cron-tick');

    PERFORM cron.schedule(
      'aurora-cron-tick',
      '*/5 * * * *',
      format($cron$
        SELECT net.http_post(
          url := '%s/functions/v1/aurora-cron',
          headers := jsonb_build_object(
            'Authorization', 'Bearer %s',
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
        );
      $cron$, v_supabase_url, v_service_key)
    );
  END IF;
END $$;

-- 2. Seed 4 default proactive triggers per tenant OWNER. Idempotent.
INSERT INTO aurora_triggers (tenant_id, user_id, agent_slug, schedule, prompt_template, next_run_at)
SELECT
  t.id,
  t.owner_id,
  trig.agent_slug,
  trig.schedule,
  trig.prompt_template,
  trig.next_run_at
FROM tenants t
CROSS JOIN (VALUES
  ('orion',  '0 9 * * 1',  'Catch me up desde el viernes pasado: leads nuevos, tasks resueltas, invoices pagadas, blockers que necesito atender hoy.',  NOW() + INTERVAL '1 day'),
  ('cobra',  '0 11 * * 2', 'Revisá los retainers activos y dame los que estén en amarillo o rojo: días sin touch, overdue tasks, signals de churn.',     NOW() + INTERVAL '2 days'),
  ('selva',  '0 16 * * 3', 'Capacity check: quién está al borde de burnout esta semana, dónde están los bottlenecks, y si necesitamos abrir un nuevo hire.', NOW() + INTERVAL '3 days'),
  ('marina', '0 17 * * 5', 'Cierre de semana: AR aging actualizado, cashflow projection a 12 weeks, top 3 invoices vencidas que requieren acción.',         NOW() + INTERVAL '5 days')
) AS trig(agent_slug, schedule, prompt_template, next_run_at)
WHERE t.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM aurora_triggers at2
    WHERE at2.user_id = t.owner_id AND at2.agent_slug = trig.agent_slug
  );

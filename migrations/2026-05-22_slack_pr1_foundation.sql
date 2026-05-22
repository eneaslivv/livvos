-- =============================================================================
-- PR1 — Slack agentic foundation
--
-- Aplicada en producción 2026-05-22 via MCP apply_migration:
-- migration name = slack_pr1_foundation
--
-- 1) inbound_mode enum en slack_monitored_channels (default 'classify_and_propose'
--    para no romper el flow actual donde slack-events ya clasifica).
-- 2) slack_event_log para dedup robusto + observabilidad por event_id de Slack.
-- 3) profiles.slack_user_id para PR5 (reverse flow). Lo agregamos ya pero queda
--    sin uso hasta el DM trigger.
-- =============================================================================

BEGIN;

-- 1) inbound_mode -----------------------------------------------------------
ALTER TABLE public.slack_monitored_channels
  ADD COLUMN IF NOT EXISTS inbound_mode text NOT NULL
    DEFAULT 'classify_and_propose'
    CHECK (inbound_mode IN ('ignore','notify_only','classify_and_propose','classify_and_auto_create'));

COMMENT ON COLUMN public.slack_monitored_channels.inbound_mode IS
  'Cómo procesar mensajes inbound: ignore | notify_only | classify_and_propose | classify_and_auto_create';

-- 2) slack_event_log --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.slack_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slack_event_id text UNIQUE NOT NULL,
  slack_team_id text,
  event_type text NOT NULL,
  channel_id text,
  raw_payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processing','done','error','duplicate','skipped')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slack_event_log_tenant_idx ON public.slack_event_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS slack_event_log_type_idx ON public.slack_event_log(event_type, processing_status);

ALTER TABLE public.slack_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS slack_event_log_tenant_select ON public.slack_event_log;
CREATE POLICY slack_event_log_tenant_select ON public.slack_event_log
  FOR SELECT TO authenticated
  USING (can_access_tenant(tenant_id));

-- NO INSERT/UPDATE/DELETE policy: la tabla se escribe sólo desde edge fns con
-- service_role. Esto evita que un cliente comprometido envenene el log.

-- 3) profiles.slack_user_id -------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slack_user_id text;

CREATE INDEX IF NOT EXISTS profiles_slack_user_id_idx ON public.profiles(slack_user_id)
  WHERE slack_user_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.slack_user_id IS
  'Slack user_id (U0xxx) del miembro. Se popula al conectar Slack o via /livv link. Usado por el reverse flow para DMs.';

COMMIT;

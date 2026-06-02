-- ============================================================================
-- lead-ingest abuse throttling — IP / email rate-limit ledger
-- ============================================================================
-- The public lead-ingest edge function (service role, verify_jwt=false) had no
-- rate limiting, so anyone who knows a tenant_slug could flood the leads table
-- and fan out paid Resend emails + Meta CAPI events. This append-only ledger
-- backs the per-IP / per-email throttling enforced inside the function.
--
-- Service-role only: RLS is enabled with NO anon/authenticated policy, so the
-- client bundle has zero read/write access; only the edge function (service
-- role, which bypasses RLS) touches it. Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_ingest_attempts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip          text,
  email       text,
  tenant_slug text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_ingest_attempts_ip_time
  ON public.lead_ingest_attempts(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ingest_attempts_email_time
  ON public.lead_ingest_attempts(lower(email), created_at DESC);

ALTER TABLE public.lead_ingest_attempts ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: clients get nothing, service role bypasses RLS.

NOTIFY pgrst, 'reload schema';

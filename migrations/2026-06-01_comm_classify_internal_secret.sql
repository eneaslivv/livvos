-- ============================================================================
-- comm-classify — optional internal-secret gate on the pg_net trigger
-- ============================================================================
-- comm-classify runs with verify_jwt=false and the trigger previously sent NO
-- auth header, so the function was callable by anyone who supplies a message_id
-- (mitigated only by unguessable UUIDs + idempotency). This forwards an
-- internal secret (read from the `app.comm_classify_secret` GUC) so the
-- function can reject public callers.
--
-- SOFT rollout — non-breaking: if the GUC is unset, the header is omitted and
-- comm-classify (which only enforces the check when its COMM_CLASSIFY_SECRET
-- env var is set) keeps working exactly as before.
--
-- To ACTIVATE the hard gate, set BOTH to the same random value:
--   1) DB:   ALTER DATABASE postgres SET app.comm_classify_secret = '<random>';
--            (then the trigger picks it up on new connections)
--   2) Func: set the COMM_CLASSIFY_SECRET secret on the comm-classify edge fn
--            (supabase secrets set COMM_CLASSIFY_SECRET=<same random>)
-- Idempotent (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_comm_classify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url     text  := 'https://ngswutcpsgdgmmjnfddi.supabase.co/functions/v1/comm-classify';
  v_secret  text  := current_setting('app.comm_classify_secret', true);
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
BEGIN
  IF v_secret IS NOT NULL AND v_secret <> '' THEN
    v_headers := v_headers || jsonb_build_object('x-internal-secret', v_secret);
  END IF;

  -- Solo para slack/gmail no procesados. Fire-and-forget; no bloquea el INSERT.
  IF NEW.ai_processed = false AND NEW.platform IN ('slack', 'gmail') THEN
    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object('message_id', NEW.id),
      headers := v_headers,
      timeout_milliseconds := 3000
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'queue_comm_classify failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.queue_comm_classify() IS
  'Trigger fn que dispara comm-classify edge fn via pg_net al insertar un comm_message. Fire-and-forget. Forwards x-internal-secret from app.comm_classify_secret GUC when set.';

NOTIFY pgrst, 'reload schema';

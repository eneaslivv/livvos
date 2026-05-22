-- =============================================================================
-- PR2 — Trigger pg_net que dispara comm-classify async sobre INSERT.
--
-- Aplicada en producción 2026-05-22 via MCP apply_migration:
-- migration name = slack_pr2_comm_classify_trigger
--
-- El trigger es AFTER INSERT, fire-and-forget via pg_net. Si la edge fn falla,
-- el insert no se rollback. La idempotencia está garantizada en comm-classify
-- (chequea ai_processed antes de procesar).
--
-- comm-classify tiene verify_jwt=false porque es invocada por pg_net (sin
-- contexto auth) y por backfill scripts. El abuse risk es bounded — solo
-- procesa message_ids que ya existen.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.queue_comm_classify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text := 'https://ngswutcpsgdgmmjnfddi.supabase.co/functions/v1/comm-classify';
BEGIN
  IF NEW.ai_processed = false AND NEW.platform IN ('slack', 'gmail') THEN
    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object('message_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 3000
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'queue_comm_classify failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_comm_classify ON public.communication_messages;
CREATE TRIGGER trg_queue_comm_classify
  AFTER INSERT ON public.communication_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_comm_classify();

COMMENT ON FUNCTION public.queue_comm_classify() IS
  'Trigger fn que dispara comm-classify edge fn via pg_net al insertar un comm_message. Fire-and-forget, no bloquea el INSERT.';

COMMIT;

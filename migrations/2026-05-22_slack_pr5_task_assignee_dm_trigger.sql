-- =============================================================================
-- PR5 — Trigger Postgres on tasks.assignee_id change → task-assignee-dm edge fn.
--
-- Aplicada en producción 2026-05-22 via MCP apply_migration:
-- migration name = slack_pr5_task_assignee_dm_trigger
--
-- Fire-and-forget via pg_net. La edge fn skipea graceful si el assignee no
-- tiene slack_user_id linkeado (el user todavía no corrió /livv link).
--
-- Coexiste con trigger_notify_task_assignment_v2 (in-app notif) y
-- trigger_email_task_assigned_multi (email). Defense-in-depth — el user
-- ve la notificación por todos los canales que tenga linkeados.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.queue_slack_dm_on_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text := 'https://ngswutcpsgdgmmjnfddi.supabase.co/functions/v1/task-assignee-dm';
  v_changed boolean := false;
BEGIN
  IF NEW.assignee_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      v_changed := true;
    ELSIF TG_OP = 'UPDATE' AND (OLD.assignee_id IS DISTINCT FROM NEW.assignee_id) THEN
      v_changed := true;
    END IF;
  END IF;

  IF v_changed THEN
    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object('task_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 3000
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'queue_slack_dm_on_task_assignment failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_slack_dm_on_task_assignment ON public.tasks;
CREATE TRIGGER trg_slack_dm_on_task_assignment
  AFTER INSERT OR UPDATE OF assignee_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_slack_dm_on_task_assignment();

COMMENT ON FUNCTION public.queue_slack_dm_on_task_assignment() IS
  'Dispara task-assignee-dm edge fn via pg_net cuando assignee_id cambia. Fire-and-forget.';

COMMIT;

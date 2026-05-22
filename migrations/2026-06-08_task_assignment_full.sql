-- =============================================================================
-- Task assignment — full pipeline
-- =============================================================================
-- Goals:
--   • Fire on BOTH INSERT and UPDATE (the old trigger only fired on UPDATE,
--     so creating a task with assignee already set silently skipped the notif)
--   • Handle BOTH `assignee_id` (single) AND `assignee_ids[]` (multi)
--   • Skip self-assignment
--   • Set the notification as priority='high' + action_required + deep link
--     to /calendar?task_id=... so the existing NotificationToaster gives it
--     the amber gradient + pulse + browser desktop notification
--   • Log a row into `activity_logs` with type='task_assigned' so the
--     Activity page surfaces it with the User icon + blue tone that the
--     page already has wired (see pages/Activity.tsx line 75)
--   • Fire the email pipeline (the existing `notify_task_assigned_email`
--     trigger from 2026-03-13 still runs for single-assignee; this migration
--     extends email to multi-assignee too)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. In-app notification + activity log
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trigger_notify_task_assignment ON public.tasks;
DROP TRIGGER IF EXISTS trigger_notify_task_assignment_v2 ON public.tasks;
DROP FUNCTION IF EXISTS notify_on_task_assignment() CASCADE;

CREATE OR REPLACE FUNCTION notify_on_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assigner_id UUID;
  v_assigner_name TEXT;
  v_assigner_avatar TEXT;
  v_assignee_id UUID;
  v_assignee_name TEXT;
  v_project_title TEXT;
  v_tenant_id UUID;
  v_link TEXT;
  v_title TEXT;
  v_message TEXT;
  v_new_ids UUID[];
  v_old_ids UUID[];
BEGIN
  -- Resolve assigner (the person who created/changed the task)
  -- Falls back to NEW.owner_id when triggered by a SQL path that doesn't
  -- carry auth.uid() (e.g. RPC, server-side automation).
  v_assigner_id := COALESCE(auth.uid(), NEW.owner_id);

  SELECT name, COALESCE(SUBSTRING(name FROM 1 FOR 2), 'U')
    INTO v_assigner_name, v_assigner_avatar
    FROM profiles WHERE id = v_assigner_id;
  v_assigner_name := COALESCE(v_assigner_name, 'Alguien');

  -- Resolve tenant + project context for the notification card
  IF NEW.project_id IS NOT NULL THEN
    SELECT title, tenant_id INTO v_project_title, v_tenant_id
      FROM projects WHERE id = NEW.project_id;
  END IF;
  IF v_tenant_id IS NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_assigner_id;
  END IF;

  -- Build the set of NEWLY assigned user ids:
  --   • Singular: NEW.assignee_id changed to a different value
  --   • Multi:    NEW.assignee_ids contains ids that OLD.assignee_ids didn't
  v_new_ids := COALESCE(NEW.assignee_ids, '{}'::UUID[]);
  v_old_ids := CASE
    WHEN TG_OP = 'INSERT' THEN '{}'::UUID[]
    ELSE COALESCE(OLD.assignee_ids, '{}'::UUID[])
  END;

  -- Union the singular assignee_id into v_new_ids so we treat both the
  -- same way downstream. We diff against v_old_ids (which includes the
  -- old singular too) so we never double-notify on no-op updates.
  IF NEW.assignee_id IS NOT NULL THEN
    v_new_ids := array_append(v_new_ids, NEW.assignee_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assignee_id IS NOT NULL THEN
    v_old_ids := array_append(v_old_ids, OLD.assignee_id);
  END IF;

  -- Deep link straight to the task on the Calendar page. App.tsx accepts
  -- `taskId` in navParams and the Calendar page auto-opens the detail panel.
  v_link := '/calendar?task_id=' || NEW.id::text;

  -- Iterate over each NEW assignee (in v_new_ids but not v_old_ids)
  FOREACH v_assignee_id IN ARRAY v_new_ids LOOP
    -- Skip if already assigned in OLD (no-op)
    IF v_assignee_id = ANY(v_old_ids) THEN CONTINUE; END IF;
    -- Skip null
    IF v_assignee_id IS NULL THEN CONTINUE; END IF;
    -- Skip self-assignment
    IF v_assignee_id = v_assigner_id THEN CONTINUE; END IF;

    -- Build the human-readable title/message in Spanish, matching the
    -- editorial voice of the rest of the app.
    SELECT name INTO v_assignee_name FROM profiles WHERE id = v_assignee_id;
    v_title := v_assigner_name || ' te asignó una tarea';
    v_message := '"' || NEW.title || '"' ||
      CASE WHEN v_project_title IS NOT NULL THEN ' · ' || v_project_title ELSE '' END ||
      CASE WHEN NEW.due_date IS NOT NULL
        THEN ' · vence ' || to_char(NEW.due_date, 'DD Mon')
        ELSE '' END;

    -- In-app notification — high priority so the toaster gives it
    -- the amber gradient + pulse + browser desktop notif.
    INSERT INTO notifications (
      user_id, tenant_id, type, priority, category,
      title, message, link,
      action_required, action_url, action_text,
      metadata
    ) VALUES (
      v_assignee_id, v_tenant_id, 'task', 'high', 'task_assignment',
      v_title, v_message, v_link,
      TRUE, v_link, 'Abrir tarea',
      jsonb_build_object(
        'task_id',     NEW.id,
        'task_title',  NEW.title,
        'project_id',  NEW.project_id,
        'project_title', v_project_title,
        'assigner_id', v_assigner_id,
        'assigner_name', v_assigner_name,
        'due_date',    NEW.due_date,
        'task_priority', NEW.priority,
        'op',          TG_OP
      )
    );

    -- Activity log entry — Activity page already renders type='task_assigned'
    -- with Icons.User + blue tone (see pages/Activity.tsx line 75).
    INSERT INTO activity_logs (
      tenant_id, user_id, user_name, user_avatar,
      action, target, project_title,
      type, entity_type, details, metadata, owner_id
    ) VALUES (
      v_tenant_id, v_assigner_id, v_assigner_name, v_assigner_avatar,
      'assigned', NEW.title, v_project_title,
      'task_assigned', 'task',
      jsonb_build_object(
        'assignee_id', v_assignee_id,
        'assignee_name', v_assignee_name,
        'task_id', NEW.id,
        'due_date', NEW.due_date
      ),
      jsonb_build_object(
        'task_id', NEW.id,
        'assignee_id', v_assignee_id
      ),
      v_assigner_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_task_assignment_v2
  AFTER INSERT OR UPDATE OF assignee_id, assignee_ids ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_task_assignment();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Email pipeline — extend to multi-assignee
-- ─────────────────────────────────────────────────────────────────────────────
-- The `notify_task_assigned_email()` from 2026-03-13 only loops over the
-- singular `assignee_id`. We add a sibling that handles the array, so
-- when a task is assigned to 2+ people each gets the email.
CREATE OR REPLACE FUNCTION notify_task_assigned_email_multi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignee_id UUID;
  v_assignee_email TEXT;
  v_assignee_name TEXT;
  v_assigner_id UUID;
  v_assigner_name TEXT;
  v_tenant_id UUID;
  v_tenant_name TEXT;
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_new_ids UUID[];
  v_old_ids UUID[];
BEGIN
  v_assigner_id := COALESCE(auth.uid(), NEW.owner_id);
  SELECT name INTO v_assigner_name FROM profiles WHERE id = v_assigner_id;
  v_assigner_name := COALESCE(v_assigner_name, 'Alguien');

  -- Diff new vs old assignee_ids — only email the new ones
  v_new_ids := COALESCE(NEW.assignee_ids, '{}'::UUID[]);
  v_old_ids := CASE
    WHEN TG_OP = 'INSERT' THEN '{}'::UUID[]
    ELSE COALESCE(OLD.assignee_ids, '{}'::UUID[])
  END;

  -- Skip the singular assignee_id — handled by the older trigger from
  -- 2026-03-13. We only handle the array delta here.
  IF array_length(v_new_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key  := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;  -- email infra not configured, in-app notif still works
  END IF;

  FOREACH v_assignee_id IN ARRAY v_new_ids LOOP
    IF v_assignee_id = ANY(v_old_ids) THEN CONTINUE; END IF;
    IF v_assignee_id IS NULL THEN CONTINUE; END IF;
    IF v_assignee_id = v_assigner_id THEN CONTINUE; END IF;

    SELECT email, name, tenant_id
      INTO v_assignee_email, v_assignee_name, v_tenant_id
      FROM profiles WHERE id = v_assignee_id;

    IF v_assignee_email IS NULL THEN CONTINUE; END IF;

    -- Respect the user's email preferences if `should_send_email` exists.
    -- Wrapped in EXCEPTION so older deployments without the helper still
    -- send emails (fail-open for assignment).
    BEGIN
      IF NOT should_send_email(v_assignee_id, 'task', COALESCE(NEW.priority, 'high')) THEN
        CONTINUE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    SELECT name INTO v_tenant_name FROM tenants WHERE id = v_tenant_id;

    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_service_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'template',   'task_assigned',
          'to',         v_assignee_email,
          'subject',    v_assigner_name || ' te asignó: ' || NEW.title,
          'brand_name', COALESCE(v_tenant_name, 'LIVV OS'),
          'tenant_id',  v_tenant_id,
          'data', jsonb_build_object(
            'recipient_name', v_assignee_name,
            'title',          v_assigner_name || ' te asignó una tarea',
            'message',
              'Nueva tarea: "' || NEW.title || '"' ||
              CASE WHEN NEW.due_date IS NOT NULL
                THEN ' · vence ' || to_char(NEW.due_date, 'DD Mon YYYY')
                ELSE '' END || '.',
            'cta_text', 'Abrir tarea',
            'cta_url',  current_setting('app.settings.app_url', true) ||
                        '/calendar?task_id=' || NEW.id::text
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to send multi-assignee email: %', SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_email_task_assigned_multi ON public.tasks;
CREATE TRIGGER trigger_email_task_assigned_multi
  AFTER INSERT OR UPDATE OF assignee_ids ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_assigned_email_multi();

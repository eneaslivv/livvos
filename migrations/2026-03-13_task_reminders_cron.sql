-- =============================================
-- Automatic task reminder system
-- 1. pg_cron job to call task-reminders edge function daily
-- 2. Trigger to send email when task is assigned
-- 3. Trigger to send email when task is completed
-- =============================================

-- 1. Enable pg_cron extension (requires superuser — run in Supabase dashboard if needed)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Schedule daily task reminders at 8:00 AM UTC
-- Calls the task-reminders edge function via pg_net
SELECT cron.schedule(
    'daily-task-reminders',
    '0 8 * * *',  -- Every day at 08:00 UTC
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/task-reminders',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- 3. Function: notify on task assignment change (sends email via edge function)
CREATE OR REPLACE FUNCTION notify_task_assigned_email()
RETURNS trigger AS $$
DECLARE
    v_assignee_email TEXT;
    v_assignee_name TEXT;
    v_tenant_id UUID;
    v_tenant_name TEXT;
    v_supabase_url TEXT;
    v_service_key TEXT;
BEGIN
    -- Only fire when assignee_id changes to a non-null value
    IF NEW.assignee_id IS NULL THEN RETURN NEW; END IF;
    IF OLD IS NOT NULL AND OLD.assignee_id = NEW.assignee_id THEN RETURN NEW; END IF;
    -- Don't notify if user assigned to themselves
    IF NEW.assignee_id = NEW.owner_id THEN RETURN NEW; END IF;

    -- Look up assignee
    SELECT email, name, tenant_id INTO v_assignee_email, v_assignee_name, v_tenant_id
    FROM public.profiles WHERE id = NEW.assignee_id;

    IF v_assignee_email IS NULL THEN RETURN NEW; END IF;

    -- Look up tenant name
    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = v_tenant_id;

    -- Check email preference
    IF NOT should_send_email(NEW.assignee_id, 'task', COALESCE(NEW.priority, 'medium')) THEN
        RETURN NEW;
    END IF;

    -- Send email via edge function
    BEGIN
        v_supabase_url := current_setting('app.settings.supabase_url', true);
        v_service_key := current_setting('app.settings.service_role_key', true);

        IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/send-email',
                headers := jsonb_build_object(
                    'Authorization', 'Bearer ' || v_service_key,
                    'Content-Type', 'application/json'
                ),
                body := jsonb_build_object(
                    'template', 'task_assigned',
                    'to', v_assignee_email,
                    'subject', 'New task assigned: ' || NEW.title,
                    'brand_name', COALESCE(v_tenant_name, 'LIVV OS'),
                    'data', jsonb_build_object(
                        'recipient_name', v_assignee_name,
                        'title', 'New Task Assigned',
                        'message', 'You have been assigned a new task: "' || NEW.title || '".' ||
                            CASE WHEN NEW.due_date IS NOT NULL
                                THEN ' Due: ' || to_char(NEW.due_date, 'Mon DD, YYYY') || '.'
                                ELSE '' END,
                        'cta_text', 'View Task'
                    )
                )
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Non-blocking: log but don't fail
        RAISE WARNING 'Failed to send task assignment email: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trigger_email_task_assigned ON public.tasks;
CREATE TRIGGER trigger_email_task_assigned
    AFTER INSERT OR UPDATE OF assignee_id ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_task_assigned_email();

-- 4. Function: notify on task completion
CREATE OR REPLACE FUNCTION notify_task_completed_email()
RETURNS trigger AS $$
DECLARE
    v_owner_email TEXT;
    v_owner_name TEXT;
    v_assignee_name TEXT;
    v_tenant_id UUID;
    v_tenant_name TEXT;
    v_supabase_url TEXT;
    v_service_key TEXT;
BEGIN
    -- Only fire when completed changes to TRUE
    IF NOT NEW.completed THEN RETURN NEW; END IF;
    IF OLD IS NOT NULL AND OLD.completed = TRUE THEN RETURN NEW; END IF;
    -- Need an owner who is different from assignee
    IF NEW.owner_id IS NULL OR NEW.owner_id = NEW.assignee_id THEN RETURN NEW; END IF;

    -- Look up owner
    SELECT email, name, tenant_id INTO v_owner_email, v_owner_name, v_tenant_id
    FROM public.profiles WHERE id = NEW.owner_id;

    IF v_owner_email IS NULL THEN RETURN NEW; END IF;

    -- Look up assignee name
    SELECT name INTO v_assignee_name FROM public.profiles WHERE id = NEW.assignee_id;

    -- Look up tenant name
    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = v_tenant_id;

    -- Check email preference
    IF NOT should_send_email(NEW.owner_id, 'task', 'medium') THEN
        RETURN NEW;
    END IF;

    BEGIN
        v_supabase_url := current_setting('app.settings.supabase_url', true);
        v_service_key := current_setting('app.settings.service_role_key', true);

        IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/send-email',
                headers := jsonb_build_object(
                    'Authorization', 'Bearer ' || v_service_key,
                    'Content-Type', 'application/json'
                ),
                body := jsonb_build_object(
                    'template', 'task_completed',
                    'to', v_owner_email,
                    'subject', 'Task completed: ' || NEW.title,
                    'brand_name', COALESCE(v_tenant_name, 'LIVV OS'),
                    'data', jsonb_build_object(
                        'recipient_name', v_owner_name,
                        'title', 'Task Completed',
                        'message', '"' || NEW.title || '" has been marked as complete' ||
                            CASE WHEN v_assignee_name IS NOT NULL
                                THEN ' by ' || v_assignee_name || '.'
                                ELSE '.' END,
                        'cta_text', 'View Task'
                    )
                )
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to send task completion email: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_email_task_completed ON public.tasks;
CREATE TRIGGER trigger_email_task_completed
    AFTER UPDATE OF completed ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_task_completed_email();

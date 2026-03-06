-- =============================================
-- Fix Notifications System: schema + triggers
-- =============================================

-- 1a. Add missing columns to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_text TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Expand type CHECK to support new notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('lead', 'task', 'project', 'invite', 'system', 'activity', 'security', 'billing', 'deadline', 'mention'));

-- Index for tenant filtering
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON notifications(tenant_id);

-- =============================================
-- 1b. Update create_notification() helper
-- =============================================
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
  v_tenant UUID;
BEGIN
  -- Resolve tenant_id if not provided
  v_tenant := p_tenant_id;
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM profiles WHERE id = p_user_id LIMIT 1;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, link, metadata, tenant_id, priority)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_metadata, v_tenant, 'medium')
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- =============================================
-- 1c. Fix task assignment trigger
-- The old trigger referenced calendar_tasks.assignee_id
-- Actual table is tasks with assigned_to column
-- =============================================
DROP TRIGGER IF EXISTS trigger_notify_task_assignment ON calendar_tasks;
DROP TRIGGER IF EXISTS trigger_notify_task_assignment ON tasks;

CREATE OR REPLACE FUNCTION notify_on_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only notify if assigned_to changed and is not null
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
    -- Don't notify if user assigned task to themselves
    IF NEW.assigned_to != COALESCE(NEW.owner_id, '00000000-0000-0000-0000-000000000000'::UUID) THEN
      PERFORM create_notification(
        NEW.assigned_to::UUID,
        'task',
        'New task assigned: ' || COALESCE(NEW.title, 'Untitled'),
        'You have been assigned a new task',
        '/calendar',
        jsonb_build_object('task_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on the actual tasks table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    CREATE TRIGGER trigger_notify_task_assignment
      AFTER UPDATE ON tasks
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_task_assignment();
  END IF;
END $$;

-- =============================================
-- 1d. New trigger: chat message received
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_name TEXT;
  v_client_tenant UUID;
  v_client_auth_user UUID;
  v_team_member RECORD;
BEGIN
  -- Get client info
  SELECT name, tenant_id, auth_user_id
  INTO v_client_name, v_client_tenant, v_client_auth_user
  FROM clients WHERE id = NEW.client_id;

  IF NEW.sender_type = 'client' THEN
    -- Client sent a message → notify all team members in the tenant
    IF v_client_tenant IS NOT NULL THEN
      FOR v_team_member IN
        SELECT p.id FROM profiles p
        WHERE p.tenant_id = v_client_tenant AND p.status = 'active'
        -- Don't notify the sender if they happen to be a team member
        AND p.id != COALESCE(NEW.sender_id, '00000000-0000-0000-0000-000000000000'::UUID)
        LIMIT 10
      LOOP
        PERFORM create_notification(
          v_team_member.id,
          'activity',
          'New message from ' || COALESCE(v_client_name, NEW.sender_name),
          LEFT(NEW.message, 100),
          '/clients',
          jsonb_build_object('client_id', NEW.client_id, 'message_id', NEW.id),
          v_client_tenant
        );
      END LOOP;
    END IF;

  ELSIF NEW.sender_type = 'user' THEN
    -- Team member sent a message → notify the client (if they have an auth account)
    IF v_client_auth_user IS NOT NULL THEN
      PERFORM create_notification(
        v_client_auth_user,
        'activity',
        'New message from ' || NEW.sender_name,
        LEFT(NEW.message, 100),
        '/portal',
        jsonb_build_object('client_id', NEW.client_id, 'message_id', NEW.id),
        v_client_tenant
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_messages') THEN
    DROP TRIGGER IF EXISTS trigger_notify_new_message ON client_messages;
    CREATE TRIGGER trigger_notify_new_message
      AFTER INSERT ON client_messages
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_new_message();
  END IF;
END $$;

-- =============================================
-- 1e. New trigger: task returned (uncompleted)
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_task_returned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Task was completed and is now not completed → "returned"
  IF OLD.completed = TRUE AND NEW.completed = FALSE THEN
    -- Notify the assignee (if exists and is not the person who returned it)
    IF NEW.assigned_to IS NOT NULL THEN
      PERFORM create_notification(
        NEW.assigned_to::UUID,
        'task',
        'Task returned: ' || COALESCE(NEW.title, 'Untitled'),
        'A previously completed task has been reopened',
        '/calendar',
        jsonb_build_object('task_id', NEW.id, 'action', 'returned')
      );
    END IF;

    -- Also notify the owner if different from assignee
    IF NEW.owner_id IS NOT NULL AND NEW.owner_id != COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::UUID) THEN
      PERFORM create_notification(
        NEW.owner_id::UUID,
        'task',
        'Task returned: ' || COALESCE(NEW.title, 'Untitled'),
        'A previously completed task has been reopened',
        '/calendar',
        jsonb_build_object('task_id', NEW.id, 'action', 'returned')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    DROP TRIGGER IF EXISTS trigger_notify_task_returned ON tasks;
    CREATE TRIGGER trigger_notify_task_returned
      AFTER UPDATE ON tasks
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_task_returned();
  END IF;
END $$;

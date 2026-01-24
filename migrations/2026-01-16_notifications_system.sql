-- =============================================
-- NOTIFICATIONS SYSTEM
-- Phase 4: Unified Notification System
-- =============================================

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('lead', 'task', 'project', 'invite', 'system', 'activity')),
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can insert notifications for any user
DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;
CREATE POLICY "Service can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Enable realtime for notifications
-- Enable realtime for notifications
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN OTHERS THEN NULL;
  END;
END $$;

-- =============================================
-- HELPER FUNCTION: Create notification
-- =============================================
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_metadata)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- =============================================
-- TRIGGER: Notify on new lead
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Get the owner (first admin user) - in production this would be more sophisticated
  SELECT id INTO v_owner_id FROM profiles WHERE status = 'active' LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    PERFORM create_notification(
      v_owner_id,
      'lead',
      'New Lead: ' || COALESCE(NEW.name, 'Unknown'),
      COALESCE(NEW.message, 'New lead received'),
      '/sales_leads',
      jsonb_build_object('lead_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Note: Only create trigger if leads table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    DROP TRIGGER IF EXISTS trigger_notify_new_lead ON leads;
    CREATE TRIGGER trigger_notify_new_lead
      AFTER INSERT ON leads
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_new_lead();
  END IF;
END $$;

-- =============================================
-- TRIGGER: Notify on task assignment
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only notify if assignee changed and is not null
  IF NEW.assignee_id IS NOT NULL AND (OLD.assignee_id IS NULL OR OLD.assignee_id != NEW.assignee_id) THEN
    PERFORM create_notification(
      NEW.assignee_id::UUID,
      'task',
      'Task Assigned: ' || COALESCE(NEW.title, 'New Task'),
      'You have been assigned a new task',
      '/calendar',
      jsonb_build_object('task_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Note: Only create trigger if tasks table exists (calendar_tasks)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'calendar_tasks') THEN
    DROP TRIGGER IF EXISTS trigger_notify_task_assignment ON calendar_tasks;
    CREATE TRIGGER trigger_notify_task_assignment
      AFTER UPDATE ON calendar_tasks
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_task_assignment();
  END IF;
END $$;

-- =============================================
-- TRIGGER: Notify on project invitation
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_project_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_title TEXT;
BEGIN
  -- Get project title
  SELECT title INTO v_project_title FROM projects WHERE id = NEW.project_id;
  
  PERFORM create_notification(
    NEW.member_id,
    'project',
    'Project Invitation',
    'You have been added to project: ' || COALESCE(v_project_title, 'Unknown'),
    '/projects',
    jsonb_build_object('project_id', NEW.project_id)
  );
  
  RETURN NEW;
END;
$$;

-- Note: Only create trigger if project_members table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_members') THEN
    DROP TRIGGER IF EXISTS trigger_notify_project_invite ON project_members;
    CREATE TRIGGER trigger_notify_project_invite
      AFTER INSERT ON project_members
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_project_invite();
  END IF;
END $$;

-- =============================================
-- Task Comments System
-- Adds comments on tasks with internal vs client-visible differentiation
-- and notification trigger for task owner + assignee.
-- =============================================

-- 1. Table
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  user_avatar_url TEXT,
  is_internal BOOLEAN DEFAULT TRUE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_tenant ON task_comments(tenant_id);

-- 2. RLS
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_comments_tenant" ON task_comments;
CREATE POLICY "task_comments_tenant" ON task_comments
  FOR ALL USING (can_access_tenant(tenant_id)) WITH CHECK (can_access_tenant(tenant_id));

-- 3. Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN OTHERS THEN NULL;
  END;
END $$;

-- 4. Notification trigger
CREATE OR REPLACE FUNCTION notify_on_task_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title TEXT;
  v_owner UUID;
  v_assignee UUID;
  v_preview TEXT;
BEGIN
  SELECT title, owner_id, assignee_id
  INTO v_title, v_owner, v_assignee
  FROM tasks WHERE id = NEW.task_id;

  v_preview := LEFT(NEW.comment, 80)
    || CASE WHEN LENGTH(NEW.comment) > 80 THEN '...' ELSE '' END;

  -- Notify task owner (if not the commenter)
  IF v_owner IS NOT NULL AND v_owner != NEW.user_id THEN
    PERFORM create_notification(
      v_owner,
      'task',
      COALESCE(NEW.user_name, 'Someone') || ' commented on ' || COALESCE(v_title, 'a task'),
      v_preview,
      '/calendar',
      jsonb_build_object(
        'task_id', NEW.task_id,
        'comment_id', NEW.id,
        'is_internal', NEW.is_internal
      )
    );
  END IF;

  -- Notify assignee (if different from owner and commenter)
  IF v_assignee IS NOT NULL
     AND v_assignee != NEW.user_id
     AND v_assignee != COALESCE(v_owner, '00000000-0000-0000-0000-000000000000'::UUID)
  THEN
    PERFORM create_notification(
      v_assignee,
      'task',
      COALESCE(NEW.user_name, 'Someone') || ' commented on ' || COALESCE(v_title, 'a task'),
      v_preview,
      '/calendar',
      jsonb_build_object(
        'task_id', NEW.task_id,
        'comment_id', NEW.id,
        'is_internal', NEW.is_internal
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_task_comment ON task_comments;
CREATE TRIGGER trigger_notify_task_comment
  AFTER INSERT ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_task_comment();


-- Add parent_id for threaded comments
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES activity_logs(id) ON DELETE CASCADE;

-- Index for faster lookups of comments
CREATE INDEX IF NOT EXISTS idx_activity_logs_parent_id ON activity_logs(parent_id);

-- Function to notify on comment
CREATE OR REPLACE FUNCTION notify_on_activity_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_owner_id UUID;
  v_parent_action TEXT;
  v_parent_details JSONB;
  v_preview TEXT;
BEGIN
  -- Only proceed if it is a reply (has parent_id)
  IF NEW.parent_id IS NOT NULL THEN
    -- Get parent owner and details
    SELECT owner_id, action, details::jsonb INTO v_parent_owner_id, v_parent_action, v_parent_details
    FROM activity_logs
    WHERE id = NEW.parent_id;

    -- Try to get a meaningful preview text from parent details
    v_preview := COALESCE(v_parent_details->>'content', v_parent_action, 'your activity');

    -- Notify parent owner if it's not the same person who commented
    IF v_parent_owner_id IS NOT NULL AND v_parent_owner_id != NEW.user_id THEN
      PERFORM create_notification(
        v_parent_owner_id,
        'activity',
        COALESCE(NEW.user_name, 'Someone') || ' replied to you',
        'Replying to: ' || LEFT(v_preview, 50) || (CASE WHEN LENGTH(v_preview) > 50 THEN '...' ELSE '' END),
        '/activity', 
        jsonb_build_object('activity_id', NEW.parent_id, 'comment_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger
DROP TRIGGER IF EXISTS trigger_notify_activity_comment ON activity_logs;
CREATE TRIGGER trigger_notify_activity_comment
  AFTER INSERT ON activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_activity_comment();

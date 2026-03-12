-- =============================================
-- Email preferences per user per notification type
-- =============================================

CREATE TABLE IF NOT EXISTS email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  notification_type TEXT NOT NULL,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  min_priority TEXT NOT NULL DEFAULT 'high'
    CHECK (min_priority IN ('low', 'medium', 'high', 'urgent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_type)
);

-- RLS
ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_email_prefs" ON email_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_email_prefs" ON email_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_email_prefs" ON email_preferences
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "users_delete_own_email_prefs" ON email_preferences
  FOR DELETE USING (user_id = auth.uid());

-- Helper: check if email should be sent for a given user/type/priority
CREATE OR REPLACE FUNCTION public.should_send_email(
  p_user_id UUID,
  p_type TEXT,
  p_priority TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_pref email_preferences%ROWTYPE;
  v_priority_rank INT;
  v_min_rank INT;
BEGIN
  SELECT * INTO v_pref
  FROM email_preferences
  WHERE user_id = p_user_id AND notification_type = p_type;

  -- No preference row → default: send email for high/urgent only
  IF NOT FOUND THEN
    RETURN p_priority IN ('high', 'urgent');
  END IF;

  -- Explicitly disabled
  IF NOT v_pref.email_enabled THEN
    RETURN false;
  END IF;

  -- Priority ranking: low=1, medium=2, high=3, urgent=4
  v_priority_rank := CASE p_priority
    WHEN 'low' THEN 1 WHEN 'medium' THEN 2
    WHEN 'high' THEN 3 WHEN 'urgent' THEN 4 ELSE 0 END;

  v_min_rank := CASE v_pref.min_priority
    WHEN 'low' THEN 1 WHEN 'medium' THEN 2
    WHEN 'high' THEN 3 WHEN 'urgent' THEN 4 ELSE 3 END;

  RETURN v_priority_rank >= v_min_rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.should_send_email(UUID, TEXT, TEXT) TO authenticated;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_prefs_user ON email_preferences(user_id);

NOTIFY pgrst, 'reload config';

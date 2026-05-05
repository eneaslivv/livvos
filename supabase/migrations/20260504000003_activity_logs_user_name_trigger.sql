-- ============================================================================
-- Auto-resolve activity_logs.user_name from profiles on INSERT
-- ============================================================================
-- The lib/activity.ts client-side fix is great when the user has a fresh
-- browser bundle. But stale tabs still POST rows with user_name='System'
-- even though they have a valid user_id. This trigger fixes those rows
-- at the DB level so the activity feed never lies regardless of which
-- client did the insert.
--
-- Logic: BEFORE INSERT — if user_name is NULL/'System' AND user_id is
-- not null, look up the profile and overwrite user_name + user_avatar.
-- Real "System" events (cron jobs, edge functions inserting with
-- user_id IS NULL) are untouched.
-- ============================================================================

CREATE OR REPLACE FUNCTION activity_logs_resolve_user_name()
RETURNS TRIGGER AS $$
DECLARE
  prof RECORD;
BEGIN
  -- Skip when the caller already provided a real name.
  IF NEW.user_name IS NOT NULL AND NEW.user_name <> 'System' AND NEW.user_name <> '' THEN
    RETURN NEW;
  END IF;
  -- Skip when there's no user_id to look up against.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name, email, avatar_url INTO prof
  FROM profiles
  WHERE id = NEW.user_id;

  IF FOUND THEN
    NEW.user_name = COALESCE(NULLIF(prof.name, ''), split_part(prof.email, '@', 1), 'Member');
    IF NEW.user_avatar IS NULL OR NEW.user_avatar = 'SYS' OR NEW.user_avatar = '' THEN
      NEW.user_avatar = COALESCE(prof.avatar_url, NEW.user_avatar);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_activity_logs_resolve_user_name ON activity_logs;
CREATE TRIGGER trg_activity_logs_resolve_user_name
  BEFORE INSERT ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION activity_logs_resolve_user_name();

-- One-shot backfill for any rows that slipped in after the prior backfill
UPDATE activity_logs al
SET
  user_name   = COALESCE(NULLIF(p.name, ''), split_part(p.email, '@', 1), 'Member'),
  user_avatar = COALESCE(p.avatar_url, al.user_avatar)
FROM profiles p
WHERE al.user_id = p.id
  AND (al.user_name = 'System' OR al.user_name IS NULL OR al.user_name = '')
  AND al.user_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

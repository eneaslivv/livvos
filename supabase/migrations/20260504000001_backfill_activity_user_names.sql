-- ============================================================================
-- Backfill activity_logs.user_name from profiles.name
-- ============================================================================
-- Before lib/activity.ts auto-resolved user_name from the session, every
-- entry was logged as 'System'. The user_id column was always populated,
-- so we can join with profiles to recover the real names retroactively.
--
-- Same with user_avatar — most rows have 'SYS' (the old default). Lift
-- avatar_url from profiles where available.
-- ============================================================================

UPDATE activity_logs al
SET
  user_name   = COALESCE(p.name, split_part(p.email, '@', 1), 'Member'),
  user_avatar = COALESCE(p.avatar_url, al.user_avatar)
FROM profiles p
WHERE al.user_id = p.id
  AND (al.user_name = 'System' OR al.user_name IS NULL OR al.user_name = '')
  AND al.user_id IS NOT NULL;

-- Sanity: count how many were updated
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM activity_logs
  WHERE user_name = 'System' AND user_id IS NOT NULL;
  RAISE NOTICE 'Backfill complete. Remaining System entries with user_id: %', remaining;
END $$;

NOTIFY pgrst, 'reload schema';

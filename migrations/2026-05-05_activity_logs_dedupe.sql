-- ============================================================================
-- activity_logs dedupe — prevent rapid double-fires from polluting the feed
-- ============================================================================
-- The user reported seeing "completed task" appear 3x for the same task in
-- under a minute. Investigation showed they actually toggled it 3 times
-- (legit user behaviour), but the optimistic-update + DB-confirm flow can
-- ALSO produce dupes if a click is processed twice (browser quirks, double
-- network retry, etc).
--
-- This trigger fires BEFORE INSERT and silently skips a row if an identical
-- one (same user_id + type + target + metadata->task_id) was inserted in
-- the last 3 seconds. Real toggles 5+ seconds apart still get logged.
--
-- "Identical" matches on:
--   - user_id (same actor)
--   - type    (task_completed, task_reopened, etc)
--   - target  (the task title)
--   - metadata->>'task_id' when present (so toggling task A then task B
--     doesn't get deduped together)
-- ============================================================================

CREATE OR REPLACE FUNCTION activity_logs_dedupe()
RETURNS TRIGGER AS $$
DECLARE
  recent_count int;
BEGIN
  -- Only dedupe rows with a user_id (real human events). System events
  -- (cron, edge functions) keep their existing behaviour.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO recent_count
  FROM activity_logs
  WHERE user_id = NEW.user_id
    AND type = NEW.type
    AND target = NEW.target
    AND COALESCE(metadata->>'task_id', '') = COALESCE(NEW.metadata->>'task_id', '')
    AND created_at > now() - interval '3 seconds';

  IF recent_count > 0 THEN
    -- Skip the insert silently. Returning NULL aborts the row but doesn't
    -- raise an error, so the calling code (logActivity) doesn't see a
    -- failure — the duplicate just doesn't land.
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_activity_logs_dedupe ON activity_logs;
CREATE TRIGGER trg_activity_logs_dedupe
  BEFORE INSERT ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION activity_logs_dedupe();

NOTIFY pgrst, 'reload schema';

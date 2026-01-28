
-- Re-enable Realtime for activity_logs
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE activity_logs, notifications;
COMMIT;

-- Or cleaner just add it if robust
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;

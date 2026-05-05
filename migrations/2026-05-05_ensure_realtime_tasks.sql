-- ============================================================================
-- Defensive: ensure tasks + calendar_events are in supabase_realtime
-- ============================================================================
-- The 2026-03-23 migration already added them via DO block, but if any
-- tenant-isolation work touched the publication or it was rebuilt during
-- a Postgres upgrade, the entries can disappear silently. This is a
-- no-op when they're already present (catches duplicate_object).
-- ============================================================================

DO $$
DECLARE
  required_tables text[] := ARRAY['tasks', 'calendar_events', 'notifications', 'task_comments', 'document_comments'];
  t text;
BEGIN
  FOREACH t IN ARRAY required_tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
      RAISE NOTICE 'Added % to supabase_realtime', t;
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE '% already in supabase_realtime, OK', t;
      WHEN undefined_table THEN
        RAISE NOTICE '% does not exist, skipping', t;
    END;
  END LOOP;
END $$;

-- Force a publication "ping" so postgres notifies replication slots.
NOTIFY pgrst, 'reload schema';

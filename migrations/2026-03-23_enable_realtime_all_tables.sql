-- Enable Supabase Realtime for all tables that have frontend subscriptions.
-- Uses idempotent pattern: catches duplicate_object if table already in publication.

DO $$
DECLARE
  tables text[] := ARRAY[
    'projects',
    'tasks',
    'calendar_events',
    'profiles',
    'clients',
    'incomes',
    'installments',
    'expenses',
    'time_entries',
    'budgets',
    'folders',
    'files',
    'documents'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
      RAISE NOTICE 'Added % to supabase_realtime', t;
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE '% already in supabase_realtime, skipping', t;
    END;
  END LOOP;
END $$;

  -- =============================================
  -- Fix RLS for CALENDAR_EVENTS + CALENDAR_TASKS
  -- Allow team members to see tenant-shared data
  -- =============================================

  -- 1. Ensure tenant_id column exists on calendar tables
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'calendar_events' AND column_name = 'tenant_id'
    ) THEN
      ALTER TABLE calendar_events ADD COLUMN tenant_id UUID REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant_id ON calendar_events(tenant_id);
    END IF;
  END $$;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'calendar_tasks' AND column_name = 'tenant_id'
    ) THEN
      ALTER TABLE calendar_tasks ADD COLUMN tenant_id UUID REFERENCES tenants(id);
      CREATE INDEX IF NOT EXISTS idx_calendar_tasks_tenant_id ON calendar_tasks(tenant_id);
    END IF;
  END $$;

  -- 2. Backfill tenant_id from owner's profile
  UPDATE calendar_events ce
  SET tenant_id = p.tenant_id
  FROM profiles p
  WHERE ce.tenant_id IS NULL AND ce.owner_id = p.id;

  UPDATE calendar_tasks ct
  SET tenant_id = p.tenant_id
  FROM profiles p
  WHERE ct.tenant_id IS NULL AND ct.owner_id = p.id;

  -- =============================================
  -- CALENDAR_EVENTS RLS
  -- =============================================
  ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

  -- Drop ALL legacy policies
  DROP POLICY IF EXISTS "Users can view their own events" ON calendar_events;
  DROP POLICY IF EXISTS "Users can create their own events" ON calendar_events;
  DROP POLICY IF EXISTS "Users can update their own events" ON calendar_events;
  DROP POLICY IF EXISTS "Users can delete their own events" ON calendar_events;
  DROP POLICY IF EXISTS "calendar_events_select_policy" ON calendar_events;
  DROP POLICY IF EXISTS "calendar_events_insert_policy" ON calendar_events;
  DROP POLICY IF EXISTS "calendar_events_update_policy" ON calendar_events;
  DROP POLICY IF EXISTS "calendar_events_delete_policy" ON calendar_events;

  -- Team members in same tenant can view all events
  CREATE POLICY "calendar_events_select_policy" ON calendar_events
  FOR SELECT USING (
    can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
  );

  CREATE POLICY "calendar_events_insert_policy" ON calendar_events
  FOR INSERT WITH CHECK (TRUE);

  CREATE POLICY "calendar_events_update_policy" ON calendar_events
  FOR UPDATE USING (
    can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
  );

  CREATE POLICY "calendar_events_delete_policy" ON calendar_events
  FOR DELETE USING (
    can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
  );

  GRANT ALL ON calendar_events TO authenticated;

  -- =============================================
  -- CALENDAR_TASKS RLS
  -- =============================================
  ALTER TABLE calendar_tasks ENABLE ROW LEVEL SECURITY;

  -- Drop ALL legacy policies
  DROP POLICY IF EXISTS "Users can view their own tasks" ON calendar_tasks;
  DROP POLICY IF EXISTS "Users can create their own tasks" ON calendar_tasks;
  DROP POLICY IF EXISTS "Users can update their own tasks" ON calendar_tasks;
  DROP POLICY IF EXISTS "Users can delete their own tasks" ON calendar_tasks;
  DROP POLICY IF EXISTS "calendar_tasks_select_policy" ON calendar_tasks;
  DROP POLICY IF EXISTS "calendar_tasks_modify_policy" ON calendar_tasks;
  DROP POLICY IF EXISTS "calendar_tasks_insert_policy" ON calendar_tasks;
  DROP POLICY IF EXISTS "calendar_tasks_update_policy" ON calendar_tasks;
  DROP POLICY IF EXISTS "calendar_tasks_delete_policy" ON calendar_tasks;

  -- Team members can see tasks in their tenant + tasks assigned to them
  CREATE POLICY "calendar_tasks_select_policy" ON calendar_tasks
  FOR SELECT USING (
    can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid() OR assignee_id = auth.uid()
  );

  CREATE POLICY "calendar_tasks_insert_policy" ON calendar_tasks
  FOR INSERT WITH CHECK (TRUE);

  -- Owner, assignee, or tenant member can update
  CREATE POLICY "calendar_tasks_update_policy" ON calendar_tasks
  FOR UPDATE USING (
    can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid() OR assignee_id = auth.uid()
  );

  CREATE POLICY "calendar_tasks_delete_policy" ON calendar_tasks
  FOR DELETE USING (
    can_access_tenant(tenant_id) OR tenant_id IS NULL OR owner_id = auth.uid()
  );

  GRANT ALL ON calendar_tasks TO authenticated;

  -- =============================================
  -- EVENT_ATTENDEES RLS
  -- =============================================
  ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users can manage attendees of their events" ON event_attendees;
  DROP POLICY IF EXISTS "event_attendees_select_policy" ON event_attendees;
  DROP POLICY IF EXISTS "event_attendees_insert_policy" ON event_attendees;
  DROP POLICY IF EXISTS "event_attendees_modify_policy" ON event_attendees;

  -- Anyone who can see the event can see attendees
  CREATE POLICY "event_attendees_select_policy" ON event_attendees
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = event_attendees.event_id
      AND (can_access_tenant(ce.tenant_id) OR ce.owner_id = auth.uid())
    )
  );

  -- Event owner or tenant member can manage attendees
  CREATE POLICY "event_attendees_insert_policy" ON event_attendees
  FOR INSERT WITH CHECK (TRUE);

  CREATE POLICY "event_attendees_modify_policy" ON event_attendees
  FOR ALL USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = event_attendees.event_id
      AND (can_access_tenant(ce.tenant_id) OR ce.owner_id = auth.uid())
    )
  );

  GRANT ALL ON event_attendees TO authenticated;

  NOTIFY pgrst, 'reload config';

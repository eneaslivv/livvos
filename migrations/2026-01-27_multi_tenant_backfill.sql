DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant_id ON calendar_events(tenant_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'owner_id'
  ) THEN
    EXECUTE 'UPDATE calendar_events SET created_by = owner_id WHERE created_by IS NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'created_by'
  ) THEN
    EXECUTE 'UPDATE calendar_events ce SET tenant_id = p.tenant_id FROM profiles p WHERE ce.tenant_id IS NULL AND ce.created_by = p.id';
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
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_tasks' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE calendar_tasks ADD COLUMN assigned_to UUID REFERENCES auth.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_tasks' AND column_name = 'assignee_id'
  ) THEN
    EXECUTE 'UPDATE calendar_tasks SET assigned_to = assignee_id WHERE assigned_to IS NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_tasks' AND column_name = 'assigned_to'
  ) THEN
    EXECUTE 'UPDATE calendar_tasks ct SET tenant_id = p.tenant_id FROM profiles p WHERE ct.tenant_id IS NULL AND ct.assigned_to = p.id';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_attendees' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE event_attendees ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_event_attendees_tenant_id ON event_attendees(tenant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_attendees' AND column_name = 'event_id'
  ) THEN
    EXECUTE 'UPDATE event_attendees ea SET tenant_id = ce.tenant_id FROM calendar_events ce WHERE ea.tenant_id IS NULL AND ea.event_id = ce.id';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'milestones' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE milestones ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_milestones_tenant_id ON milestones(tenant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'milestones' AND column_name = 'project_id'
  ) THEN
    EXECUTE 'UPDATE milestones m SET tenant_id = p.tenant_id FROM projects p WHERE m.tenant_id IS NULL AND m.project_id = p.id';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE activities ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_activities_tenant_id ON activities(tenant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'UPDATE activities a SET tenant_id = p.tenant_id FROM profiles p WHERE a.tenant_id IS NULL AND a.user_id = p.id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'owner_id'
  ) THEN
    EXECUTE 'UPDATE activities a SET tenant_id = p.tenant_id FROM profiles p WHERE a.tenant_id IS NULL AND a.owner_id = p.id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name = 'created_by'
  ) THEN
    EXECUTE 'UPDATE activities a SET tenant_id = p.tenant_id FROM profiles p WHERE a.tenant_id IS NULL AND a.created_by = p.id';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages(tenant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_hits' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE quick_hits ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_quick_hits_tenant_id ON quick_hits(tenant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON notifications(tenant_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'priority'
  ) THEN
    ALTER TABLE notifications ADD COLUMN priority TEXT DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'category'
  ) THEN
    ALTER TABLE notifications ADD COLUMN category TEXT DEFAULT 'general';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'read_at'
  ) THEN
    ALTER TABLE notifications ADD COLUMN read_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE notifications ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'action_required'
  ) THEN
    ALTER TABLE notifications ADD COLUMN action_required BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'action_url'
  ) THEN
    ALTER TABLE notifications ADD COLUMN action_url TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'action_text'
  ) THEN
    ALTER TABLE notifications ADD COLUMN action_text TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'batch_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN batch_id UUID;
  END IF;
END $$;

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT con.conname INTO v_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'notifications'
    AND con.contype = 'c';

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;

  EXECUTE 'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (''lead'',''task'',''project'',''invite'',''system'',''activity'',''security'',''billing'',''deadline'',''mention''))';
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'UPDATE notifications n SET tenant_id = p.tenant_id FROM profiles p WHERE n.tenant_id IS NULL AND n.user_id = p.id';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'project_id'
  ) THEN
    EXECUTE 'UPDATE tasks t SET tenant_id = p.tenant_id FROM projects p WHERE t.tenant_id IS NULL AND t.project_id = p.id';
  END IF;
END $$;

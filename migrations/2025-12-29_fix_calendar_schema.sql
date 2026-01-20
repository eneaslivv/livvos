-- ==============================================================================
-- FIX CALENDAR SCHEMA
-- Creates missing tables for the Calendar module if they don't exist
-- ==============================================================================

-- 1. CALENDAR EVENTS
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TEXT, -- HH:MM
  duration INTEGER, -- minutes
  type TEXT DEFAULT 'meeting',
  color TEXT DEFAULT '#3b82f6',
  all_day BOOLEAN DEFAULT FALSE,
  location TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CALENDAR TASKS
CREATE TABLE IF NOT EXISTS calendar_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT FALSE,
  priority TEXT DEFAULT 'medium',
  start_date DATE,
  end_date DATE,
  start_time TEXT,
  duration INTEGER DEFAULT 60,
  status TEXT DEFAULT 'todo',
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  order_index INTEGER DEFAULT 0,
  parent_task_id UUID REFERENCES calendar_tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. EVENT ATTENDEES
CREATE TABLE IF NOT EXISTS event_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'attendee',
  status TEXT DEFAULT 'accepted',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. CALENDAR REMINDERS
CREATE TABLE IF NOT EXISTS calendar_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  task_id UUID REFERENCES calendar_tasks(id) ON DELETE CASCADE,
  minutes_before INTEGER NOT NULL,
  type TEXT DEFAULT 'notification',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. CALENDAR LABELS
CREATE TABLE IF NOT EXISTS calendar_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. EVENT LABELS
CREATE TABLE IF NOT EXISTS event_labels (
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  label_id UUID REFERENCES calendar_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, label_id)
);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_labels ENABLE ROW LEVEL SECURITY;

-- Basic Policies (Adjusted to avoid errors if they exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Users can view their own events') THEN
        CREATE POLICY "Users can view their own events" ON calendar_events FOR SELECT USING (auth.uid() = owner_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Users can create their own events') THEN
        CREATE POLICY "Users can create their own events" ON calendar_events FOR INSERT WITH CHECK (auth.uid() = owner_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Users can update their own events') THEN
        CREATE POLICY "Users can update their own events" ON calendar_events FOR UPDATE USING (auth.uid() = owner_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Users can delete their own events') THEN
        CREATE POLICY "Users can delete their own events" ON calendar_events FOR DELETE USING (auth.uid() = owner_id);
    END IF;
END $$;

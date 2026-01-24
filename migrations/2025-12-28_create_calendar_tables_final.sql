-- SQL para crear tablas de calendario - EJECUTAR EN SUPABASE

-- ===================================
-- TABLAS PARA SISTEMA DE CALENDARIO
-- ===================================

-- 1. Tabla principal de eventos del calendario
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure all columns exist for generic "create table if not exists" case
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS duration INTEGER;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'meeting';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS all_day BOOLEAN DEFAULT FALSE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;


-- 2. Tabla de tareas del calendario (con drag & drop)
CREATE TABLE IF NOT EXISTS calendar_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 60;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'todo';
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES calendar_tasks(id) ON DELETE CASCADE;


-- 3. Tabla de asignación de eventos a usuarios
CREATE TABLE IF NOT EXISTS event_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'attendee';
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'accepted';


-- 4. Tabla de recordatorios
CREATE TABLE IF NOT EXISTS calendar_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  task_id UUID REFERENCES calendar_tasks(id) ON DELETE CASCADE,
  minutes_before INTEGER NOT NULL, -- Minutos antes del evento/tarea
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE calendar_reminders ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'notification';


-- 5. Tabla de etiquetas/categorías
CREATE TABLE IF NOT EXISTS calendar_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- 6. Tabla de relación eventos-etiquetas
CREATE TABLE IF NOT EXISTS event_labels (
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  label_id UUID REFERENCES calendar_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, label_id)
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_calendar_events_owner_id ON calendar_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client_id ON calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_project_id ON calendar_events(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_owner_id ON calendar_tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_start_date ON calendar_tasks(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_status ON calendar_tasks(status);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_assignee_id ON calendar_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_id ON event_attendees(user_id);

-- RLS Policies para seguridad
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_labels ENABLE ROW LEVEL SECURITY;

-- Políticas para calendar_events
DROP POLICY IF EXISTS "Users can view their own events" ON calendar_events;
CREATE POLICY "Users can view their own events" ON calendar_events
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create their own events" ON calendar_events;
CREATE POLICY "Users can create their own events" ON calendar_events
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own events" ON calendar_events;
CREATE POLICY "Users can update their own events" ON calendar_events
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own events" ON calendar_events;
CREATE POLICY "Users can delete their own events" ON calendar_events
  FOR DELETE USING (auth.uid() = owner_id);

-- Políticas para calendar_tasks
DROP POLICY IF EXISTS "Users can view their own tasks" ON calendar_tasks;
CREATE POLICY "Users can view their own tasks" ON calendar_tasks
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can create their own tasks" ON calendar_tasks;
CREATE POLICY "Users can create their own tasks" ON calendar_tasks
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own tasks" ON calendar_tasks;
CREATE POLICY "Users can update their own tasks" ON calendar_tasks
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own tasks" ON calendar_tasks;
CREATE POLICY "Users can delete their own tasks" ON calendar_tasks
  FOR DELETE USING (auth.uid() = owner_id);

-- Políticas para event_attendees
DROP POLICY IF EXISTS "Users can manage attendees of their events" ON event_attendees;
CREATE POLICY "Users can manage attendees of their events" ON event_attendees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM calendar_events 
      WHERE calendar_events.id = event_attendees.event_id 
      AND calendar_events.owner_id = auth.uid()
    )
  );

-- Políticas para calendar_labels
DROP POLICY IF EXISTS "Users can manage their own labels" ON calendar_labels;
CREATE POLICY "Users can manage their own labels" ON calendar_labels
  FOR ALL USING (auth.uid() = owner_id);

SELECT '✅ Tablas de calendario creadas/verificadas' as status;
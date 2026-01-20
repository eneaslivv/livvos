-- ===================================
-- TABLAS PARA SISTEMA DE CALENDARIO
-- ===================================

-- 1. Tabla principal de eventos del calendario
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TEXT, -- Formato HH:MM
  duration INTEGER, -- Duración en minutos
  type TEXT DEFAULT 'meeting' CHECK (type IN ('meeting', 'work-block', 'deadline', 'call', 'note')),
  color TEXT DEFAULT '#3b82f6',
  all_day BOOLEAN DEFAULT FALSE,
  location TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de tareas del calendario (con drag & drop)
CREATE TABLE calendar_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT FALSE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  start_date DATE,
  end_date DATE,
  start_time TEXT,
  duration INTEGER DEFAULT 60, -- minutos
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'done', 'cancelled')),
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  order_index INTEGER DEFAULT 0, -- Para drag & drop
  parent_task_id UUID REFERENCES calendar_tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de asignación de eventos a usuarios
CREATE TABLE event_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'attendee' CHECK (role IN ('organizer', 'attendee', 'optional')),
  status TEXT DEFAULT 'accepted' CHECK (status IN ('accepted', 'declined', 'tentative')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabla de recordatorios
CREATE TABLE calendar_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  task_id UUID REFERENCES calendar_tasks(id) ON DELETE CASCADE,
  minutes_before INTEGER NOT NULL, -- Minutos antes del evento/tarea
  type TEXT DEFAULT 'notification' CHECK (type IN ('notification', 'email')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabla de etiquetas/categorías
CREATE TABLE calendar_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabla de relación eventos-etiquetas
CREATE TABLE event_labels (
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  label_id UUID REFERENCES calendar_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, label_id)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_calendar_events_owner_id ON calendar_events(owner_id);
CREATE INDEX idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX idx_calendar_events_client_id ON calendar_events(client_id);
CREATE INDEX idx_calendar_events_project_id ON calendar_events(project_id);
CREATE INDEX idx_calendar_tasks_owner_id ON calendar_tasks(owner_id);
CREATE INDEX idx_calendar_tasks_start_date ON calendar_tasks(start_date);
CREATE INDEX idx_calendar_tasks_status ON calendar_tasks(status);
CREATE INDEX idx_calendar_tasks_assignee_id ON calendar_tasks(assignee_id);
CREATE INDEX idx_event_attendees_event_id ON event_attendees(event_id);
CREATE INDEX idx_event_attendees_user_id ON event_attendees(user_id);

-- RLS Policies para seguridad
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_labels ENABLE ROW LEVEL SECURITY;

-- Políticas para calendar_events
CREATE POLICY "Users can view their own events" ON calendar_events
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own events" ON calendar_events
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own events" ON calendar_events
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own events" ON calendar_events
  FOR DELETE USING (auth.uid() = owner_id);

-- Políticas para calendar_tasks
CREATE POLICY "Users can view their own tasks" ON calendar_tasks
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own tasks" ON calendar_tasks
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own tasks" ON calendar_tasks
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own tasks" ON calendar_tasks
  FOR DELETE USING (auth.uid() = owner_id);

-- Políticas para event_attendees
CREATE POLICY "Users can manage attendees of their events" ON event_attendees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM calendar_events 
      WHERE calendar_events.id = event_attendees.event_id 
      AND calendar_events.owner_id = auth.uid()
    )
  );

-- Políticas para calendar_labels
CREATE POLICY "Users can manage their own labels" ON calendar_labels
  FOR ALL USING (auth.uid() = owner_id);

-- Insertar datos de muestra
INSERT INTO calendar_events (owner_id, title, description, start_date, end_date, start_time, duration, type, color, location) VALUES 
(auth.uid(), 'Kickoff Meeting - TechCorp', 'Reunión inicial para discutir requisitos del proyecto', CURRENT_DATE, CURRENT_DATE, '10:00', 60, 'meeting', '#3b82f6', 'Zoom'),
(auth.uid(), 'Design Review - StartupXYZ', 'Revisar propuestas de diseño con el equipo', CURRENT_DATE + 1, CURRENT_DATE + 1, '14:00', 90, 'meeting', '#10b981', 'Oficina'),
(auth.uid(), 'Deadline - Fashion Boutique', 'Entrega final de mockups de e-commerce', CURRENT_DATE + 2, CURRENT_DATE + 2, '17:00', 0, 'deadline', '#f59e0b', NULL),
(auth.uid(), 'Focus Time - API Development', 'Trabajo profundo en arquitectura de API', CURRENT_DATE + 3, CURRENT_DATE + 3, '09:00', 120, 'work-block', '#8b5cf6', 'Home Office');

INSERT INTO calendar_tasks (owner_id, title, description, start_date, priority, status, duration) VALUES 
(auth.uid(), 'Preparar presentación para TechCorp', 'Crear slides para la reunión de kickoff', CURRENT_DATE, 'high', 'todo', 45),
(auth.uid(), 'Enviar propuesta a StartupXYZ', 'Finalizar y enviar propuesta técnica', CURRENT_DATE + 1, 'high', 'in-progress', 30),
(auth.uid(), 'Revisar feedback de Fashion Boutique', 'Analizar comentarios y preparar revisiones', CURRENT_DATE + 2, 'medium', 'todo', 60),
(auth.uid(), 'Actualizar portfolio', 'Añadir últimos proyectos al portfolio', CURRENT_DATE + 3, 'low', 'todo', 90);

-- Insertar etiquetas de ejemplo
INSERT INTO calendar_labels (owner_id, name, color) VALUES 
(auth.uid(), 'Proyecto TechCorp', '#3b82f6'),
(auth.uid(), 'Proyecto StartupXYZ', '#10b981'),
(auth.uid(), 'Proyecto Fashion Boutique', '#f59e0b'),
(auth.uid(), 'Desarrollo Interno', '#8b5cf6'),
(auth.uid(), 'Reunión', '#ef4444'),
(auth.uid(), 'Deadline', '#dc2626');

-- Etiquetar eventos
INSERT INTO event_labels (event_id, label_id) VALUES 
((SELECT id FROM calendar_events WHERE title = 'Kickoff Meeting - TechCorp' LIMIT 1), (SELECT id FROM calendar_labels WHERE name = 'Proyecto TechCorp' LIMIT 1)),
((SELECT id FROM calendar_events WHERE title = 'Design Review - StartupXYZ' LIMIT 1), (SELECT id FROM calendar_labels WHERE name = 'Proyecto StartupXYZ' LIMIT 1)),
((SELECT id FROM calendar_events WHERE title = 'Deadline - Fashion Boutique' LIMIT 1), (SELECT id FROM calendar_labels WHERE name = 'Proyecto Fashion Boutique' LIMIT 1));
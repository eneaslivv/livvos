
-- ============================================
-- FILE: 2025-12-28_add_project_json_columns.sql
-- ============================================

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS client_name TEXT,
ADD COLUMN IF NOT EXISTS client_avatar TEXT,
ADD COLUMN IF NOT EXISTS deadline DATE,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS team TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tasks_groups JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS activity JSONB DEFAULT '[]';

COMMENT ON COLUMN public.projects.tasks_groups IS 'Array de fases con tareas en formato JSON';
COMMENT ON COLUMN public.projects.files IS 'Archivos asociados al proyecto en formato JSON';
COMMENT ON COLUMN public.projects.activity IS 'Actividad del proyecto en formato JSON';

-- ============================================
-- FILE: 2025-12-28_create_calendar_tables.sql
-- ============================================

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
  duration INTEGER, -- DuraciÃ³n en minutos
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

-- 3. Tabla de asignaciÃ³n de eventos a usuarios
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

-- 5. Tabla de etiquetas/categorÃ­as
CREATE TABLE calendar_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabla de relaciÃ³n eventos-etiquetas
CREATE TABLE event_labels (
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  label_id UUID REFERENCES calendar_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, label_id)
);

-- Ãndices para mejorar rendimiento
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

-- PolÃ­ticas para calendar_events
CREATE POLICY "Users can view their own events" ON calendar_events
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own events" ON calendar_events
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own events" ON calendar_events
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own events" ON calendar_events
  FOR DELETE USING (auth.uid() = owner_id);

-- PolÃ­ticas para calendar_tasks
CREATE POLICY "Users can view their own tasks" ON calendar_tasks
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own tasks" ON calendar_tasks
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own tasks" ON calendar_tasks
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own tasks" ON calendar_tasks
  FOR DELETE USING (auth.uid() = owner_id);

-- PolÃ­ticas para event_attendees
CREATE POLICY "Users can manage attendees of their events" ON event_attendees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM calendar_events 
      WHERE calendar_events.id = event_attendees.event_id 
      AND calendar_events.owner_id = auth.uid()
    )
  );

-- PolÃ­ticas para calendar_labels
CREATE POLICY "Users can manage their own labels" ON calendar_labels
  FOR ALL USING (auth.uid() = owner_id);

-- Insertar datos de muestra
INSERT INTO calendar_events (owner_id, title, description, start_date, end_date, start_time, duration, type, color, location) VALUES 
(auth.uid(), 'Kickoff Meeting - TechCorp', 'ReuniÃ³n inicial para discutir requisitos del proyecto', CURRENT_DATE, CURRENT_DATE, '10:00', 60, 'meeting', '#3b82f6', 'Zoom'),
(auth.uid(), 'Design Review - StartupXYZ', 'Revisar propuestas de diseÃ±o con el equipo', CURRENT_DATE + 1, CURRENT_DATE + 1, '14:00', 90, 'meeting', '#10b981', 'Oficina'),
(auth.uid(), 'Deadline - Fashion Boutique', 'Entrega final de mockups de e-commerce', CURRENT_DATE + 2, CURRENT_DATE + 2, '17:00', 0, 'deadline', '#f59e0b', NULL),
(auth.uid(), 'Focus Time - API Development', 'Trabajo profundo en arquitectura de API', CURRENT_DATE + 3, CURRENT_DATE + 3, '09:00', 120, 'work-block', '#8b5cf6', 'Home Office');

INSERT INTO calendar_tasks (owner_id, title, description, start_date, priority, status, duration) VALUES 
(auth.uid(), 'Preparar presentaciÃ³n para TechCorp', 'Crear slides para la reuniÃ³n de kickoff', CURRENT_DATE, 'high', 'todo', 45),
(auth.uid(), 'Enviar propuesta a StartupXYZ', 'Finalizar y enviar propuesta tÃ©cnica', CURRENT_DATE + 1, 'high', 'in-progress', 30),
(auth.uid(), 'Revisar feedback de Fashion Boutique', 'Analizar comentarios y preparar revisiones', CURRENT_DATE + 2, 'medium', 'todo', 60),
(auth.uid(), 'Actualizar portfolio', 'AÃ±adir Ãºltimos proyectos al portfolio', CURRENT_DATE + 3, 'low', 'todo', 90);

-- Insertar etiquetas de ejemplo
INSERT INTO calendar_labels (owner_id, name, color) VALUES 
(auth.uid(), 'Proyecto TechCorp', '#3b82f6'),
(auth.uid(), 'Proyecto StartupXYZ', '#10b981'),
(auth.uid(), 'Proyecto Fashion Boutique', '#f59e0b'),
(auth.uid(), 'Desarrollo Interno', '#8b5cf6'),
(auth.uid(), 'ReuniÃ³n', '#ef4444'),
(auth.uid(), 'Deadline', '#dc2626');

-- Etiquetar eventos
INSERT INTO event_labels (event_id, label_id) VALUES 
((SELECT id FROM calendar_events WHERE title = 'Kickoff Meeting - TechCorp' LIMIT 1), (SELECT id FROM calendar_labels WHERE name = 'Proyecto TechCorp' LIMIT 1)),
((SELECT id FROM calendar_events WHERE title = 'Design Review - StartupXYZ' LIMIT 1), (SELECT id FROM calendar_labels WHERE name = 'Proyecto StartupXYZ' LIMIT 1)),
((SELECT id FROM calendar_events WHERE title = 'Deadline - Fashion Boutique' LIMIT 1), (SELECT id FROM calendar_labels WHERE name = 'Proyecto Fashion Boutique' LIMIT 1));

-- ============================================
-- FILE: 2025-12-28_create_calendar_tables_final.sql
-- ============================================

-- SQL para crear tablas de calendario - EJECUTAR EN SUPABASE
-- PASOS:
-- 1. Ve a https://app.supabase.com/project/azkhquxgekgfuplvwobe/sql
-- 2. Copia TODO este contenido
-- 3. Click en "RUN" (botÃ³n verde)

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
  duration INTEGER, -- DuraciÃ³n en minutos
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

-- 3. Tabla de asignaciÃ³n de eventos a usuarios
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

-- 5. Tabla de etiquetas/categorÃ­as
CREATE TABLE calendar_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabla de relaciÃ³n eventos-etiquetas
CREATE TABLE event_labels (
  event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  label_id UUID REFERENCES calendar_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, label_id)
);

-- Ãndices para mejorar rendimiento
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

-- PolÃ­ticas para calendar_events
CREATE POLICY "Users can view their own events" ON calendar_events
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own events" ON calendar_events
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own events" ON calendar_events
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own events" ON calendar_events
  FOR DELETE USING (auth.uid() = owner_id);

-- PolÃ­ticas para calendar_tasks
CREATE POLICY "Users can view their own tasks" ON calendar_tasks
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own tasks" ON calendar_tasks
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own tasks" ON calendar_tasks
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own tasks" ON calendar_tasks
  FOR DELETE USING (auth.uid() = owner_id);

-- PolÃ­ticas para event_attendees
CREATE POLICY "Users can manage attendees of their events" ON event_attendees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM calendar_events 
      WHERE calendar_events.id = event_attendees.event_id 
      AND calendar_events.owner_id = auth.uid()
    )
  );

-- PolÃ­ticas para calendar_labels
CREATE POLICY "Users can manage their own labels" ON calendar_labels
  FOR ALL USING (auth.uid() = owner_id);

-- Insertar datos de muestra
INSERT INTO calendar_events (owner_id, title, description, start_date, end_date, start_time, duration, type, color, location) VALUES 
(auth.uid(), 'Kickoff Meeting - TechCorp', 'ReuniÃ³n inicial para discutir requisitos del proyecto', CURRENT_DATE, CURRENT_DATE, '10:00', 60, 'meeting', '#3b82f6', 'Zoom'),
(auth.uid(), 'Design Review - StartupXYZ', 'Revisar propuestas de diseÃ±o con el equipo', CURRENT_DATE + 1, CURRENT_DATE + 1, '14:00', 90, 'meeting', '#10b981', 'Oficina'),
(auth.uid(), 'Deadline - Fashion Boutique', 'Entrega final de mockups de e-commerce', CURRENT_DATE + 2, CURRENT_DATE + 2, '17:00', 0, 'deadline', '#f59e0b', NULL),
(auth.uid(), 'Focus Time - API Development', 'Trabajo profundo en arquitectura de API', CURRENT_DATE + 3, CURRENT_DATE + 3, '09:00', 120, 'work-block', '#8b5cf6', 'Home Office');

INSERT INTO calendar_tasks (owner_id, title, description, start_date, priority, status, duration) VALUES 
(auth.uid(), 'Preparar presentaciÃ³n para TechCorp', 'Crear slides para la reuniÃ³n de kickoff', CURRENT_DATE, 'high', 'todo', 45),
(auth.uid(), 'Enviar propuesta a StartupXYZ', 'Finalizar y enviar propuesta tÃ©cnica', CURRENT_DATE + 1, 'high', 'in-progress', 30),
(auth.uid(), 'Revisar feedback de Fashion Boutique', 'Analizar comentarios y preparar revisiones', CURRENT_DATE + 2, 'medium', 'todo', 60),
(auth.uid(), 'Actualizar portfolio', 'AÃ±adir Ãºltimos proyectos al portfolio', CURRENT_DATE + 3, 'low', 'todo', 90);

-- Insertar etiquetas de ejemplo
INSERT INTO calendar_labels (owner_id, name, color) VALUES 
(auth.uid(), 'Proyecto TechCorp', '#3b82f6'),
(auth.uid(), 'Proyecto StartupXYZ', '#10b981'),
(auth.uid(), 'Proyecto Fashion Boutique', '#f59e0b'),
(auth.uid(), 'Desarrollo Interno', '#8b5cf6'),
(auth.uid(), 'ReuniÃ³n', '#ef4444'),
(auth.uid(), 'Deadline', '#dc2626');

-- Etiquetar eventos
INSERT INTO event_labels (event_id, label_id) VALUES 
((SELECT id FROM calendar_events WHERE title = 'Kickoff Meeting - TechCorp' LIMIT 1), (SELECT id FROM calendar_labels WHERE name = 'Proyecto TechCorp' LIMIT 1)),
((SELECT id FROM calendar_events WHERE title = 'Design Review - StartupXYZ' LIMIT 1), (SELECT id FROM calendar_labels WHERE name = 'Proyecto StartupXYZ' LIMIT 1)),
((SELECT id FROM calendar_events WHERE title = 'Deadline - Fashion Boutique' LIMIT 1), (SELECT id FROM calendar_labels WHERE name = 'Proyecto Fashion Boutique' LIMIT 1));

-- VerificaciÃ³n final
SELECT 'âœ… Tablas de calendario creadas exitosamente!' as status;
SELECT 'âœ… RLS Policies aplicadas' as status;
SELECT 'âœ… Datos de muestra insertados' as status;
SELECT 'âœ… Sistema de calendario listo!' as status;

-- ============================================
-- FILE: 2025-12-28_create_clients_tables.sql
-- ============================================

-- ===================================
-- TABLAS PARA SISTEMA DE CLIENTES
-- ===================================

-- 1. Tabla principal de clientes
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  phone TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'prospect')),
  notes TEXT,
  address TEXT,
  industry TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de mensajes/chat con clientes
CREATE TABLE IF NOT EXISTS client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'client')),
  sender_id UUID,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'image')),
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- 3. Tabla de tareas asignadas a clientes
CREATE TABLE IF NOT EXISTS client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT FALSE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabla de historial de interacciones
CREATE TABLE IF NOT EXISTS client_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('call', 'meeting', 'email', 'note', 'status_change', 'task_created')),
  action_description TEXT NOT NULL,
  action_date TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- 5. Tabla de proyectos compartidos con clientes
CREATE TABLE IF NOT EXISTS client_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  shared_at TIMESTAMPTZ DEFAULT now(),
  shared_by UUID REFERENCES auth.users(id)
);

-- Ãndices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_messages_client_id ON client_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_client_messages_created_at ON client_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_tasks_client_id ON client_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_completed ON client_tasks(completed);
CREATE INDEX IF NOT EXISTS idx_client_history_client_id ON client_history(client_id);
CREATE INDEX IF NOT EXISTS idx_client_history_action_date ON client_history(action_date DESC);
CREATE INDEX IF NOT EXISTS idx_client_projects_client_id ON client_projects(client_id);

-- RLS Policies para seguridad
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_projects ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas para clients
CREATE POLICY "Users can view their own clients" ON clients
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own clients" ON clients
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own clients" ON clients
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own clients" ON clients
  FOR DELETE USING (auth.uid() = owner_id);

-- PolÃ­ticas para client_messages
CREATE POLICY "Users can view messages of their clients" ON client_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_messages.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages for their clients" ON client_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_messages.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- PolÃ­ticas para client_tasks
CREATE POLICY "Users can manage tasks of their clients" ON client_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_tasks.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- PolÃ­ticas para client_history
CREATE POLICY "Users can view history of their clients" ON client_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_history.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create history for their clients" ON client_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_history.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- PolÃ­ticas para client_projects
CREATE POLICY "Users can manage projects of their clients" ON client_projects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_projects.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- Insertar datos de muestra
INSERT INTO clients (name, email, company, phone, status, notes, industry, address) VALUES 
('Sofia Rodriguez', 'sofia@techcorp.com', 'TechCorp Solutions', '+1-555-0123', 'active', 'CEO interesada en rebranding completo. Muy receptiva a ideas creativas.', 'Technology', '123 Main St, San Francisco, CA'),
('Lucas Martinez', 'lucas@startup.io', 'StartupXYZ', '+1-555-0456', 'prospect', 'CTO tÃ©cnico, enfocado en escalabilidad y performance.', 'SaaS', '456 Innovation Ave, Austin, TX'),
('Sarah Jenkins', 'sarah@boutique.co', 'Fashion Boutique', '+1-555-0789', 'active', 'DueÃ±a de boutique de moda. Necesita e-commerce moderno.', 'Fashion', '789 Style Blvd, New York, NY');

INSERT INTO client_messages (client_id, sender_type, sender_name, message, created_at) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com'), 'client', 'Sofia Rodriguez', 'Hola! Estoy muy interesada en un rebranding completo para TechCorp. Â¿Podemos agendar una llamada?', NOW() - INTERVAL '2 days'),
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com'), 'user', 'Eneas', 'Â¡Hola Sofia! Claro, me encantarÃ­a discutir tu proyecto. Â¿QuÃ© dÃ­a te vendrÃ­a bien?', NOW() - INTERVAL '1 day'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io'), 'client', 'Lucas Martinez', 'Necesito ayuda con la arquitectura de nuestra API. Estamos creciendo rÃ¡pidamente.', NOW() - INTERVAL '3 days');

INSERT INTO client_tasks (client_id, title, description, priority, due_date) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com'), 'Enviar propuesta de rebranding', 'Preparar y enviar propuesta detallada con timeline y presupuesto', 'high', NOW() + INTERVAL '3 days'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io'), 'Revisar documentaciÃ³n de API', 'Analizar la arquitectura actual y proponer mejoras', 'medium', NOW() + INTERVAL '5 days'),
((SELECT id FROM clients WHERE email = 'sarah@boutique.co'), 'DiseÃ±ar mockups de e-commerce', 'Crear 3 propuestas de diseÃ±o para la tienda online', 'high', NOW() + INTERVAL '2 days');

INSERT INTO client_history (client_id, user_name, action_type, action_description) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com'), 'Eneas', 'call', 'Llamada inicial de 45 minutos - discutieron rebranding y objetivos'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io'), 'Eneas', 'meeting', 'ReuniÃ³n Zoom de 30 minutos - revisaron requisitos tÃ©cnicos'),
((SELECT id FROM clients WHERE email = 'sarah@boutique.co'), 'Eneas', 'email', 'EnviÃ³ portfolio de diseÃ±o y casos de Ã©xito en e-commerce');

-- ============================================
-- FILE: 2025-12-28_create_clients_tables_direct.sql
-- ============================================

-- Ejecutar esto directamente en el SQL Editor de Supabase
-- Copiar TODO este contenido y pegarlo en: https://app.supabase.com/project/azkhquxgekgfuplvwobe/sql/new

-- ===================================
-- TABLAS PARA SISTEMA DE CLIENTES
-- ===================================

-- 1. Tabla principal de clientes
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  phone TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'prospect')),
  notes TEXT,
  address TEXT,
  industry TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de mensajes/chat con clientes
CREATE TABLE client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'client')),
  sender_id UUID,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'image')),
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- 3. Tabla de tareas asignadas a clientes
CREATE TABLE client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT FALSE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabla de historial de interacciones
CREATE TABLE client_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('call', 'meeting', 'email', 'note', 'status_change', 'task_created')),
  action_description TEXT NOT NULL,
  action_date TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- 5. Tabla de proyectos compartidos con clientes
CREATE TABLE client_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  shared_at TIMESTAMPTZ DEFAULT now(),
  shared_by UUID REFERENCES auth.users(id)
);

-- Ãndices para mejorar rendimiento
CREATE INDEX idx_clients_owner_id ON clients(owner_id);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_created_at ON clients(created_at DESC);
CREATE INDEX idx_client_messages_client_id ON client_messages(client_id);
CREATE INDEX idx_client_messages_created_at ON client_messages(created_at DESC);
CREATE INDEX idx_client_tasks_client_id ON client_tasks(client_id);
CREATE INDEX idx_client_tasks_completed ON client_tasks(completed);
CREATE INDEX idx_client_history_client_id ON client_history(client_id);
CREATE INDEX idx_client_history_action_date ON client_history(action_date DESC);
CREATE INDEX idx_client_projects_client_id ON client_projects(client_id);

-- RLS Policies para seguridad
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_projects ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas para clients
CREATE POLICY "Users can view their own clients" ON clients
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own clients" ON clients
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own clients" ON clients
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own clients" ON clients
  FOR DELETE USING (auth.uid() = owner_id);

-- PolÃ­ticas para client_messages
CREATE POLICY "Users can view messages of their clients" ON client_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_messages.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages for their clients" ON client_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_messages.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- PolÃ­ticas para client_tasks
CREATE POLICY "Users can manage tasks of their clients" ON client_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_tasks.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- PolÃ­ticas para client_history
CREATE POLICY "Users can view history of their clients" ON client_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_history.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create history for their clients" ON client_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_history.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- PolÃ­ticas para client_projects
CREATE POLICY "Users can manage projects of their clients" ON client_projects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_projects.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- Insertar datos de muestra
INSERT INTO clients (owner_id, name, email, company, phone, status, notes, industry, address) VALUES 
(auth.uid(), 'Sofia Rodriguez', 'sofia@techcorp.com', 'TechCorp Solutions', '+1-555-0123', 'active', 'CEO interesada en rebranding completo. Muy receptiva a ideas creativas.', 'Technology', '123 Main St, San Francisco, CA'),
(auth.uid(), 'Lucas Martinez', 'lucas@startup.io', 'StartupXYZ', '+1-555-0456', 'prospect', 'CTO tÃ©cnico, enfocado en escalabilidad y performance.', 'SaaS', '456 Innovation Ave, Austin, TX'),
(auth.uid(), 'Sarah Jenkins', 'sarah@boutique.co', 'Fashion Boutique', '+1-555-0789', 'active', 'DueÃ±a de boutique de moda. Necesita e-commerce moderno.', 'Fashion', '789 Style Blvd, New York, NY');

INSERT INTO client_messages (client_id, sender_type, sender_name, message, created_at) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), 'client', 'Sofia Rodriguez', 'Hola! Estoy muy interesada en un rebranding completo para TechCorp. Â¿Podemos agendar una llamada?', NOW() - INTERVAL '2 days'),
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), 'user', 'Eneas', 'Â¡Hola Sofia! Claro, me encantarÃ­a discutir tu proyecto. Â¿QuÃ© dÃ­a te vendrÃ­a bien?', NOW() - INTERVAL '1 day'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io' AND owner_id = auth.uid()), 'client', 'Lucas Martinez', 'Necesito ayuda con la arquitectura de nuestra API. Estamos creciendo rÃ¡pidamente.', NOW() - INTERVAL '3 days');

INSERT INTO client_tasks (client_id, owner_id, title, description, priority, due_date) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), auth.uid(), 'Enviar propuesta de rebranding', 'Preparar y enviar propuesta detallada con timeline y presupuesto', 'high', NOW() + INTERVAL '3 days'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io' AND owner_id = auth.uid()), auth.uid(), 'Revisar documentaciÃ³n de API', 'Analizar la arquitectura actual y proponer mejoras', 'medium', NOW() + INTERVAL '5 days'),
((SELECT id FROM clients WHERE email = 'sarah@boutique.co' AND owner_id = auth.uid()), auth.uid(), 'DiseÃ±ar mockups de e-commerce', 'Crear 3 propuestas de diseÃ±o para la tienda online', 'high', NOW() + INTERVAL '2 days');

INSERT INTO client_history (client_id, user_id, user_name, action_type, action_description) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), auth.uid(), 'Eneas', 'call', 'Llamada inicial de 45 minutos - discutieron rebranding y objetivos'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io' AND owner_id = auth.uid()), auth.uid(), 'Eneas', 'meeting', 'ReuniÃ³n Zoom de 30 minutos - revisaron requisitos tÃ©cnicos'),
((SELECT id FROM clients WHERE email = 'sarah@boutique.co' AND owner_id = auth.uid()), auth.uid(), 'Eneas', 'email', 'EnviÃ³ portfolio de diseÃ±o y casos de Ã©xito en e-commerce');

-- ============================================
-- FILE: 2025-12-28_create_clients_tables_final.sql
-- ============================================

-- SQL para crear tablas de clientes - EJECUTAR EN SUPABASE
-- PASOS:
-- 1. Ve a https://app.supabase.com/project/azkhquxgekgfuplvwobe/sql
-- 2. Copia TODO este contenido
-- 3. Click en "RUN" (botÃ³n verde)

-- ===================================
-- TABLAS PARA SISTEMA DE CLIENTES
-- ===================================

-- 1. Tabla principal de clientes
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  phone TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'prospect')),
  notes TEXT,
  address TEXT,
  industry TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de mensajes/chat con clientes
CREATE TABLE client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'client')),
  sender_id UUID,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'image')),
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- 3. Tabla de tareas asignadas a clientes
CREATE TABLE client_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT FALSE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabla de historial de interacciones
CREATE TABLE client_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('call', 'meeting', 'email', 'note', 'status_change', 'task_created')),
  action_description TEXT NOT NULL,
  action_date TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- Ãndices para mejorar rendimiento
CREATE INDEX idx_clients_owner_id ON clients(owner_id);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_created_at ON clients(created_at DESC);
CREATE INDEX idx_client_messages_client_id ON client_messages(client_id);
CREATE INDEX idx_client_messages_created_at ON client_messages(created_at DESC);
CREATE INDEX idx_client_tasks_client_id ON client_tasks(client_id);
CREATE INDEX idx_client_tasks_completed ON client_tasks(completed);
CREATE INDEX idx_client_history_client_id ON client_history(client_id);
CREATE INDEX idx_client_history_action_date ON client_history(action_date DESC);

-- RLS Policies para seguridad
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_history ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas para clients
CREATE POLICY "Users can view their own clients" ON clients
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own clients" ON clients
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own clients" ON clients
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own clients" ON clients
  FOR DELETE USING (auth.uid() = owner_id);

-- PolÃ­ticas para client_messages
CREATE POLICY "Users can view messages of their clients" ON client_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_messages.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages for their clients" ON client_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_messages.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- PolÃ­ticas para client_tasks
CREATE POLICY "Users can manage tasks of their clients" ON client_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_tasks.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- PolÃ­ticas para client_history
CREATE POLICY "Users can view history of their clients" ON client_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_history.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create history for their clients" ON client_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_history.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- Insertar datos de muestra
INSERT INTO clients (owner_id, name, email, company, phone, status, notes, industry, address) VALUES 
(auth.uid(), 'Sofia Rodriguez', 'sofia@techcorp.com', 'TechCorp Solutions', '+1-555-0123', 'active', 'CEO interesada en rebranding completo. Muy receptiva a ideas creativas.', 'Technology', '123 Main St, San Francisco, CA'),
(auth.uid(), 'Lucas Martinez', 'lucas@startup.io', 'StartupXYZ', '+1-555-0456', 'prospect', 'CTO tÃ©cnico, enfocado en escalabilidad y performance.', 'SaaS', '456 Innovation Ave, Austin, TX'),
(auth.uid(), 'Sarah Jenkins', 'sarah@boutique.co', 'Fashion Boutique', '+1-555-0789', 'active', 'DueÃ±a de boutique de moda. Necesita e-commerce moderno.', 'Fashion', '789 Style Blvd, New York, NY');

-- Mensajes de ejemplo
INSERT INTO client_messages (client_id, sender_type, sender_name, message, created_at) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), 'client', 'Sofia Rodriguez', 'Hola! Estoy muy interesada en un rebranding completo para TechCorp. Â¿Podemos agendar una llamada?', NOW() - INTERVAL '2 days'),
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), 'user', 'Eneas', 'Â¡Hola Sofia! Claro, me encantarÃ­a discutir tu proyecto. Â¿QuÃ© dÃ­a te vendrÃ­a bien?', NOW() - INTERVAL '1 day'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io' AND owner_id = auth.uid()), 'client', 'Lucas Martinez', 'Necesito ayuda con la arquitectura de nuestra API. Estamos creciendo rÃ¡pidamente.', NOW() - INTERVAL '3 days');

-- Tareas de ejemplo
INSERT INTO client_tasks (client_id, owner_id, title, description, priority, due_date) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), auth.uid(), 'Enviar propuesta de rebranding', 'Preparar y enviar propuesta detallada con timeline y presupuesto', 'high', NOW() + INTERVAL '3 days'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io' AND owner_id = auth.uid()), auth.uid(), 'Revisar documentaciÃ³n de API', 'Analizar la arquitectura actual y proponer mejoras', 'medium', NOW() + INTERVAL '5 days'),
((SELECT id FROM clients WHERE email = 'sarah@boutique.co' AND owner_id = auth.uid()), auth.uid(), 'DiseÃ±ar mockups de e-commerce', 'Crear 3 propuestas de diseÃ±o para la tienda online', 'high', NOW() + INTERVAL '2 days');

-- Historial de ejemplo
INSERT INTO client_history (client_id, user_id, user_name, action_type, action_description) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), auth.uid(), 'Eneas', 'call', 'Llamada inicial de 45 minutos - discutieron rebranding y objetivos'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io' AND owner_id = auth.uid()), auth.uid(), 'Eneas', 'meeting', 'ReuniÃ³n Zoom de 30 minutos - revisaron requisitos tÃ©cnicos'),
((SELECT id FROM clients WHERE email = 'sarah@boutique.co' AND owner_id = auth.uid()), auth.uid(), 'Eneas', 'email', 'EnviÃ³ portfolio de diseÃ±o y casos de Ã©xito en e-commerce');

-- VerificaciÃ³n final
SELECT 'âœ… Tablas creadas exitosamente!' as status;
SELECT 'âœ… RLS Policies aplicadas' as status;
SELECT 'âœ… Datos de muestra insertados' as status;
SELECT 'âœ… Sistema de clientes listo!' as status;

-- ============================================
-- FILE: 2025-12-28_create_documents_tables.sql
-- ============================================

-- ===================================
-- TABLAS PARA SISTEMA DE DOCUMENTOS
-- ===================================

-- 1. Tabla de carpetas
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#3b82f6',
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de archivos (metadatos)
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT, -- mime type
  size BIGINT, -- bytes
  url TEXT NOT NULL, -- storage path
  is_favorite BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ãndices
CREATE INDEX idx_folders_owner_id ON folders(owner_id);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_files_owner_id ON files(owner_id);
CREATE INDEX idx_files_folder_id ON files(folder_id);

-- RLS Policies
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas para folders
CREATE POLICY "Users can view their own folders" ON folders
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own folders" ON folders
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own folders" ON folders
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own folders" ON folders
  FOR DELETE USING (auth.uid() = owner_id);

-- PolÃ­ticas para files
CREATE POLICY "Users can view their own files" ON files
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own files" ON files
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own files" ON files
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own files" ON files
  FOR DELETE USING (auth.uid() = owner_id);

-- Insertar carpetas base
INSERT INTO folders (owner_id, name, color) VALUES 
(auth.uid(), 'Proyectos', '#3b82f6'),
(auth.uid(), 'Finanzas', '#10b981'),
(auth.uid(), 'Legal', '#f59e0b'),
(auth.uid(), 'Marketing', '#8b5cf6');

-- STORAGE BUCKET
-- Nota: Esto debe configurarse manualmente en el dashboard de Supabase si no se puede vÃ­a SQL
-- Bucket: 'documents'
-- Policy: Public false, Authenticated access only

INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'documents' AND auth.uid() = owner);

CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT TO authenticated 
USING (bucket_id = 'documents' AND auth.uid() = owner);

CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE TO authenticated 
USING (bucket_id = 'documents' AND auth.uid() = owner);

CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE TO authenticated 
USING (bucket_id = 'documents' AND auth.uid() = owner);

-- VerificaciÃ³n
SELECT 'âœ… Tablas de documentos creadas' as status;
SELECT 'âœ… RLS configurado' as status;
SELECT 'âœ… Bucket de storage configurado' as status;

-- ============================================
-- FILE: 2025-12-28_create_documents_tables_final.sql
-- ============================================

-- SQL para crear tablas de documentos - EJECUTAR EN SUPABASE
-- PASOS:
-- 1. Ve a https://app.supabase.com/project/azkhquxgekgfuplvwobe/sql
-- 2. Copia TODO este contenido
-- 3. Click en "RUN" (botÃ³n verde)

-- ===================================
-- TABLAS PARA SISTEMA DE DOCUMENTOS
-- ===================================

-- 1. Tabla de carpetas
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#3b82f6',
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de archivos (metadatos)
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT, -- mime type
  size BIGINT, -- bytes
  url TEXT NOT NULL, -- storage path
  is_favorite BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ãndices
CREATE INDEX idx_folders_owner_id ON folders(owner_id);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_files_owner_id ON files(owner_id);
CREATE INDEX idx_files_folder_id ON files(folder_id);

-- RLS Policies
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas para folders
CREATE POLICY "Users can view their own folders" ON folders
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own folders" ON folders
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own folders" ON folders
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own folders" ON folders
  FOR DELETE USING (auth.uid() = owner_id);

-- PolÃ­ticas para files
CREATE POLICY "Users can view their own files" ON files
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own files" ON files
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own files" ON files
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own files" ON files
  FOR DELETE USING (auth.uid() = owner_id);

-- Insertar carpetas base (ejemplo para usuario actual si estuviera autenticado)
-- INSERT INTO folders (owner_id, name, color) VALUES 
-- (auth.uid(), 'Proyectos', '#3b82f6'),
-- (auth.uid(), 'Finanzas', '#10b981'),
-- (auth.uid(), 'Legal', '#f59e0b'),
-- (auth.uid(), 'Marketing', '#8b5cf6');

-- STORAGE BUCKET
-- Nota: Esto debe configurarse manualmente en el dashboard de Supabase si no se puede vÃ­a SQL
-- Bucket: 'documents'
-- Policy: Public false, Authenticated access only

INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policies para Storage
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'documents' AND auth.uid() = owner);

CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT TO authenticated 
USING (bucket_id = 'documents' AND auth.uid() = owner);

CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE TO authenticated 
USING (bucket_id = 'documents' AND auth.uid() = owner);

CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE TO authenticated 
USING (bucket_id = 'documents' AND auth.uid() = owner);

SELECT 'âœ… Tablas de documentos creadas' as status;
SELECT 'âœ… RLS configurado' as status;
SELECT 'âœ… Bucket de storage configurado' as status;

-- ============================================
-- FILE: 2025-12-28_enable_rls.sql
-- ============================================

-- Add owner_id to all tables
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.web_analytics ADD COLUMN IF NOT EXISTS owner_id uuid;

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_analytics ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can CRUD their own rows
CREATE POLICY "projects_select_own" ON public.projects
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "projects_insert_own" ON public.projects
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "projects_update_own" ON public.projects
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "projects_delete_own" ON public.projects
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "ideas_select_own" ON public.ideas
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "ideas_insert_own" ON public.ideas
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "ideas_update_own" ON public.ideas
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "ideas_delete_own" ON public.ideas
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "leads_select_own" ON public.leads
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "leads_insert_own" ON public.leads
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "leads_update_own" ON public.leads
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "leads_delete_own" ON public.leads
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "activity_select_own" ON public.activity_logs
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "activity_insert_own" ON public.activity_logs
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "activity_update_block" ON public.activity_logs
  FOR UPDATE USING (false);
CREATE POLICY "activity_delete_own" ON public.activity_logs
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "analytics_select_own" ON public.web_analytics
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "analytics_insert_own" ON public.web_analytics
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "analytics_update_own" ON public.web_analytics
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "analytics_delete_own" ON public.web_analytics
  FOR DELETE USING (owner_id = auth.uid());

-- ============================================
-- FILE: 2025-12-28_team_sharing.sql
-- ============================================

-- Profiles table to look up users by email
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY,
  email text UNIQUE,
  name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- Allow all authenticated users to read profiles to enable sharing by email
CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Allow users to upsert their own profile
CREATE POLICY "profiles_upsert_self" ON public.profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

-- Project members table
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
-- Owners can manage members of their projects
CREATE POLICY "project_members_manage_by_owner" ON public.project_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  );
-- Members can read their membership entries
CREATE POLICY "project_members_read_self" ON public.project_members
  FOR SELECT USING (member_id = auth.uid());

-- Extend project policies to include memberships
DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
CREATE POLICY "projects_select_own_or_member" ON public.projects
  FOR SELECT USING (
    owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = id AND pm.member_id = auth.uid())
  );

DROP POLICY IF EXISTS "projects_update_own" ON public.projects;
CREATE POLICY "projects_update_own_or_member" ON public.projects
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = id AND pm.member_id = auth.uid())
  );


-- ============================================
-- FILE: 2025-12-29_data_rls.sql
-- ============================================

-- ==============================================================================
-- PROJECT MEMBERS & DATA RLS POLICIES
-- ==============================================================================

-- 1. PROJECT MEMBERS TABLE
-- Links users to projects for explicit access
CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- 'owner', 'member', 'viewer'
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- 2. ENABLE RLS ON DATA TABLES
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- 3. HELPER FUNCTIONS FOR PERMISSIONS
-- Function to check if user has a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = auth.uid()
    AND p.module = p_module
    AND p.action = p_action
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. POLICIES FOR PROJECTS

-- View Policy:
-- 1. Users with 'projects.view_all' can see ALL projects.
-- 2. Users with 'projects.view_assigned' can see projects they are members of.
CREATE POLICY "View Projects Policy" ON projects
FOR SELECT
USING (
  has_permission('projects', 'view_all') 
  OR 
  (has_permission('projects', 'view_assigned') AND EXISTS (
    SELECT 1 FROM project_members pm WHERE pm.project_id = id AND pm.user_id = auth.uid()
  ))
);

-- Edit Policy:
-- Users with 'projects.edit' AND (view_all OR is_member)
CREATE POLICY "Edit Projects Policy" ON projects
FOR UPDATE
USING (
  has_permission('projects', 'edit') 
  AND 
  (
    has_permission('projects', 'view_all') 
    OR 
    EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = id AND pm.user_id = auth.uid())
  )
);

-- Create Policy:
-- Users with 'projects.create'
CREATE POLICY "Create Projects Policy" ON projects
FOR INSERT
WITH CHECK (
  has_permission('projects', 'create')
);

-- 5. POLICIES FOR TASKS

-- View Policy:
-- Inherits project visibility. If you can see the project, you can see its tasks.
CREATE POLICY "View Tasks Policy" ON tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id
    -- The project query will be filtered by its own policy automatically? 
    -- NO, RLS in subqueries is tricky. Better to replicate logic or trust the join if RLS is enabled on projects.
    -- To be safe and performant, let's duplicate the logic slightly or rely on project_members.
  )
);

-- Optimization: Direct check for Tasks
-- 1. 'view_all' sees all tasks.
-- 2. 'view_assigned' sees tasks of assigned projects OR tasks assigned to them directly.
CREATE OR REPLACE POLICY "View Tasks Optimized" ON tasks
FOR SELECT
USING (
  has_permission('projects', 'view_all')
  OR
  (
    has_permission('projects', 'view_assigned') 
    AND 
    (
        EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_id AND pm.user_id = auth.uid())
        OR
        assignee_id = auth.uid()
    )
  )
);

-- 6. POLICIES FOR LEADS

-- View Policy:
-- Users with 'sales.view_leads'
CREATE POLICY "View Leads Policy" ON leads
FOR SELECT
USING (
  has_permission('sales', 'view_leads')
);

-- 7. SEED INITIAL PROJECT MEMBERS (Optional)
-- Add current user to all existing projects (for development)
INSERT INTO project_members (project_id, user_id, role)
SELECT p.id, u.id, 'owner'
FROM projects p, auth.users u
ON CONFLICT DO NOTHING;


-- ============================================
-- FILE: 2025-12-29_fix_calendar_schema.sql
-- ============================================

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

-- ============================================
-- FILE: 2025-12-29_invitations_trigger.sql
-- ============================================

-- ==============================================================================
-- INVITATION SYSTEM & AUTOMATIC ROLE ASSIGNMENT
-- ==============================================================================

-- 1. INVITATIONS TABLE
-- Stores pending invitations generated by admins
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  token UUID DEFAULT gen_random_uuid(), -- The secret token for the link
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Policies for Invitations
-- Admins/Owners can view and create invitations
-- Public (anonymous) needs to read specific invitation by token (for the accept page)
CREATE POLICY "Admins can manage invitations" ON invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND (r.name = 'owner' OR r.name = 'admin')
    )
  );

CREATE POLICY "Public can read invitations by token" ON invitations
  FOR SELECT
  USING (true); -- We filter by token in the query, so this is open but low risk if token is UUID

-- 2. AUTOMATIC USER SETUP TRIGGER
-- This trigger runs when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_invitation invitations%ROWTYPE;
  v_role_id UUID;
BEGIN
  -- 1. Check if there is a pending invitation for this email
  SELECT * INTO v_invitation
  FROM invitations
  WHERE email = NEW.email AND status = 'pending'
  LIMIT 1;

  -- 2. Create Profile (Always do this)
  INSERT INTO public.profiles (id, email, name, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'active'
  );

  -- 3. If invitation exists, assign role and mark accepted
  IF v_invitation.id IS NOT NULL THEN
    -- Assign Role
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_invitation.role_id);

    -- Update Invitation
    UPDATE public.invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = v_invitation.id;
  
  ELSE
    -- Optional: Assign default role (e.g., Viewer) if no invitation?
    -- For now, we leave them without role or assign a default 'viewer' if desired.
    -- Let's find 'viewer' role or fallback to nothing.
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'viewer' LIMIT 1;
    
    IF v_role_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role_id)
        VALUES (NEW.id, v_role_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. BIND TRIGGER TO AUTH.USERS
-- Drop if exists to avoid errors on re-run
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- FILE: 2025-12-29_rbac_system.sql
-- ============================================

-- ==============================================================================
-- RBAC SYSTEM MIGRATION (Roles, Permissions, Users, Services, Payments)
-- ==============================================================================

-- 1. PROFILES (Extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ROLES
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PERMISSIONS
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL, -- e.g., 'sales', 'crm', 'finance'
  action TEXT NOT NULL, -- e.g., 'view', 'edit', 'delete'
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(module, action)
);

-- 4. ROLE PERMISSIONS (Many-to-Many)
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- 5. USER ROLES (Many-to-Many)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- 6. SERVICES (Toggleable Modules)
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE, -- e.g., 'sales_module'
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  requires_role TEXT[], -- Array of role names that can access this
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. PAYMENT PROCESSORS
CREATE TABLE IF NOT EXISTS payment_processors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'primary' or 'secondary'
  config JSONB DEFAULT '{}', -- Store public keys, etc.
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_processors ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view all profiles (for team lists) but only edit their own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Roles/Permissions: Read-only for most, Write for Admins (simplified for now to public read)
CREATE POLICY "Roles are viewable by everyone" ON roles FOR SELECT USING (true);
CREATE POLICY "Permissions are viewable by everyone" ON permissions FOR SELECT USING (true);
CREATE POLICY "Role Permissions are viewable by everyone" ON role_permissions FOR SELECT USING (true);
CREATE POLICY "User Roles are viewable by everyone" ON user_roles FOR SELECT USING (true);

-- Services/Payments: Read-only for everyone, Write for Admins
CREATE POLICY "Services are viewable by everyone" ON services FOR SELECT USING (true);
CREATE POLICY "Payment Processors are viewable by everyone" ON payment_processors FOR SELECT USING (true);

-- ==============================================================================
-- SEED DATA
-- ==============================================================================

-- Roles
INSERT INTO roles (name, description, is_system) VALUES
('owner', 'Full access to everything', TRUE),
('admin', 'Administrator access', TRUE),
('manager', 'Team manager', TRUE),
('sales', 'Sales representative', TRUE),
('finance', 'Financial officer', TRUE),
('viewer', 'Read-only access', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Permissions (Sample)
INSERT INTO permissions (module, action, description) VALUES
('sales', 'view', 'View sales data'),
('sales', 'edit', 'Edit sales data'),
('crm', 'view', 'View CRM contacts'),
('crm', 'edit', 'Edit CRM contacts'),
('finance', 'view', 'View financial data'),
('finance', 'edit', 'Edit financial data'),
('projects', 'view_assigned', 'View assigned projects'),
('projects', 'view_all', 'View all projects'),
('team', 'view', 'View team members'),
('team', 'manage', 'Manage team members'),
('settings', 'view', 'View settings'),
('settings', 'manage', 'Manage settings')
ON CONFLICT (module, action) DO NOTHING;

-- Map Owner to All Permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'owner'
ON CONFLICT DO NOTHING;

-- Map Finance to Finance Permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'finance' AND p.module IN ('finance', 'settings')
ON CONFLICT DO NOTHING;

-- Map Sales to Sales/CRM Permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'sales' AND p.module IN ('sales', 'crm')
ON CONFLICT DO NOTHING;

-- Services
INSERT INTO services (key, name, description, requires_role) VALUES
('sales', 'Sales Module', 'Manage leads and sales pipeline', '{sales,owner,admin,manager}'),
('crm', 'CRM', 'Customer Relationship Management', '{sales,owner,admin,manager}'),
('finance', 'Finance Module', 'Financial reports and invoicing', '{finance,owner,admin}'),
('projects', 'Projects', 'Project management', '{owner,admin,manager,sales,viewer}')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- FILE: 2025-12-29_rpc_exec_sql.sql
-- ============================================

-- ==============================================================================
-- DANGEROUS: EXEC SQL FUNCTION
-- ONLY FOR DEVELOPMENT/REPAIR PURPOSES
-- Allows executing arbitrary SQL from the frontend to fix schema issues
-- ==============================================================================

CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- ============================================
-- FILE: 2025-12-29_seed_granular_permissions.sql
-- ============================================

-- ==============================================================================
-- SEED GRANULAR PERMISSIONS FOR FULL DASHBOARD CONTROL
-- ==============================================================================

INSERT INTO permissions (module, action, description) VALUES
-- Projects
('projects', 'view', 'Access to Projects module'),
('projects', 'create', 'Create new projects'),
('projects', 'edit', 'Edit projects'),
('projects', 'delete', 'Delete projects'),

-- Team / Clients
('team', 'view', 'Access to Team/Clients module'),
('team', 'invite', 'Invite new team members'),
('team', 'manage', 'Manage team roles and settings'),

-- Calendar
('calendar', 'view', 'Access to Calendar module'),
('calendar', 'manage', 'Create and edit calendar events'),

-- Activity
('activity', 'view', 'Access to Activity logs'),

-- Ideas
('ideas', 'view', 'Access to Ideas module'),
('ideas', 'create', 'Create new ideas'),

-- Documents
('documents', 'view', 'Access to Documents module'),
('documents', 'upload', 'Upload new documents'),

-- Sales (More granular)
('sales', 'view_dashboard', 'Access to Sales Dashboard'),
('sales', 'view_leads', 'Access to Leads Inbox'),
('sales', 'view_analytics', 'Access to Sales Analytics')

ON CONFLICT (module, action) DO UPDATE 
SET description = EXCLUDED.description;

-- Assign default 'view' permissions to Owner/Admin roles to ensure they don't lose access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE (r.name IN ('owner', 'admin'))
ON CONFLICT DO NOTHING;

-- ============================================
-- FILE: 2026-01-16_notifications_system.sql
-- ============================================

-- =============================================
-- NOTIFICATIONS SYSTEM
-- Phase 4: Unified Notification System
-- =============================================

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('lead', 'task', 'project', 'invite', 'system', 'activity')),
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can insert notifications for any user
CREATE POLICY "Service can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- =============================================
-- HELPER FUNCTION: Create notification
-- =============================================
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_metadata)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- =============================================
-- TRIGGER: Notify on new lead
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Get the owner (first admin user) - in production this would be more sophisticated
  SELECT id INTO v_owner_id FROM profiles WHERE status = 'active' LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    PERFORM create_notification(
      v_owner_id,
      'lead',
      'New Lead: ' || COALESCE(NEW.name, 'Unknown'),
      COALESCE(NEW.message, 'New lead received'),
      '/sales_leads',
      jsonb_build_object('lead_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Note: Only create trigger if leads table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    DROP TRIGGER IF EXISTS trigger_notify_new_lead ON leads;
    CREATE TRIGGER trigger_notify_new_lead
      AFTER INSERT ON leads
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_new_lead();
  END IF;
END $$;

-- =============================================
-- TRIGGER: Notify on task assignment
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only notify if assignee changed and is not null
  IF NEW.assignee_id IS NOT NULL AND (OLD.assignee_id IS NULL OR OLD.assignee_id != NEW.assignee_id) THEN
    PERFORM create_notification(
      NEW.assignee_id::UUID,
      'task',
      'Task Assigned: ' || COALESCE(NEW.title, 'New Task'),
      'You have been assigned a new task',
      '/calendar',
      jsonb_build_object('task_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Note: Only create trigger if tasks table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    DROP TRIGGER IF EXISTS trigger_notify_task_assignment ON tasks;
    CREATE TRIGGER trigger_notify_task_assignment
      AFTER UPDATE ON tasks
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_task_assignment();
  END IF;
END $$;

-- =============================================
-- TRIGGER: Notify on project invitation
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_project_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_title TEXT;
BEGIN
  -- Get project title
  SELECT title INTO v_project_title FROM projects WHERE id = NEW.project_id;
  
  PERFORM create_notification(
    NEW.member_id,
    'project',
    'Project Invitation',
    'You have been added to project: ' || COALESCE(v_project_title, 'Unknown'),
    '/projects',
    jsonb_build_object('project_id', NEW.project_id)
  );
  
  RETURN NEW;
END;
$$;

-- Note: Only create trigger if project_members table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_members') THEN
    DROP TRIGGER IF EXISTS trigger_notify_project_invite ON project_members;
    CREATE TRIGGER trigger_notify_project_invite
      AFTER INSERT ON project_members
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_project_invite();
  END IF;
END $$;

-- ============================================
-- FILE: 2026-01-16_whitelabel_tenant.sql
-- ============================================

-- =============================================
-- WHITE-LABEL / MULTI-TENANT INFRASTRUCTURE
-- Phase 5: White-Label Configuration
-- =============================================

-- Tenants table for multi-tenant support
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant configuration table
CREATE TABLE IF NOT EXISTS tenant_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Branding stored as JSONB for flexibility
  branding JSONB DEFAULT '{
    "name": "My App",
    "logoUrl": null,
    "faviconUrl": null,
    "primaryColor": "#6366f1",
    "secondaryColor": "#8b5cf6",
    "accentColor": "#ec4899",
    "gradientFrom": "#6366f1",
    "gradientTo": "#8b5cf6",
    "features": {
      "salesModule": true,
      "teamManagement": true,
      "clientPortal": true,
      "notifications": true,
      "aiAssistant": true
    }
  }'::jsonb,
  
  -- Feature toggles (also in branding JSON, but here for quick queries)
  sales_enabled BOOLEAN DEFAULT TRUE,
  team_enabled BOOLEAN DEFAULT TRUE,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  
  -- Limits
  max_users INTEGER DEFAULT 10,
  max_projects INTEGER DEFAULT 50,
  max_storage_mb INTEGER DEFAULT 5000,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id)
);

-- Add tenant_id to profiles for multi-tenant support
-- Only add if column doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenants
DROP POLICY IF EXISTS "Tenant owners can view their tenant" ON tenants;
CREATE POLICY "Tenant owners can view their tenant"
  ON tenants FOR SELECT
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Tenant owners can update their tenant" ON tenants;
CREATE POLICY "Tenant owners can update their tenant"
  ON tenants FOR UPDATE
  USING (owner_id = auth.uid());

-- RLS Policies for tenant_config
DROP POLICY IF EXISTS "Users can view their tenant config" ON tenant_config;
CREATE POLICY "Users can view their tenant config"
  ON tenant_config FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant owners can update config" ON tenant_config;
CREATE POLICY "Tenant owners can update config"
  ON tenant_config FOR UPDATE
  USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE owner_id = auth.uid()
    )
  );

-- Function to get current user's tenant branding
CREATE OR REPLACE FUNCTION get_tenant_branding()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_branding JSONB;
BEGIN
  -- Get user's tenant_id
  SELECT tenant_id INTO v_tenant_id
  FROM profiles
  WHERE id = auth.uid();
  
  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get tenant branding
  SELECT branding INTO v_branding
  FROM tenant_config
  WHERE tenant_id = v_tenant_id;
  
  RETURN v_branding;
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tenant_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_tenant_updated
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_timestamp();

CREATE TRIGGER trigger_tenant_config_updated
  BEFORE UPDATE ON tenant_config
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_timestamp();

-- Helper function to create a tenant with default config
CREATE OR REPLACE FUNCTION create_tenant_with_config(
  p_name TEXT,
  p_slug TEXT,
  p_owner_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Create tenant
  INSERT INTO tenants (name, slug, owner_id)
  VALUES (p_name, p_slug, COALESCE(p_owner_id, auth.uid()))
  RETURNING id INTO v_tenant_id;
  
  -- Create default config
  INSERT INTO tenant_config (tenant_id)
  VALUES (v_tenant_id);
  
  -- Link owner profile to tenant
  UPDATE profiles
  SET tenant_id = v_tenant_id
  WHERE id = COALESCE(p_owner_id, auth.uid());
  
  RETURN v_tenant_id;
END;
$$;

-- ============================================
-- FILE: 2026-01-18_fix_crm_schema.sql
-- ============================================

-- Fix CRM Schema Issues

-- 1. Create web_analytics table
CREATE TABLE IF NOT EXISTS web_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_visits INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  bounce_rate NUMERIC DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  top_pages JSONB DEFAULT '[]'::jsonb,
  daily_visits JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE web_analytics ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow read access to authenticated users" ON web_analytics
  FOR SELECT TO authenticated USING (true);

-- Initialize default analytics data if empty
INSERT INTO web_analytics (total_visits, unique_visitors, bounce_rate, conversions, top_pages, daily_visits)
SELECT 
  12543, 
  8432, 
  42.5, 
  356,
  '[{"path": "/home", "views": 5432}, {"path": "/pricing", "views": 2100}, {"path": "/blog", "views": 1500}]'::jsonb,
  '[{"date": "2024-01-01", "value": 120}, {"date": "2024-01-02", "value": 132}, {"date": "2024-01-03", "value": 101}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM web_analytics);

-- 2. Add 'name' to profiles if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN name TEXT;
  END IF;
END $$;

-- 3. Ensure leads table has correct columns for CRM
-- Make sure ai_analysis exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'ai_analysis'
  ) THEN
    ALTER TABLE leads ADD COLUMN ai_analysis JSONB;
  END IF;
END $$;

-- 4. Create proper RLS for leads if not valid
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON leads;
CREATE POLICY "Enable read access for authenticated users" ON leads
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON leads;
CREATE POLICY "Enable insert access for authenticated users" ON leads
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update access for authenticated users" ON leads;
CREATE POLICY "Enable update access for authenticated users" ON leads
  FOR UPDATE TO authenticated USING (true);

-- ============================================
-- FILE: 2026-01-18_fix_missing_tables.sql
-- ============================================

-- IMPROVED SCRIPTS: Handles existing tables by adding columns safely

-- 1. CLIENTS
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure columns exist (idempotent)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their clients" ON clients;
CREATE POLICY "Users can manage their clients" ON clients
    FOR ALL USING (auth.uid() = owner_id);


-- 2. CALENDAR_TASKS
CREATE TABLE IF NOT EXISTS calendar_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Medium';
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS duration INTEGER;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES auth.users(id);
ALTER TABLE calendar_tasks ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

ALTER TABLE calendar_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tasks" ON calendar_tasks;
CREATE POLICY "Users can view own tasks" ON calendar_tasks
    FOR SELECT USING (auth.uid() = owner_id OR auth.uid() = assignee_id);

DROP POLICY IF EXISTS "Users can insert own tasks" ON calendar_tasks;
CREATE POLICY "Users can insert own tasks" ON calendar_tasks
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own tasks" ON calendar_tasks;
CREATE POLICY "Users can update own tasks" ON calendar_tasks
    FOR UPDATE USING (auth.uid() = owner_id OR auth.uid() = assignee_id);

DROP POLICY IF EXISTS "Users can delete own tasks" ON calendar_tasks;
CREATE POLICY "Users can delete own tasks" ON calendar_tasks
    FOR DELETE USING (auth.uid() = owner_id);


-- 3. CALENDAR_LABELS
CREATE TABLE IF NOT EXISTS calendar_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE calendar_labels ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE calendar_labels ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE calendar_labels ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

ALTER TABLE calendar_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage labels" ON calendar_labels;
CREATE POLICY "Users can manage labels" ON calendar_labels
    FOR ALL USING (auth.uid() = owner_id);


-- 4. PROJECTS
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage projects" ON projects;
CREATE POLICY "Users can manage projects" ON projects
    FOR ALL USING (auth.uid() = owner_id);

-- 5. RELOAD
NOTIFY pgrst, 'reload config';

-- ============================================
-- FILE: 2026-01-18_force_fix_crm.sql
-- ============================================

-- 1. Asegurar que las columnas existan (Idempotente)
-- Esto no fallarÃ¡ si ya existen via 'IF NOT EXISTS'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'Web';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- 2. Asegurar policies para evitar bloqueos de RLS (solo si no existen, esto es mas complejo en SQL puro sin funciones, pero aseguramos las basicas)
-- Si ya corriste el script anterior, esto ya esta hecho.

-- 3. IMPORTANTE: Recargar el cachÃ© de PostgREST
-- Esto obliga a la API a "darse cuenta" de que existen las nuevas columnas
NOTIFY pgrst, 'reload config';

-- 4. Insertar un lead de prueba para ver algo en el tablero (opcional)
-- Usamos un DO block para insertar solo si la tabla lo permite
DO $$
BEGIN
    INSERT INTO leads (name, email, message, status, origin)
    VALUES ('System Check', 'system@livv.systems', 'Lead de prueba generado por script', 'new', 'System');
EXCEPTION WHEN others THEN
    -- Si falla por owner_id o permisos, lo ignoramos, lo importante son las columnas
    RAISE NOTICE 'No se pudo insertar lead de prueba, pero las columnas deberÃ­an estar listas.';
END $$;

-- ============================================
-- FILE: 2026-01-19_create_activity_logs.sql
-- ============================================

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name TEXT DEFAULT 'System',
    user_avatar TEXT DEFAULT 'SYS',
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    project_title TEXT,
    type TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    owner_id UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy for reading (users can read only their own logs or logs where they are owner - assuming logs are personal or team based)
-- For now, let's assume team-wide visibility or owner-based. Given the context (Projects/Team), maybe shared?
-- But secure default: owner only.
DROP POLICY IF EXISTS "Users can view logs" ON activity_logs;
CREATE POLICY "Users can view logs" ON activity_logs
    FOR SELECT USING (auth.uid() = owner_id);

-- Policy for inserting (anyone can insert, usually the system on behalf of user)
DROP POLICY IF EXISTS "Users can insert logs" ON activity_logs;
CREATE POLICY "Users can insert logs" ON activity_logs
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Reload schema
NOTIFY pgrst, 'reload config';

-- ============================================
-- FILE: 2026-01-20_comprehensive_rls_policies.sql
-- ============================================

-- ==============================================================================
-- COMPREHENSIVE ROW-LEVEL SECURITY POLICIES FOR ENEAS-OS
-- Migration Date: 2026-01-20
-- Purpose: Implement tenant isolation and role-based access control
-- ==============================================================================

-- Create a comprehensive security framework with proper tenant isolation
-- and role-based access control for all domain tables.

-- 1. SECURITY HELPER FUNCTIONS
-- ==============================================================================

-- Function to get current user's tenant
CREATE OR REPLACE FUNCTION current_user_tenant()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id 
    FROM profiles 
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is tenant owner
CREATE OR REPLACE FUNCTION is_tenant_owner(p_tenant_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  v_tenant_id UUID := COALESCE(p_tenant_id, current_user_tenant());
  v_user_tenant UUID;
  v_tenant_owner_id UUID;
BEGIN
  -- Get user's tenant and tenant owner
  SELECT tenant_id INTO v_user_tenant
  FROM profiles 
  WHERE user_id = auth.uid();
  
  SELECT owner_id INTO v_tenant_owner_id
  FROM tenants 
  WHERE id = v_tenant_id;
  
  RETURN v_user_tenant = v_tenant_id 
         AND auth.uid() = v_tenant_owner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION has_permission(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = auth.uid()
    AND p.module = p_module
    AND p.action = p_action
  ) OR is_tenant_owner(); -- Owners have all permissions
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access tenant data
CREATE OR REPLACE FUNCTION can_access_tenant(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_user_tenant() = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's roles for RLS checks
CREATE OR REPLACE FUNCTION get_user_roles()
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT r.name 
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. SECURITY CONTEXTS
-- ==============================================================================

-- Create a security context for tenant-based filtering
CREATE OR REPLACE FUNCTION tenant_security_context()
RETURNS TABLE (
  user_id UUID,
  tenant_id UUID,
  is_owner BOOLEAN,
  user_roles TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    auth.uid() as user_id,
    current_user_tenant() as tenant_id,
    is_tenant_owner() as is_owner,
    get_user_roles() as user_roles;
END;
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. CORE BUSINESS TABLES RLS POLICIES
-- ==============================================================================

-- PROJECTS TABLE
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Ensure projects has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
  END IF;
END
$$;

-- Add owner_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN owner_id UUID REFERENCES profiles(id);
    CREATE INDEX idx_projects_owner_id ON projects(owner_id);
  END IF;
END
$$;

-- Projects: SELECT Policy
CREATE POLICY "projects_select_policy" ON projects
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('projects', 'view_all') OR
    has_permission('projects', 'view_assigned') AND (
      owner_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM project_members pm 
        WHERE pm.project_id = projects.id AND pm.user_id = auth.uid()
      )
    )
  )
);

-- Projects: INSERT Policy
CREATE POLICY "projects_insert_policy" ON projects
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'create') AND
  owner_id = auth.uid()
);

-- Projects: UPDATE Policy
CREATE POLICY "projects_update_policy" ON projects
FOR UPDATE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit') AND (
    owner_id = auth.uid() OR
    has_permission('projects', 'edit_all')
  )
)
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit')
);

-- Projects: DELETE Policy
CREATE POLICY "projects_delete_policy" ON projects
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'delete') AND (
    owner_id = auth.uid() OR
    has_permission('projects', 'delete_all')
  )
);

-- TASKS TABLE
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Ensure tasks has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tasks' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_tasks_tenant_id ON tasks(tenant_id);
  END IF;
END
$$;

-- Tasks: SELECT Policy
CREATE POLICY "tasks_select_policy" ON tasks
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('projects', 'view_all') OR
    has_permission('projects', 'view_assigned') AND (
      assignee_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = tasks.project_id AND p.tenant_id = tasks.tenant_id
        AND (
          p.owner_id = auth.uid() OR
          EXISTS (
            SELECT 1 FROM project_members pm 
            WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
          )
        )
      )
    )
  )
);

-- Tasks: INSERT Policy
CREATE POLICY "tasks_insert_policy" ON tasks
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit') AND
  (assignee_id = auth.uid() OR assignee_id IS NULL)
);

-- Tasks: UPDATE Policy
CREATE POLICY "tasks_update_policy" ON tasks
FOR UPDATE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit') AND (
    assignee_id = auth.uid() OR
    has_permission('projects', 'edit_all')
  )
);

-- Tasks: DELETE Policy
CREATE POLICY "tasks_delete_policy" ON tasks
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'delete') AND (
    assignee_id = auth.uid() OR
    has_permission('projects', 'delete_all')
  )
);

-- MILESTONES TABLE
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

-- Ensure milestones has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'milestones' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE milestones ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_milestones_tenant_id ON milestones(tenant_id);
  END IF;
END
$$;

-- Milestones: SELECT Policy
CREATE POLICY "milestones_select_policy" ON milestones
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'view_all')
);

-- Milestones: INSERT/UPDATE/DELETE Policies
CREATE POLICY "milestones_modify_policy" ON milestones
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit')
)
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit')
);

-- ACTIVITIES TABLE
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Ensure activities has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE activities ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_activities_tenant_id ON activities(tenant_id);
  END IF;
END
$$;

-- Activities: SELECT Policy
CREATE POLICY "activities_select_policy" ON activities
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'view_all')
);

-- Activities: INSERT Policy
CREATE POLICY "activities_insert_policy" ON activities
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  user_id = auth.uid() -- Users can only log activities for themselves
);

-- Activities: UPDATE/DELETE Policies (restrictive - activities should be immutable)
CREATE POLICY "activities_immutable_policy" ON activities
FOR UPDATE
USING (false); -- Activities are immutable

CREATE POLICY "activities_delete_policy" ON activities
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('system', 'admin') -- Only system admins can delete
);

-- 4. CRM/LEADS TABLES RLS POLICIES
-- ==============================================================================

-- LEADS TABLE
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Ensure leads has tenant_id and owner_id columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN owner_id UUID REFERENCES profiles(id);
    CREATE INDEX idx_leads_owner_id ON leads(owner_id);
  END IF;
END
$$;

-- Leads: SELECT Policy
CREATE POLICY "leads_select_policy" ON leads
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('sales', 'view_all') OR
    has_permission('sales', 'view_assigned') AND owner_id = auth.uid()
  )
);

-- Leads: INSERT Policy
CREATE POLICY "leads_insert_policy" ON leads
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'create') AND
  owner_id = auth.uid()
);

-- Leads: UPDATE Policy
CREATE POLICY "leads_update_policy" ON leads
FOR UPDATE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND (
    owner_id = auth.uid() OR
    has_permission('sales', 'edit_all')
  )
);

-- Leads: DELETE Policy
CREATE POLICY "leads_delete_policy" ON leads
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'delete') AND (
    owner_id = auth.uid() OR
    has_permission('sales', 'delete_all')
  )
);

-- CLIENTS TABLE
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Ensure clients has tenant_id and owner_id columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE clients ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_clients_tenant_id ON clients(tenant_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE clients ADD COLUMN owner_id UUID REFERENCES profiles(id);
    CREATE INDEX idx_clients_owner_id ON clients(owner_id);
  END IF;
END
$$;

-- Clients: SELECT Policy
CREATE POLICY "clients_select_policy" ON clients
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('sales', 'view_all') OR
    has_permission('sales', 'view_assigned') AND owner_id = auth.uid()
  )
);

-- Clients: INSERT/UPDATE/DELETE Policies
CREATE POLICY "clients_modify_policy" ON clients
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND (
    owner_id = auth.uid() OR
    has_permission('sales', 'edit_all')
  )
)
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND
  owner_id = auth.uid()
);

-- CLIENT_MESSAGES TABLE
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

-- Client Messages: SELECT Policy
CREATE POLICY "client_messages_select_policy" ON client_messages
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'view_all')
);

-- Client Messages: INSERT Policy
CREATE POLICY "client_messages_insert_policy" ON client_messages
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND
  created_by = auth.uid()
);

-- CLIENT_TASKS TABLE
ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;

-- Client Tasks: SELECT Policy
CREATE POLICY "client_tasks_select_policy" ON client_tasks
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('sales', 'view_all') OR
    assigned_to = auth.uid()
  )
);

-- Client Tasks: INSERT/UPDATE/DELETE Policies
CREATE POLICY "client_tasks_modify_policy" ON client_tasks
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND (
    assigned_to = auth.uid() OR
    has_permission('sales', 'edit_all')
  )
);

-- CLIENT_HISTORY TABLE
ALTER TABLE client_history ENABLE ROW LEVEL SECURITY;

-- Client History: SELECT Policy
CREATE POLICY "client_history_select_policy" ON client_history
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'view_all')
);

-- Client History: INSERT Policy
CREATE POLICY "client_history_insert_policy" ON client_history
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND
  created_by = auth.uid()
);

-- Client History: UPDATE/DELETE Policies (immutable)
CREATE POLICY "client_history_immutable_policy" ON client_history
FOR UPDATE
USING (false);

CREATE POLICY "client_history_delete_policy" ON client_history
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('system', 'admin')
);

-- 5. DOCUMENTS TABLES RLS POLICIES
-- ==============================================================================

-- DOCUMENTS TABLE
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Ensure documents has tenant_id and owner_id columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE documents ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);
  END IF;
END
$$;

-- Documents: SELECT Policy
CREATE POLICY "documents_select_policy" ON documents
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('documents', 'view_all') OR
    has_permission('documents', 'view_own') AND owner_id = auth.uid()
  )
);

-- Documents: INSERT Policy
CREATE POLICY "documents_insert_policy" ON documents
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('documents', 'create') AND
  owner_id = auth.uid()
);

-- Documents: UPDATE Policy
CREATE POLICY "documents_update_policy" ON documents
FOR UPDATE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('documents', 'edit') AND (
    owner_id = auth.uid() OR
    has_permission('documents', 'edit_all')
  )
);

-- Documents: DELETE Policy
CREATE POLICY "documents_delete_policy" ON documents
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('documents', 'delete') AND (
    owner_id = auth.uid() OR
    has_permission('documents', 'delete_all')
  )
);

-- 6. CALENDAR TABLES RLS POLICIES
-- ==============================================================================

-- CALENDAR_EVENTS TABLE
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Ensure calendar_events has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_calendar_events_tenant_id ON calendar_events(tenant_id);
  END IF;
END
$$;

-- Calendar Events: SELECT Policy
CREATE POLICY "calendar_events_select_policy" ON calendar_events
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('calendar', 'view_all') OR
    has_permission('calendar', 'view_own') AND created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM event_attendees ea 
      WHERE ea.event_id = calendar_events.id AND ea.user_id = auth.uid()
    )
  )
);

-- Calendar Events: INSERT Policy
CREATE POLICY "calendar_events_insert_policy" ON calendar_events
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'create') AND
  created_by = auth.uid()
);

-- Calendar Events: UPDATE Policy
CREATE POLICY "calendar_events_update_policy" ON calendar_events
FOR UPDATE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'edit') AND (
    created_by = auth.uid() OR
    has_permission('calendar', 'edit_all')
  )
);

-- Calendar Events: DELETE Policy
CREATE POLICY "calendar_events_delete_policy" ON calendar_events
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'delete') AND (
    created_by = auth.uid() OR
    has_permission('calendar', 'delete_all')
  )
);

-- CALENDAR_TASKS TABLE
ALTER TABLE calendar_tasks ENABLE ROW LEVEL SECURITY;

-- Calendar Tasks: SELECT Policy
CREATE POLICY "calendar_tasks_select_policy" ON calendar_tasks
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('calendar', 'view_all') OR
    assigned_to = auth.uid()
  )
);

-- Calendar Tasks: INSERT/UPDATE/DELETE Policies
CREATE POLICY "calendar_tasks_modify_policy" ON calendar_tasks
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'edit') AND (
    assigned_to = auth.uid() OR
    has_permission('calendar', 'edit_all')
  )
);

-- EVENT_ATTENDEES TABLE
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;

-- Event Attendees: SELECT Policy
CREATE POLICY "event_attendees_select_policy" ON event_attendees
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('calendar', 'view_all') OR
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM calendar_events ce 
      WHERE ce.id = event_attendees.event_id AND ce.created_by = auth.uid()
    )
  )
);

-- Event Attendees: INSERT Policy
CREATE POLICY "event_attendees_insert_policy" ON event_attendees
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'edit') AND (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM calendar_events ce 
      WHERE ce.id = event_attendees.event_id AND ce.created_by = auth.uid()
    )
  )
);

-- Event Attendees: UPDATE/DELETE Policies
CREATE POLICY "event_attendees_modify_policy" ON event_attendees
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'edit') AND
  (user_id = auth.uid() OR has_permission('calendar', 'edit_all'))
);

-- CALENDAR_REMINDERS TABLE
ALTER TABLE calendar_reminders ENABLE ROW LEVEL SECURITY;

-- Calendar Reminders: SELECT Policy
CREATE POLICY "calendar_reminders_select_policy" ON calendar_reminders
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('calendar', 'view_all') OR
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM calendar_events ce 
      WHERE ce.id = calendar_reminders.event_id AND ce.created_by = auth.uid()
    )
  )
);

-- Calendar Reminders: INSERT/UPDATE/DELETE Policies
CREATE POLICY "calendar_reminders_modify_policy" ON calendar_reminders
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'edit') AND (
    user_id = auth.uid() OR
    has_permission('calendar', 'edit_all')
  )
);

-- 7. FINANCIAL TABLES RLS POLICIES
-- ==============================================================================

-- FINANCES TABLE (canonical financial table)
ALTER TABLE finances ENABLE ROW LEVEL SECURITY;

-- Ensure finances has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'finances' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE finances ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_finances_tenant_id ON finances(tenant_id);
  END IF;
END
$$;

-- Finances: SELECT Policy
CREATE POLICY "finances_select_policy" ON finances
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('finance', 'view')
);

-- Finances: INSERT/UPDATE/DELETE Policies
CREATE POLICY "finances_modify_policy" ON finances
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('finance', 'edit')
);

-- PROJECT_CREDENTIALS TABLE
ALTER TABLE project_credentials ENABLE ROW LEVEL SECURITY;

-- Project Credentials: SELECT Policy
CREATE POLICY "project_credentials_select_policy" ON project_credentials
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'view_all')
);

-- Project Credentials: INSERT/UPDATE/DELETE Policies
CREATE POLICY "project_credentials_modify_policy" ON project_credentials
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'manage_credentials')
);

-- 8. SECURITY/AUTH TABLES RLS POLICIES
-- ==============================================================================

-- PROFILES TABLE
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: SELECT Policy
CREATE POLICY "profiles_select_policy" ON profiles
FOR SELECT
USING (
  -- Users can always view their own profile
  user_id = auth.uid() OR
  -- Users with permission can view all profiles in their tenant
  (has_permission('team', 'view_all') AND tenant_id = current_user_tenant()) OR
  -- Anyone can view basic profile info for project/task assignments
  (
    SELECT 1 FROM projects p WHERE p.owner_id = profiles.user_id AND p.tenant_id = current_user_tenant()
    LIMIT 1
  ) OR
  (
    SELECT 1 FROM tasks t WHERE t.assignee_id = profiles.user_id AND t.tenant_id = current_user_tenant()
    LIMIT 1
  )
);

-- Profiles: UPDATE Policy
CREATE POLICY "profiles_update_policy" ON profiles
FOR UPDATE
USING (
  -- Users can update their own profile
  user_id = auth.uid() OR
  -- Team managers can update profiles in their tenant
  (has_permission('team', 'edit_members') AND tenant_id = current_user_tenant())
);

-- Profiles: DELETE Policy
CREATE POLICY "profiles_delete_policy" ON profiles
FOR DELETE
USING (
  -- Only tenant owners can delete profiles
  is_tenant_owner(tenant_id)
);

-- USER_ROLES TABLE
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- User Roles: SELECT Policy
CREATE POLICY "user_roles_select_policy" ON user_roles
FOR SELECT
USING (
  -- Users can view their own roles
  user_id = auth.uid() OR
  -- Team managers can view roles in their tenant
  (
    has_permission('team', 'view_all') AND
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = user_roles.user_id AND p.tenant_id = current_user_tenant()
    )
  )
);

-- User Roles: INSERT/DELETE Policies
CREATE POLICY "user_roles_modify_policy" ON user_roles
FOR ALL
USING (
  -- Team managers can manage roles in their tenant
  has_permission('team', 'manage_roles') AND
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = user_roles.user_id AND p.tenant_id = current_user_tenant()
  )
);

-- ROLES TABLE
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Roles: SELECT Policy
CREATE POLICY "roles_select_policy" ON roles
FOR SELECT
USING (
  -- Everyone can view non-system roles in their tenant
  (is_system = false AND tenant_id = current_user_tenant()) OR
  -- Users with team permissions can view all roles
  has_permission('team', 'view_all') OR
  -- System roles are visible to everyone (read-only)
  is_system = true
);

-- Roles: INSERT/UPDATE/DELETE Policies
CREATE POLICY "roles_modify_policy" ON roles
FOR ALL
USING (
  -- Only team managers can modify non-system roles
  has_permission('team', 'manage_roles') AND
  is_system = false AND
  tenant_id = current_user_tenant()
);

-- PERMISSIONS TABLE
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Permissions: SELECT Policy (permissions are global, not tenant-scoped)
CREATE POLICY "permissions_select_policy" ON permissions
FOR SELECT
USING (true);

-- Permissions: INSERT/UPDATE/DELETE Policies (system admin only)
CREATE POLICY "permissions_modify_policy" ON permissions
FOR ALL
USING (has_permission('system', 'admin'));

-- ROLE_PERMISSIONS TABLE
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Role Permissions: SELECT Policy
CREATE POLICY "role_permissions_select_policy" ON role_permissions
FOR SELECT
USING (
  -- Users can view permissions for their own roles
  EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.role_id = role_permissions.role_id AND ur.user_id = auth.uid()
  ) OR
  -- Team managers can view all role permissions in their tenant
  has_permission('team', 'view_all')
);

-- Role Permissions: INSERT/UPDATE/DELETE Policies
CREATE POLICY "role_permissions_modify_policy" ON role_permissions
FOR ALL
USING (
  has_permission('team', 'manage_roles') AND
  EXISTS (
    SELECT 1 FROM roles r 
    WHERE r.id = role_permissions.role_id AND 
          (r.tenant_id = current_user_tenant() OR r.is_system = true)
  )
);

-- NOTIFICATIONS TABLE
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Notifications: SELECT Policy
CREATE POLICY "notifications_select_policy" ON notifications
FOR SELECT
USING (
  -- Users can only view their own notifications
  user_id = auth.uid()
);

-- Notifications: INSERT Policy
CREATE POLICY "notifications_insert_policy" ON notifications
FOR INSERT
WITH CHECK (
  -- Users can only create notifications for themselves
  user_id = auth.uid() OR
  -- System can create notifications for users
  has_permission('system', 'admin')
);

-- Notifications: UPDATE Policy
CREATE POLICY "notifications_update_policy" ON notifications
FOR UPDATE
USING (
  -- Users can only update their own notifications (mark as read)
  user_id = auth.uid()
);

-- Notifications: DELETE Policy
CREATE POLICY "notifications_delete_policy" ON notifications
FOR DELETE
USING (
  -- Users can only delete their own notifications
  user_id = auth.uid()
);

-- MESSAGES TABLE
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Messages: SELECT Policy
CREATE POLICY "messages_select_policy" ON messages
FOR SELECT
USING (
  -- Users can view messages they sent or received
  from_user_id = auth.uid() OR
  to_user_id = auth.uid() OR
  -- Team managers can view all messages in their tenant
  (has_permission('team', 'view_all') AND tenant_id = current_user_tenant())
);

-- Messages: INSERT Policy
CREATE POLICY "messages_insert_policy" ON messages
FOR INSERT
WITH CHECK (
  -- Users can only send messages as themselves
  from_user_id = auth.uid() AND
  tenant_id = current_user_tenant()
);

-- Messages: UPDATE/DELETE Policies (messages should be immutable)
CREATE POLICY "messages_immutable_policy" ON messages
FOR UPDATE
USING (false);

CREATE POLICY "messages_delete_policy" ON messages
FOR DELETE
USING (
  -- Only senders can delete their own messages
  from_user_id = auth.uid()
);

-- QUICK_HITS TABLE
ALTER TABLE quick_hits ENABLE ROW LEVEL SECURITY;

-- Quick Hits: SELECT Policy
CREATE POLICY "quick_hits_select_policy" ON quick_hits
FOR SELECT
USING (
  -- Users can view their own quick hits
  assigned_to = auth.uid() OR
  -- Team managers can view all quick hits in their tenant
  (has_permission('team', 'view_all') AND tenant_id = current_user_tenant())
);

-- Quick Hits: INSERT/UPDATE/DELETE Policies
CREATE POLICY "quick_hits_modify_policy" ON quick_hits
FOR ALL
USING (
  -- Users can manage their own quick hits
  assigned_to = auth.uid() OR
  -- Team managers can manage all quick hits in their tenant
  (has_permission('team', 'manage_tasks') AND tenant_id = current_user_tenant())
)
WITH CHECK (
  tenant_id = current_user_tenant()
);

-- 9. CONFIGURATION TABLES RLS POLICIES
-- ==============================================================================

-- TENANTS TABLE
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Tenants: SELECT Policy
CREATE POLICY "tenants_select_policy" ON tenants
FOR SELECT
USING (
  -- Users can view their own tenant
  id = current_user_tenant() OR
  -- System admins can view all tenants
  has_permission('system', 'admin')
);

-- Tenants: INSERT Policy
CREATE POLICY "tenants_insert_policy" ON tenants
FOR INSERT
WITH CHECK (
  -- Only system admins can create tenants
  has_permission('system', 'admin') AND
  owner_id = auth.uid()
);

-- Tenants: UPDATE Policy
CREATE POLICY "tenants_update_policy" ON tenants
FOR UPDATE
USING (
  -- Tenant owners can update their tenant
  owner_id = auth.uid() OR
  -- System admins can update any tenant
  has_permission('system', 'admin')
);

-- Tenants: DELETE Policy
CREATE POLICY "tenants_delete_policy" ON tenants
FOR DELETE
USING (
  -- Only system admins can delete tenants
  has_permission('system', 'admin')
);

-- TENANT_CONFIG TABLE
ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;

-- Tenant Config: SELECT Policy
CREATE POLICY "tenant_config_select_policy" ON tenant_config
FOR SELECT
USING (
  -- Users can view their own tenant config
  tenant_id = current_user_tenant() OR
  -- System admins can view all tenant configs
  has_permission('system', 'admin')
);

-- Tenant Config: INSERT/UPDATE/DELETE Policies
CREATE POLICY "tenant_config_modify_policy" ON tenant_config
FOR ALL
USING (
  -- Tenant owners can manage their config
  EXISTS (
    SELECT 1 FROM tenants t 
    WHERE t.id = tenant_config.tenant_id AND t.owner_id = auth.uid()
  ) OR
  -- System admins can manage any tenant config
  has_permission('system', 'admin')
);

-- WEB_ANALYTICS TABLE
ALTER TABLE web_analytics ENABLE ROW LEVEL SECURITY;

-- Ensure web_analytics has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'web_analytics' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE web_analytics ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_web_analytics_tenant_id ON web_analytics(tenant_id);
  END IF;
END
$$;

-- Web Analytics: SELECT Policy
CREATE POLICY "web_analytics_select_policy" ON web_analytics
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('analytics', 'view')
);

-- Web Analytics: INSERT/UPDATE/DELETE Policies
CREATE POLICY "web_analytics_modify_policy" ON web_analytics
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('analytics', 'edit')
);

-- ANALYTICS_METRICS TABLE
ALTER TABLE analytics_metrics ENABLE ROW LEVEL SECURITY;

-- Analytics Metrics: SELECT Policy
CREATE POLICY "analytics_metrics_select_policy" ON analytics_metrics
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('analytics', 'view')
);

-- Analytics Metrics: INSERT/UPDATE/DELETE Policies
CREATE POLICY "analytics_metrics_modify_policy" ON analytics_metrics
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('analytics', 'edit')
);

-- 10. MIGRATION CLEANUP AND VERIFICATION
-- ==============================================================================

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_id ON event_attendees(user_id);

-- Add triggers for tenant assignment (if not exists)
CREATE OR REPLACE FUNCTION assign_tenant_to_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Assign to default tenant or create new one
  UPDATE profiles 
  SET tenant_id = COALESCE(
    (SELECT id FROM tenants WHERE owner_id = NEW.id LIMIT 1),
    (SELECT id FROM tenants WHERE is_default = true LIMIT 1),
    current_user_tenant()
  )
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION assign_tenant_to_new_user();

-- Verification query to check RLS policies are active
DO $$
DECLARE
  policy_count INTEGER;
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count 
  FROM pg_policies 
  WHERE schemaname = 'public';
  
  SELECT COUNT(*) INTO table_count 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN (
    'projects', 'tasks', 'milestones', 'activities',
    'leads', 'clients', 'client_messages', 'client_tasks', 'client_history',
    'documents', 'calendar_events', 'calendar_tasks', 'event_attendees', 'calendar_reminders',
    'finances', 'project_credentials',
    'profiles', 'user_roles', 'roles', 'permissions', 'role_permissions',
    'notifications', 'messages', 'quick_hits',
    'tenants', 'tenant_config', 'web_analytics', 'analytics_metrics'
  );
  
  RAISE NOTICE 'RLS Migration Complete: % policies created across % tables', policy_count, table_count;
END
$$;

-- ==============================================================================
-- END OF COMPREHENSIVE RLS MIGRATION
-- ==============================================================================

-- ============================================
-- FILE: 2026-01-20_create_finances_table.sql
-- ============================================

-- ========================================
-- CREATE FINANCES TABLE
-- ========================================
-- This migration creates the missing canonical finances table
-- Resolves the duplicate table issue documented in AGENTS.md

-- Create the canonical finances table
CREATE TABLE IF NOT EXISTS finances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Financial tracking fields
  total_agreed NUMERIC DEFAULT 0,           -- Total agreed amount with client
  total_collected NUMERIC DEFAULT 0,        -- Total amount actually collected
  direct_expenses NUMERIC DEFAULT 0,        -- Direct costs (materials, software, etc.)
  imputed_expenses NUMERIC DEFAULT 0,       -- Imputed costs (labor, overhead, etc.)
  hours_worked NUMERIC DEFAULT 0,            -- Total hours tracked on project
  
  -- Business model tracking
  business_model TEXT DEFAULT 'fixed',       -- 'fixed', 'hourly', 'retainer'
  hourly_rate NUMERIC,                       -- For hourly projects
  
  -- Financial health calculation
  health TEXT DEFAULT 'break-even',          -- 'profitable', 'break-even', 'loss'
  profit_margin NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN total_agreed > 0 THEN 
        ROUND((total_collected - direct_expenses - imputed_expenses) / total_agreed * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT finances_business_model_check CHECK (business_model IN ('fixed', 'hourly', 'retainer')),
  CONSTRAINT finances_health_check CHECK (health IN ('profitable', 'break-even', 'loss')),
  CONSTRAINT finances_amounts_non_negative CHECK (
    total_agreed >= 0 AND 
    total_collected >= 0 AND 
    direct_expenses >= 0 AND 
    imputed_expenses >= 0 AND 
    hours_worked >= 0
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_finances_project_id ON finances(project_id);
CREATE INDEX IF NOT EXISTS idx_finances_tenant_id ON finances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finances_health ON finances(health);
CREATE INDEX IF NOT EXISTS idx_finances_business_model ON finances(business_model);

-- Create trigger to auto-update updated_at and calculate health
CREATE OR REPLACE FUNCTION update_finances_health()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the timestamp
  NEW.updated_at = now();
  
  -- Calculate financial health
  IF NEW.total_agreed > 0 THEN
    NEW.health = CASE 
      WHEN (NEW.total_collected - NEW.direct_expenses - NEW.imputed_expenses) > 0 
        THEN 'profitable'
      WHEN (NEW.total_collected - NEW.direct_expenses - NEW.imputed_expenses) = 0 
        THEN 'break-even'
      ELSE 'loss'
    END;
  ELSE
    NEW.health = 'break-even';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finances_health_trigger
  BEFORE INSERT OR UPDATE ON finances
  FOR EACH ROW EXECUTE FUNCTION update_finances_health();

-- Add helpful comments
COMMENT ON TABLE finances IS 'Canonical financial tracking table for projects';
COMMENT ON COLUMN finances.project_id IS 'Link to the associated project';
COMMENT ON COLUMN finances.tenant_id IS 'Multi-tenant isolation';
COMMENT ON COLUMN finances.total_agreed IS 'Total contract amount agreed with client';
COMMENT ON COLUMN finances.total_collected IS 'Amount actually received from client';
COMMENT ON COLUMN finances.direct_expenses IS 'Direct costs (materials, software licenses, etc.)';
COMMENT ON COLUMN finances.imputed_expenses IS 'Imputed costs (labor, overhead, time)';
COMMENT ON COLUMN finances.hours_worked IS 'Total hours worked on this project';
COMMENT ON COLUMN finances.business_model IS 'Business model: fixed, hourly, or retainer';
COMMENT ON COLUMN finances.health IS 'Financial health: profitable, break-even, or loss';
COMMENT ON COLUMN finances.profit_margin IS 'Automatically calculated profit margin percentage';

-- Row Level Security (already enabled in comprehensive RLS policies migration)
ALTER TABLE finances ENABLE ROW LEVEL SECURITY;

-- Finances: SELECT Policy (will be overridden by comprehensive RLS policies)
CREATE POLICY "finances_select_policy" ON finances
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('finance', 'view')
);

-- Finances: INSERT/UPDATE/DELETE Policies (will be overridden by comprehensive RLS policies)
CREATE POLICY "finances_modify_policy" ON finances
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('finance', 'edit')
);

-- Grant permissions
GRANT SELECT ON finances TO authenticated;
GRANT INSERT ON finances TO authenticated;
GRANT UPDATE ON finances TO authenticated;
GRANT DELETE ON finances TO authenticated;

-- Create a helpful function for finance summary
CREATE OR REPLACE FUNCTION get_project_financial_summary(p_project_id UUID)
RETURNS JSONB AS $$
DECLARE
  finance_data finances%ROWTYPE;
  summary JSONB;
BEGIN
  SELECT * INTO finance_data FROM finances WHERE project_id = p_project_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'message', 'No financial data found for this project'
    );
  END IF;
  
  summary := jsonb_build_object(
    'project_id', finance_data.project_id,
    'total_agreed', finance_data.total_agreed,
    'total_collected', finance_data.total_collected,
    'direct_expenses', finance_data.direct_expenses,
    'imputed_expenses', finance_data.imputed_expenses,
    'total_expenses', finance_data.direct_expenses + finance_data.imputed_expenses,
    'hours_worked', finance_data.hours_worked,
    'business_model', finance_data.business_model,
    'health', finance_data.health,
    'profit_margin', finance_data.profit_margin,
    'collection_rate', CASE 
      WHEN finance_data.total_agreed > 0 THEN 
        ROUND(finance_data.total_collected / finance_data.total_agreed * 100, 2)
      ELSE 0
    END,
    'effective_hourly_rate', CASE 
      WHEN finance_data.hours_worked > 0 AND finance_data.business_model = 'hourly' THEN 
        finance_data.total_collected / finance_data.hours_worked
      ELSE NULL
    END
  );
  
  RETURN summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FILE: 2026-01-20_credential_encryption.sql
-- ============================================

-- Migration: Add encrypted project_credentials table
-- Version: 2026-01-20_credential_encryption
-- Purpose: Replace plain text credentials with AES-256-GCM encrypted storage

-- First, create the new project_credentials table with proper encryption support
CREATE TABLE IF NOT EXISTS project_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Project reference
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Credential metadata (stored in plain text)
    name TEXT NOT NULL,
    service_type TEXT NOT NULL, -- e.g., 'aws', 'stripe', 'database', 'api_key'
    description TEXT,
    environment TEXT DEFAULT 'production', -- 'production', 'staging', 'development'
    is_active BOOLEAN DEFAULT true,
    
    -- Encrypted credential data
    encrypted_credential JSONB NOT NULL, -- Contains {data, iv, tag, salt, version}
    
    -- Additional encrypted fields (if needed)
    encrypted_username JSONB, -- For services that require username/password
    encrypted_additional_data JSONB, -- For any other sensitive data
    
    -- Non-sensitive metadata
    expires_at TIMESTAMPTZ, -- For time-limited credentials
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    
    -- Version for future migration
    encryption_version INTEGER DEFAULT 1,
    
    -- Constraints
    CONSTRAINT valid_encryption_format CHECK (
        jsonb_typeof(encrypted_credential) = 'object' AND
        encrypted_credential ? 'data' AND
        encrypted_credential ? 'iv' AND
        encrypted_credential ? 'tag' AND
        encrypted_credential ? 'salt' AND
        encrypted_credential ? 'version'
    )
);

-- Enable Row Level Security
ALTER TABLE project_credentials ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_credentials_project_id ON project_credentials(project_id);
CREATE INDEX IF NOT EXISTS idx_project_credentials_service_type ON project_credentials(service_type);
CREATE INDEX IF NOT EXISTS idx_project_credentials_is_active ON project_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_project_credentials_expires_at ON project_credentials(expires_at);
CREATE INDEX IF NOT EXISTS idx_project_credentials_created_by ON project_credentials(created_by);

-- RLS Policies
-- Users can view credentials for projects they have access to
CREATE POLICY "Users can view project credentials" ON project_credentials
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    );

-- Users can insert credentials for projects they own/manage
CREATE POLICY "Users can insert project credentials" ON project_credentials
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    );

-- Users can update credentials for projects they own/manage
CREATE POLICY "Users can update project credentials" ON project_credentials
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    );

-- Users can delete credentials for projects they own/manage
CREATE POLICY "Users can delete project credentials" ON project_credentials
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    );

-- Function to update access timestamp and count
CREATE OR REPLACE FUNCTION update_credential_access()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE project_credentials 
    SET 
        last_accessed_at = NOW(),
        access_count = access_count + 1
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to track credential access
DROP TRIGGER IF EXISTS on_credential_access ON project_credentials;
CREATE TRIGGER on_credential_access
    AFTER UPDATE ON project_credentials
    FOR EACH ROW
    WHEN (OLD.encrypted_credential IS DISTINCT FROM NEW.encrypted_credential)
    EXECUTE FUNCTION update_credential_access();

-- Function to log credential access attempts for audit
CREATE OR REPLACE FUNCTION log_credential_access()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO activity_logs (
        user_id,
        action,
        target,
        type,
        details,
        timestamp
    ) VALUES (
        auth.uid(),
        'accessed_credential',
        NEW.name,
        'security',
        jsonb_build_object(
            'credential_id', NEW.id,
            'project_id', NEW.project_id,
            'service_type', NEW.service_type,
            'environment', NEW.environment
        ),
        NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for audit logging (only when encrypted credential data changes)
DROP TRIGGER IF EXISTS credential_audit_log ON project_credentials;
CREATE TRIGGER credential_audit_log
    AFTER UPDATE ON project_credentials
    FOR EACH ROW
    WHEN (OLD.encrypted_credential IS DISTINCT FROM NEW.encrypted_credential)
    EXECUTE FUNCTION log_credential_access();

-- Function to check if credentials are expired
CREATE OR REPLACE FUNCTION is_credential_expired(credential_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM project_credentials 
        WHERE id = credential_id 
        AND expires_at IS NOT NULL 
        AND expires_at < NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get encrypted credential for a project
CREATE OR REPLACE FUNCTION get_project_credential(
    p_project_id UUID,
    p_service_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    service_type TEXT,
    description TEXT,
    environment TEXT,
    is_active BOOLEAN,
    encrypted_credential JSONB,
    encrypted_username JSONB,
    encrypted_additional_data JSONB,
    expires_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER,
    created_by UUID,
    encryption_version INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pc.id,
        pc.name,
        pc.service_type,
        pc.description,
        pc.environment,
        pc.is_active,
        pc.encrypted_credential,
        pc.encrypted_username,
        pc.encrypted_additional_data,
        pc.expires_at,
        pc.last_accessed_at,
        pc.access_count,
        pc.created_by,
        pc.encryption_version
    FROM project_credentials pc
    WHERE pc.project_id = p_project_id
    AND (p_service_type IS NULL OR pc.service_type = p_service_type)
    AND pc.is_active = true
    AND (pc.expires_at IS NULL OR pc.expires_at > NOW())
    ORDER BY pc.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for active credentials (for easier queries)
CREATE OR REPLACE VIEW active_project_credentials AS
SELECT 
    pc.*,
    p.title as project_title,
    p.owner_id as project_owner_id
FROM project_credentials pc
JOIN projects p ON pc.project_id = p.id
WHERE pc.is_active = true
AND (pc.expires_at IS NULL OR pc.expires_at > NOW());

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON project_credentials TO authenticated;
GRANT SELECT ON active_project_credentials TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_credential TO authenticated;
GRANT EXECUTE ON FUNCTION is_credential_expired TO authenticated;

-- Update the updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_credentials_updated_at
    BEFORE UPDATE ON project_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Notify PostgREST to reload configuration
NOTIFY pgrst, 'reload config';

-- Migration completed successfully
COMMENT ON TABLE project_credentials IS 'Encrypted storage for project service credentials using AES-256-GCM';
COMMENT ON COLUMN project_credentials.encrypted_credential IS 'JSONB containing {data, iv, tag, salt, version} for AES-256-GCM encryption';
COMMENT ON COLUMN project_credentials.encrypted_username IS 'Optional encrypted username for username/password authentication';
COMMENT ON COLUMN project_credentials.encrypted_additional_data IS 'Optional encrypted additional data for service-specific requirements';

-- ============================================
-- FILE: 2026-01-20_migrate_plaintext_credentials.sql
-- ============================================

-- Migration: Migrate existing plain text credentials to encrypted format
-- Version: 2026-01-20_migrate_plaintext_credentials
-- Purpose: This script migrates any existing plain text credentials to the new encrypted format
-- Note: This should be run AFTER the project_credentials table is created

-- First, check if there's an existing credentials table with plain text
DO $$
BEGIN
    -- Check if we have the old credentials table structure
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'project_credentials' 
        AND column_name = 'password_text'
    ) THEN
        RAISE NOTICE 'Found existing project_credentials table with password_text column, starting migration...';
        
        -- Create backup table before migration
        CREATE TABLE project_credentials_backup AS 
        SELECT * FROM project_credentials;
        
        RAISE NOTICE 'Created backup table: project_credentials_backup';
        
        -- Create temporary column for encrypted data
        ALTER TABLE project_credentials 
        ADD COLUMN IF NOT EXISTS encrypted_credential_json JSONB;
        
        RAISE NOTICE 'Added temporary encrypted_credential_json column';
        
        -- Create a function to encrypt existing credentials
        CREATE OR REPLACE FUNCTION encrypt_existing_credential(plaintext TEXT)
        RETURNS JSONB AS $$
        DECLARE
            master_key TEXT := current_setting('app.encryption_master_key', true);
            salt TEXT;
            iv TEXT;
            tag TEXT;
            encrypted_data TEXT;
            result JSONB;
        BEGIN
            -- This is a placeholder - in practice, you'd need to implement
            -- proper encryption in your application layer or use pgcrypto
            
            -- For now, we'll create a structure that matches our expected format
            -- The actual encryption should be done by the application
            result := jsonb_build_object(
                'data', encode(encrypt(plaintext::bytea, master_key::bytea, 'aes'), 'base64'),
                'iv', encode(gen_random_bytes(16), 'base64'),
                'tag', encode(gen_random_bytes(16), 'base64'),
                'salt', encode(gen_random_bytes(32), 'base64'),
                'version', 1,
                'migration_required', true
            );
            
            RETURN result;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        
        -- Update existing credentials with encrypted data
        UPDATE project_credentials 
        SET 
            encrypted_credential_json = encrypt_existing_credential(password_text),
            migration_flag = true,
            migration_date = NOW()
        WHERE password_text IS NOT NULL;
        
        RAISE NOTICE 'Encrypted % existing credentials', (SELECT COUNT(*) FROM project_credentials WHERE migration_flag = true);
        
        -- Drop the encryption function
        DROP FUNCTION encrypt_existing_credential(TEXT);
        
        -- Set a flag to indicate migration is needed
        -- The application should re-encrypt these properly
        UPDATE project_credentials 
        SET needs_reencryption = true 
        WHERE migration_flag = true;
        
        RAISE NOTICE 'Migration completed. Credentials marked for re-encryption.';
        
    ELSE
        RAISE NOTICE 'No existing plain text credentials found. Migration not needed.';
    END IF;
END $$;

-- Add column to track re-encryption status
DO $$
BEGIN
    ALTER TABLE project_credentials 
    ADD COLUMN IF NOT EXISTS needs_reencryption BOOLEAN DEFAULT false;
    
    ALTER TABLE project_credentials 
    ADD COLUMN IF NOT EXISTS migration_date TIMESTAMPTZ;
    
    ALTER TABLE project_credentials 
    ADD COLUMN IF NOT EXISTS migration_flag BOOLEAN DEFAULT false;
END $$;

-- Create function to check if re-encryption is needed
CREATE OR REPLACE FUNCTION check_reencryption_needed()
RETURNS TABLE (credential_id UUID, name TEXT, service_type TEXT, migration_date TIMESTAMPTZ) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pc.id,
        pc.name,
        pc.service_type,
        pc.migration_date
    FROM project_credentials pc
    WHERE pc.needs_reencryption = true
    ORDER BY pc.migration_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to mark credential as properly encrypted
CREATE OR REPLACE FUNCTION mark_credential_encrypted(credential_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE project_credentials 
    SET 
        needs_reencryption = false,
        migration_flag = false,
        updated_at = NOW()
    WHERE id = credential_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get migration statistics
CREATE OR REPLACE FUNCTION get_migration_stats()
RETURNS TABLE (
    total_credentials BIGINT,
    migrated_credentials BIGINT,
    needs_reencryption BIGINT,
    migration_complete BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM project_credentials) as total_credentials,
        (SELECT COUNT(*) FROM project_credentials WHERE migration_flag = true) as migrated_credentials,
        (SELECT COUNT(*) FROM project_credentials WHERE needs_reencryption = true) as needs_reencryption,
        (SELECT COUNT(*) = 0 FROM project_credentials WHERE needs_reencryption = true) as migration_complete;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_reencryption_needed() TO authenticated;
GRANT EXECUTE ON FUNCTION mark_credential_encrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_migration_stats() TO authenticated;

-- Create a secure function for application-side encryption
CREATE OR REPLACE function application_encrypt_credential(credential_id UUID, encrypted_data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- This function should be called by the application after properly encrypting
    -- the credential with the application's encryption logic
    
    UPDATE project_credentials 
    SET 
        encrypted_credential = encrypted_data,
        needs_reencryption = false,
        migration_flag = false,
        updated_at = NOW()
    WHERE id = credential_id AND needs_reencryption = true;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION application_encrypt_credential(UUID, JSONB) TO authenticated;

-- Add RLS policy for the new columns
ALTER TABLE project_credentials ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own migration status
CREATE POLICY "Users can view migration status" ON project_credentials
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    );

-- Allow users to update migration status
CREATE POLICY "Users can update migration status" ON project_credentials
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    );

-- Notify PostgREST to reload configuration
NOTIFY pgrst, 'reload config';

-- Migration completed
COMMENT ON TABLE project_credentials_backup IS 'Backup of original plain text credentials before encryption migration';
COMMENT ON COLUMN project_credentials.needs_reencryption IS 'Flag indicating credential needs proper re-encryption by application';
COMMENT ON COLUMN project_credentials.migration_date IS 'Date when credential was initially migrated from plain text';
COMMENT ON COLUMN project_credentials.migration_flag IS 'Internal flag for migration process';

-- ============================================
-- FILE: 2026-01-21_cluster_management.sql
-- ============================================

-- Cluster Management Migration
-- Creates tables for cluster identification, management, and coordination

-- Clusters table for cluster metadata and identification
CREATE TABLE IF NOT EXISTS clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id VARCHAR(64) UNIQUE NOT NULL, -- Human-readable cluster ID
    name VARCHAR(255) NOT NULL,
    description TEXT,
    region VARCHAR(64) NOT NULL,
    version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    status VARCHAR(32) NOT NULL DEFAULT 'initializing' 
        CHECK (status IN ('initializing', 'active', 'degraded', 'maintenance', 'offline', 'decommissioning')),
    
    -- Cluster configuration
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Cluster capacity and limits
    max_nodes INTEGER DEFAULT 10,
    max_tenants INTEGER DEFAULT 100,
    max_storage_gb INTEGER DEFAULT 1000,
    
    -- Cluster health metrics
    health_score DECIMAL(3,2) DEFAULT 0.0 CHECK (health_score >= 0.0 AND health_score <= 1.0),
    last_health_check TIMESTAMPTZ DEFAULT now(),
    
    -- Cluster coordination
    primary_node_id UUID REFERENCES cluster_nodes(id),
    coordinator_token VARCHAR(255) UNIQUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_sync TIMESTAMPTZ DEFAULT now(),
    
    -- Cluster lifecycle
    activated_at TIMESTAMPTZ,
    decommissioned_at TIMESTAMPTZ,
    
    -- Security
    encryption_key_id VARCHAR(64),
    backup_retention_days INTEGER DEFAULT 30,
    
    -- Cluster hierarchy (for multi-cluster setups)
    parent_cluster_id UUID REFERENCES clusters(id),
    cluster_level INTEGER DEFAULT 1 CHECK (cluster_level >= 1 AND cluster_level <= 5),
    
    -- Cluster tags and labels
    tags TEXT[] DEFAULT '{}',
    labels JSONB DEFAULT '{}'
);

-- Cluster nodes table for individual node management
CREATE TABLE IF NOT EXISTS cluster_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    node_id VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    
    -- Node status and health
    status VARCHAR(32) NOT NULL DEFAULT 'provisioning'
        CHECK (status IN ('provisioning', 'online', 'offline', 'maintenance', 'error', 'decommissioning')),
    health_status VARCHAR(32) NOT NULL DEFAULT 'unknown'
        CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
    
    -- Node location and network
    region VARCHAR(64) NOT NULL,
    availability_zone VARCHAR(32),
    private_ip VARCHAR(45),
    public_ip VARCHAR(45),
    hostname VARCHAR(255),
    
    -- Node capacity and resources
    capacity_cpu DECIMAL(5,2) DEFAULT 0.0, -- CPU cores
    capacity_memory_gb DECIMAL(8,2) DEFAULT 0.0, -- Memory in GB
    capacity_storage_gb DECIMAL(10,2) DEFAULT 0.0, -- Storage in GB
    capacity_network_mbps DECIMAL(8,2) DEFAULT 0.0, -- Network bandwidth
    
    -- Node current usage
    used_cpu DECIMAL(5,2) DEFAULT 0.0,
    used_memory_gb DECIMAL(8,2) DEFAULT 0.0,
    used_storage_gb DECIMAL(10,2) DEFAULT 0.0,
    used_network_mbps DECIMAL(8,2) DEFAULT 0.0,
    
    -- Node roles and capabilities
    roles TEXT[] DEFAULT '{}', -- ['web', 'api', 'database', 'worker', etc.]
    capabilities JSONB DEFAULT '{}',
    
    -- Node metrics
    load_average DECIMAL(4,2) DEFAULT 0.0,
    cpu_usage_percent DECIMAL(5,2) DEFAULT 0.0,
    memory_usage_percent DECIMAL(5,2) DEFAULT 0.0,
    disk_usage_percent DECIMAL(5,2) DEFAULT 0.0,
    network_io_mbps DECIMAL(8,2) DEFAULT 0.0,
    
    -- Node coordination
    is_primary BOOLEAN DEFAULT false,
    is_coordinator BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0, -- Higher priority for primary selection
    
    -- Node lifecycle
    last_heartbeat TIMESTAMPTZ DEFAULT now(),
    last_restart TIMESTAMPTZ,
    uptime_seconds BIGINT DEFAULT 0,
    
    -- Node configuration
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Security
    node_token VARCHAR(255) UNIQUE,
    ssh_fingerprint VARCHAR(255),
    tls_certificate_id VARCHAR(64)
);

-- Cluster events table for audit trail and coordination
CREATE TABLE IF NOT EXISTS cluster_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    node_id UUID REFERENCES cluster_nodes(id) ON DELETE SET NULL,
    
    -- Event details
    event_type VARCHAR(64) NOT NULL,
    event_category VARCHAR(32) NOT NULL 
        CHECK (event_category IN ('system', 'health', 'coordination', 'security', 'lifecycle', 'configuration')),
    severity VARCHAR(16) NOT NULL DEFAULT 'info'
        CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    
    -- Event data
    title VARCHAR(255) NOT NULL,
    description TEXT,
    details JSONB DEFAULT '{}',
    
    -- Event source
    source_agent VARCHAR(64),
    source_node VARCHAR(64),
    user_id UUID REFERENCES auth.users(id),
    
    -- Event status
    status VARCHAR(32) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'processing', 'completed', 'failed', 'cancelled')),
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    
    -- Event relationships
    parent_event_id UUID REFERENCES cluster_events(id),
    correlation_id VARCHAR(64), -- For grouping related events
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    
    -- Event metadata
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- Cluster metrics table for performance monitoring
CREATE TABLE IF NOT EXISTS cluster_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    node_id UUID REFERENCES cluster_nodes(id) ON DELETE CASCADE,
    
    -- Metric details
    metric_name VARCHAR(128) NOT NULL,
    metric_category VARCHAR(32) NOT NULL,
    metric_type VARCHAR(32) NOT NULL 
        CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'timer')),
    
    -- Metric values
    value DECIMAL(15,6) NOT NULL,
    unit VARCHAR(32),
    
    -- Metric dimensions
    dimensions JSONB DEFAULT '{}',
    labels JSONB DEFAULT '{}',
    
    -- Metric collection
    collection_method VARCHAR(64) DEFAULT 'agent',
    source_agent VARCHAR(64),
    
    -- Timestamps
    timestamp TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Cluster configuration templates
CREATE TABLE IF NOT EXISTS cluster_config_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_type VARCHAR(64) NOT NULL,
    
    -- Template configuration
    config JSONB NOT NULL,
    default_values JSONB DEFAULT '{}',
    validation_schema JSONB,
    
    -- Template metadata
    version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    author VARCHAR(255),
    tags TEXT[] DEFAULT '{}',
    
    -- Template status
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add cluster_id to relevant tables for multi-cluster support
-- Add to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES clusters(id);

-- Add to system_metrics table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_metrics') THEN
        ALTER TABLE system_metrics ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES clusters(id);
    END IF;
END
$$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_clusters_cluster_id ON clusters(cluster_id);
CREATE INDEX IF NOT EXISTS idx_clusters_status ON clusters(status);
CREATE INDEX IF NOT EXISTS idx_clusters_region ON clusters(region);
CREATE INDEX IF NOT EXISTS idx_clusters_parent ON clusters(parent_cluster_id);

CREATE INDEX IF NOT EXISTS idx_cluster_nodes_cluster_id ON cluster_nodes(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_node_id ON cluster_nodes(node_id);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_status ON cluster_nodes(status);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_region ON cluster_nodes(region);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_roles ON cluster_nodes USING GIN(roles);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_primary ON cluster_nodes(is_primary);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_coordinator ON cluster_nodes(is_coordinator);

CREATE INDEX IF NOT EXISTS idx_cluster_events_cluster_id ON cluster_events(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_events_node_id ON cluster_events(node_id);
CREATE INDEX IF NOT EXISTS idx_cluster_events_type ON cluster_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cluster_events_category ON cluster_events(event_category);
CREATE INDEX IF NOT EXISTS idx_cluster_events_severity ON cluster_events(severity);
CREATE INDEX IF NOT EXISTS idx_cluster_events_created_at ON cluster_events(created_at);
CREATE INDEX IF NOT EXISTS idx_cluster_events_correlation ON cluster_events(correlation_id);

CREATE INDEX IF NOT EXISTS idx_cluster_metrics_cluster_id ON cluster_metrics(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_node_id ON cluster_metrics(node_id);
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_name ON cluster_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_timestamp ON cluster_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_category ON cluster_metrics(metric_category);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_clusters_updated_at BEFORE UPDATE ON clusters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cluster_nodes_updated_at BEFORE UPDATE ON cluster_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cluster_events_updated_at BEFORE UPDATE ON cluster_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cluster_config_templates_updated_at BEFORE UPDATE ON cluster_config_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_config_templates ENABLE ROW LEVEL SECURITY;

-- Clusters RLS policies
CREATE POLICY "System admins can view all clusters" ON clusters
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

CREATE POLICY "System admins can insert clusters" ON clusters
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

CREATE POLICY "System admins can update clusters" ON clusters
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

CREATE POLICY "System admins can delete clusters" ON clusters
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Cluster nodes RLS policies
CREATE POLICY "System admins can view all cluster nodes" ON cluster_nodes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

CREATE POLICY "System admins can manage cluster nodes" ON cluster_nodes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Cluster events RLS policies
CREATE POLICY "System admins can view all cluster events" ON cluster_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

CREATE POLICY "System agents can create cluster events" ON cluster_events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Cluster metrics RLS policies
CREATE POLICY "System admins can view all cluster metrics" ON cluster_metrics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

CREATE POLICY "System agents can create cluster metrics" ON cluster_metrics
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Cluster config templates RLS policies
CREATE POLICY "Anyone can view active cluster config templates" ON cluster_config_templates
    FOR SELECT USING (is_active = true);

CREATE POLICY "System admins can manage cluster config templates" ON cluster_config_templates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Insert default cluster configuration template
INSERT INTO cluster_config_templates (
    name,
    description,
    template_type,
    config,
    default_values,
    validation_schema,
    version,
    author,
    is_system,
    tags
) VALUES (
    'Standard Production Cluster',
    'Default configuration for production clusters',
    'production',
    '{
        "network": {
            "load_balancer": true,
            "ssl_termination": true,
            "cdn_integration": false
        },
        "security": {
            "encryption_at_rest": true,
            "encryption_in_transit": true,
            "audit_logging": true,
            "backup_retention_days": 30
        },
        "monitoring": {
            "metrics_collection": true,
            "health_checks": true,
            "alerting": true,
            "log_aggregation": true
        },
        "performance": {
            "auto_scaling": true,
            "caching_enabled": true,
            "connection_pooling": true
        },
        "availability": {
            "high_availability": true,
            "failover_enabled": true,
            "backup_frequency": "daily"
        }
    }',
    '{
        "max_nodes": 10,
        "max_tenants": 100,
        "backup_retention_days": 30,
        "health_check_interval": 30
    }',
    '{
        "type": "object",
        "properties": {
            "max_nodes": {"type": "integer", "minimum": 1, "maximum": 100},
            "max_tenants": {"type": "integer", "minimum": 1, "maximum": 1000},
            "backup_retention_days": {"type": "integer", "minimum": 1, "maximum": 365}
        },
        "required": ["max_nodes", "max_tenants"]
    }',
    '1.0.0',
    'System',
    true,
    '{production, default, standard}'
) ON CONFLICT DO NOTHING;

-- Insert development cluster configuration template
INSERT INTO cluster_config_templates (
    name,
    description,
    template_type,
    config,
    default_values,
    validation_schema,
    version,
    author,
    is_system,
    tags
) VALUES (
    'Development Cluster',
    'Configuration for development and testing clusters',
    'development',
    '{
        "network": {
            "load_balancer": false,
            "ssl_termination": false,
            "cdn_integration": false
        },
        "security": {
            "encryption_at_rest": true,
            "encryption_in_transit": true,
            "audit_logging": false,
            "backup_retention_days": 7
        },
        "monitoring": {
            "metrics_collection": true,
            "health_checks": true,
            "alerting": false,
            "log_aggregation": false
        },
        "performance": {
            "auto_scaling": false,
            "caching_enabled": false,
            "connection_pooling": false
        },
        "availability": {
            "high_availability": false,
            "failover_enabled": false,
            "backup_frequency": "weekly"
        }
    }',
    '{
        "max_nodes": 3,
        "max_tenants": 10,
        "backup_retention_days": 7,
        "health_check_interval": 60
    }',
    '{
        "type": "object",
        "properties": {
            "max_nodes": {"type": "integer", "minimum": 1, "maximum": 10},
            "max_tenants": {"type": "integer", "minimum": 1, "maximum": 50},
            "backup_retention_days": {"type": "integer", "minimum": 1, "maximum": 30}
        },
        "required": ["max_nodes", "max_tenants"]
    }',
    '1.0.0',
    'System',
    true,
    '{development, testing, default}'
) ON CONFLICT DO NOTHING;

-- Create default cluster for single-tenant deployments
INSERT INTO clusters (
    cluster_id,
    name,
    description,
    region,
    version,
    status,
    config,
    metadata,
    max_nodes,
    max_tenants,
    max_storage_gb,
    health_score,
    activated_at,
    tags,
    labels
) VALUES (
    'default-cluster-001',
    'Default Production Cluster',
    'Default cluster for single-tenant deployment',
    'us-east-1',
    '1.0.0',
    'active',
    '{
        "auto_scaling": false,
        "backup_enabled": true,
        "monitoring_enabled": true,
        "security_level": "standard"
    }',
    '{
        "deployment_type": "single-tenant",
        "environment": "production",
        "created_by": "system"
    }',
    10,
    100,
    1000,
    1.0,
    now(),
    '{default, production}',
    '{"environment": "production", "type": "default"}'
) ON CONFLICT (cluster_id) DO NOTHING;

-- Create default primary node for the default cluster
INSERT INTO cluster_nodes (
    cluster_id,
    node_id,
    name,
    status,
    health_status,
    region,
    availability_zone,
    hostname,
    capacity_cpu,
    capacity_memory_gb,
    capacity_storage_gb,
    capacity_network_mbps,
    roles,
    is_primary,
    is_coordinator,
    priority,
    config,
    metadata,
    node_token
) SELECT 
    c.id,
    'default-node-001',
    'Primary Node',
    'online',
    'healthy',
    c.region,
    'us-east-1a',
    'primary-node.eneas-os.local',
    8.0,
    32.0,
    500.0,
    1000.0,
    '{web, api, database, coordinator}',
    true,
    true,
    100,
    '{
        "role": "primary",
        "auto_failover": true,
        "backup_responsible": true
    }',
    '{
        "node_type": "primary",
        "deployment_type": "single-tenant"
    }',
    'default-node-token-' || encode(gen_random_bytes(32), 'hex')
FROM clusters c 
WHERE c.cluster_id = 'default-cluster-001'
AND NOT EXISTS (
    SELECT 1 FROM cluster_nodes cn 
    JOIN clusters c2 ON cn.cluster_id = c2.id 
    WHERE c2.cluster_id = 'default-cluster-001'
) ON CONFLICT (node_id) DO NOTHING;

-- Create function to generate unique cluster IDs
CREATE OR REPLACE FUNCTION generate_cluster_id()
RETURNS TEXT AS $$
DECLARE
    new_cluster_id TEXT;
    id_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate cluster ID with format: cluster-<region>-<timestamp>-<random>
        new_cluster_id := 'cluster-' || 
                         substring(lower(random()::text), 3, 8) || '-' ||
                         to_char(now(), 'YYYY-MM-DD-HH24-MI-SS') || '-' ||
                         substring(lower(encode(gen_random_bytes(4), 'hex')), 1, 8);
        
        -- Check if ID already exists
        SELECT EXISTS(SELECT 1 FROM clusters WHERE cluster_id = new_cluster_id) INTO id_exists;
        
        EXIT WHEN NOT id_exists;
    END LOOP;
    
    RETURN new_cluster_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate unique node IDs
CREATE OR REPLACE FUNCTION generate_node_id(p_cluster_id TEXT)
RETURNS TEXT AS $$
DECLARE
    new_node_id TEXT;
    id_exists BOOLEAN;
    node_counter INTEGER;
BEGIN
    -- Get current node count for this cluster
    SELECT COUNT(*) INTO node_counter 
    FROM cluster_nodes cn 
    JOIN clusters c ON cn.cluster_id = c.id 
    WHERE c.cluster_id = p_cluster_id;
    
    LOOP
        -- Generate node ID with format: node-<cluster>-<number>-<random>
        new_node_id := 'node-' || 
                      substring(p_cluster_id from 8) || '-' ||
                      (node_counter + 1)::text || '-' ||
                      substring(lower(encode(gen_random_bytes(4), 'hex')), 1, 8);
        
        -- Check if ID already exists
        SELECT EXISTS(SELECT 1 FROM cluster_nodes WHERE node_id = new_node_id) INTO id_exists;
        
        EXIT WHEN NOT id_exists;
        node_counter := node_counter + 1;
    END LOOP;
    
    RETURN new_node_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to update cluster health score
CREATE OR REPLACE FUNCTION update_cluster_health_score(p_cluster_id UUID)
RETURNS VOID AS $$
DECLARE
    total_nodes INTEGER;
    healthy_nodes INTEGER;
    new_health_score DECIMAL(3,2);
BEGIN
    -- Count total and healthy nodes
    SELECT COUNT(*), COUNT(*) FILTER (WHERE health_status = 'healthy')
    INTO total_nodes, healthy_nodes
    FROM cluster_nodes
    WHERE cluster_id = p_cluster_id AND status = 'online';
    
    -- Calculate health score (0.0 to 1.0)
    IF total_nodes = 0 THEN
        new_health_score := 0.0;
    ELSE
        new_health_score := (healthy_nodes::DECIMAL / total_nodes::DECIMAL);
    END IF;
    
    -- Update cluster health score
    UPDATE clusters 
    SET health_score = new_health_score,
        last_health_check = now()
    WHERE id = p_cluster_id;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update cluster health when node health changes
CREATE OR REPLACE FUNCTION trigger_cluster_health_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Update cluster health score when node status or health changes
    PERFORM update_cluster_health_score(NEW.cluster_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cluster_health_update_trigger
    AFTER INSERT OR UPDATE ON cluster_nodes
    FOR EACH ROW
    EXECUTE FUNCTION trigger_cluster_health_update();

-- Create function to check cluster coordination status
CREATE OR REPLACE FUNCTION check_cluster_coordination(p_cluster_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    primary_node RECORD;
    coordinator_node RECORD;
    total_nodes INTEGER;
    online_nodes INTEGER;
BEGIN
    -- Get primary node
    SELECT * INTO primary_node
    FROM cluster_nodes
    WHERE cluster_id = p_cluster_id AND is_primary = true AND status = 'online';
    
    -- Get coordinator node
    SELECT * INTO coordinator_node
    FROM cluster_nodes
    WHERE cluster_id = p_cluster_id AND is_coordinator = true AND status = 'online';
    
    -- Count nodes
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'online')
    INTO total_nodes, online_nodes
    FROM cluster_nodes
    WHERE cluster_id = p_cluster_id;
    
    -- Build result
    result := jsonb_build_object(
        'cluster_id', p_cluster_id,
        'coordination_status', 
            CASE 
                WHEN primary_node.id IS NOT NULL AND coordinator_node.id IS NOT NULL THEN 'healthy'
                WHEN primary_node.id IS NOT NULL OR coordinator_node.id IS NOT NULL THEN 'degraded'
                ELSE 'critical'
            END,
        'primary_node', 
            CASE WHEN primary_node.id IS NOT NULL THEN 
                jsonb_build_object(
                    'id', primary_node.id,
                    'node_id', primary_node.node_id,
                    'name', primary_node.name,
                    'last_heartbeat', primary_node.last_heartbeat
                )
            ELSE NULL
            END,
        'coordinator_node',
            CASE WHEN coordinator_node.id IS NOT NULL THEN
                jsonb_build_object(
                    'id', coordinator_node.id,
                    'node_id', coordinator_node.node_id,
                    'name', coordinator_node.name,
                    'last_heartbeat', coordinator_node.last_heartbeat
                )
            ELSE NULL
            END,
        'total_nodes', total_nodes,
        'online_nodes', online_nodes,
        'node_health_ratio', 
            CASE WHEN total_nodes > 0 THEN (online_nodes::DECIMAL / total_nodes::DECIMAL) ELSE 0.0 END,
        'last_check', now()
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to promote node to primary
CREATE OR REPLACE FUNCTION promote_node_to_primary(p_node_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    node_record RECORD;
    cluster_record RECORD;
BEGIN
    -- Get node and cluster information
    SELECT cn.*, c.id as cluster_id INTO node_record
    FROM cluster_nodes cn
    JOIN clusters c ON cn.cluster_id = c.id
    WHERE cn.id = p_node_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Demote existing primary node if any
    UPDATE cluster_nodes
    SET is_primary = false
    WHERE cluster_id = node_record.cluster_id AND is_primary = true;
    
    -- Promote new primary node
    UPDATE cluster_nodes
    SET is_primary = true,
        priority = GREATEST(priority, 100),
        updated_at = now()
    WHERE id = p_node_id;
    
    -- Update cluster primary node reference
    UPDATE clusters
    SET primary_node_id = p_node_id,
        updated_at = now()
    WHERE id = node_record.cluster_id;
    
    -- Log the promotion event
    INSERT INTO cluster_events (
        cluster_id,
        node_id,
        event_type,
        event_category,
        severity,
        title,
        description,
        details,
        source_agent
    ) VALUES (
        node_record.cluster_id,
        p_node_id,
        'node_promotion',
        'coordination',
        'info',
        'Node promoted to primary',
        format('Node %s has been promoted to primary role', node_record.name),
        jsonb_build_object(
            'previous_primary', NULL,
            'new_primary', node_record.node_id,
            'promotion_time', now()
        ),
        'system-agent'
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON clusters TO authenticated;
GRANT ALL ON cluster_nodes TO authenticated;
GRANT ALL ON cluster_events TO authenticated;
GRANT ALL ON cluster_metrics TO authenticated;
GRANT SELECT ON cluster_config_templates TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION generate_cluster_id() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_node_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_cluster_health_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_cluster_coordination(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION promote_node_to_primary(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE clusters IS 'Cluster metadata and configuration for multi-cluster deployments';
COMMENT ON TABLE cluster_nodes IS 'Individual cluster nodes with capacity and health monitoring';
COMMENT ON TABLE cluster_events IS 'Audit trail and coordination events for cluster management';
COMMENT ON TABLE cluster_metrics IS 'Performance and health metrics for clusters and nodes';
COMMENT ON TABLE cluster_config_templates IS 'Reusable configuration templates for cluster provisioning';

COMMENT ON COLUMN clusters.cluster_id IS 'Human-readable unique cluster identifier';
COMMENT ON COLUMN clusters.coordinator_token IS 'Token for cluster coordination between nodes';
COMMENT ON COLUMN clusters.health_score IS 'Overall cluster health score (0.0 to 1.0)';
COMMENT ON COLUMN cluster_nodes.node_id IS 'Human-readable unique node identifier within cluster';
COMMENT ON COLUMN cluster_nodes.node_token IS 'Authentication token for node communication';
COMMENT ON COLUMN cluster_nodes.is_primary IS 'Whether this node is the primary node for the cluster';
COMMENT ON COLUMN cluster_nodes.is_coordinator IS 'Whether this node coordinates cluster operations';
COMMENT ON COLUMN cluster_events.correlation_id IS 'ID for grouping related events together';
COMMENT ON COLUMN cluster_metrics.metric_type IS 'Type of metric: counter, gauge, histogram, or timer';

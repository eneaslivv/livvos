-- SQL para crear tablas de clientes - EJECUTAR EN SUPABASE
-- PASOS:
-- 1. Ve a https://app.supabase.com/project/azkhquxgekgfuplvwobe/sql
-- 2. Copia TODO este contenido
-- 3. Click en "RUN" (botón verde)

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

-- Índices para mejorar rendimiento
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

-- Políticas para clients
CREATE POLICY "Users can view their own clients" ON clients
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own clients" ON clients
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own clients" ON clients
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own clients" ON clients
  FOR DELETE USING (auth.uid() = owner_id);

-- Políticas para client_messages
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

-- Políticas para client_tasks
CREATE POLICY "Users can manage tasks of their clients" ON client_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = client_tasks.client_id 
      AND clients.owner_id = auth.uid()
    )
  );

-- Políticas para client_history
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
(auth.uid(), 'Lucas Martinez', 'lucas@startup.io', 'StartupXYZ', '+1-555-0456', 'prospect', 'CTO técnico, enfocado en escalabilidad y performance.', 'SaaS', '456 Innovation Ave, Austin, TX'),
(auth.uid(), 'Sarah Jenkins', 'sarah@boutique.co', 'Fashion Boutique', '+1-555-0789', 'active', 'Dueña de boutique de moda. Necesita e-commerce moderno.', 'Fashion', '789 Style Blvd, New York, NY');

-- Mensajes de ejemplo
INSERT INTO client_messages (client_id, sender_type, sender_name, message, created_at) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), 'client', 'Sofia Rodriguez', 'Hola! Estoy muy interesada en un rebranding completo para TechCorp. ¿Podemos agendar una llamada?', NOW() - INTERVAL '2 days'),
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), 'user', 'Eneas', '¡Hola Sofia! Claro, me encantaría discutir tu proyecto. ¿Qué día te vendría bien?', NOW() - INTERVAL '1 day'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io' AND owner_id = auth.uid()), 'client', 'Lucas Martinez', 'Necesito ayuda con la arquitectura de nuestra API. Estamos creciendo rápidamente.', NOW() - INTERVAL '3 days');

-- Tareas de ejemplo
INSERT INTO client_tasks (client_id, owner_id, title, description, priority, due_date) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), auth.uid(), 'Enviar propuesta de rebranding', 'Preparar y enviar propuesta detallada con timeline y presupuesto', 'high', NOW() + INTERVAL '3 days'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io' AND owner_id = auth.uid()), auth.uid(), 'Revisar documentación de API', 'Analizar la arquitectura actual y proponer mejoras', 'medium', NOW() + INTERVAL '5 days'),
((SELECT id FROM clients WHERE email = 'sarah@boutique.co' AND owner_id = auth.uid()), auth.uid(), 'Diseñar mockups de e-commerce', 'Crear 3 propuestas de diseño para la tienda online', 'high', NOW() + INTERVAL '2 days');

-- Historial de ejemplo
INSERT INTO client_history (client_id, user_id, user_name, action_type, action_description) VALUES 
((SELECT id FROM clients WHERE email = 'sofia@techcorp.com' AND owner_id = auth.uid()), auth.uid(), 'Eneas', 'call', 'Llamada inicial de 45 minutos - discutieron rebranding y objetivos'),
((SELECT id FROM clients WHERE email = 'lucas@startup.io' AND owner_id = auth.uid()), auth.uid(), 'Eneas', 'meeting', 'Reunión Zoom de 30 minutos - revisaron requisitos técnicos'),
((SELECT id FROM clients WHERE email = 'sarah@boutique.co' AND owner_id = auth.uid()), auth.uid(), 'Eneas', 'email', 'Envió portfolio de diseño y casos de éxito en e-commerce');

-- Verificación final
SELECT '✅ Tablas creadas exitosamente!' as status;
SELECT '✅ RLS Policies aplicadas' as status;
SELECT '✅ Datos de muestra insertados' as status;
SELECT '✅ Sistema de clientes listo!' as status;
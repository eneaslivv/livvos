# Instrucciones para configurar tu base de datos Supabase

## Paso 1: Acceder al SQL Editor

1. Ve a tu dashboard de Supabase: https://app.supabase.com
2. Selecciona tu proyecto: `azkhquxgekgfuplvwobe`
3. Ve a "SQL Editor" en el menú lateral

## Paso 2: Ejecutar el Schema SQL

Copia y pega el siguiente SQL en el editor y ejecuta:

```sql
-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  progress INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Active',
  client TEXT,
  next_steps TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  color TEXT
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  priority TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  due_date TIMESTAMPTZ,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  start_time TEXT,
  duration INTEGER,
  description TEXT,
  assignee_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subtasks
CREATE TABLE IF NOT EXISTS subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID,
  user_name TEXT,
  user_initials TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ideas
CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  integrated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_name TEXT,
  user_avatar TEXT,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_title TEXT,
  type TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  details TEXT,
  meta JSONB
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT,
  origin TEXT,
  utm JSONB,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_interaction TIMESTAMPTZ DEFAULT now(),
  ai_analysis JSONB,
  history JSONB DEFAULT '[]'
);

-- Web Analytics
CREATE TABLE IF NOT EXISTS web_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_visits INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  bounce_rate NUMERIC DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  top_pages JSONB DEFAULT '[]',
  daily_visits JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Weekly Goals
CREATE TABLE IF NOT EXISTS weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_project_id ON activity_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Insertar datos de prueba
INSERT INTO projects (id, title, description, progress, status, client, next_steps, updated_at, color) VALUES 
('550e8400-e29b-41d4-a716-446655440001', 'Fintech Dashboard', 'Redesigning the core banking experience', 75, 'Active', 'Bank Corp', 'User Testing', NOW(), '#3b82f6'),
('550e8400-e29b-41d4-a716-446655440002', 'E-commerce Platform', 'Complete online store solution', 45, 'Active', 'Tech Store', 'Payment integration', NOW(), '#10b981');

INSERT INTO ideas (id, content, tags, integrated, created_at) VALUES 
('660e8400-e29b-41d4-a716-446655440001', 'Explore using Framer Motion for landing page animations', '{"Dev","UX"}', false, NOW()),
('660e8400-e29b-41d4-a716-446655440002', 'Dark mode toggle should persist via local storage', '{"Dev"}', true, NOW());

INSERT INTO leads (id, name, email, message, origin, status, created_at, last_interaction, ai_analysis) VALUES 
('770e8400-e29b-41d4-a716-446655440001', 'Martín Gomez', 'martin.g@startup.io', 'Hi, looking for SaaS rebranding.', 'Web Form', 'new', NOW(), NOW(), '{"category":"branding","temperature":"hot","summary":"High intent SaaS launch imminent.","recommendation":"Send SaaS Branding Kit PDF."}'),
('770e8400-e29b-41d4-a716-446655440002', 'Sarah Lee', 'sarah@boutique.co', 'Shopify dev needed.', 'Instagram', 'contacted', NOW(), NOW(), '{"category":"ecommerce","temperature":"warm","summary":"Specific need for Shopify Dev.","recommendation":"Share E-com portfolio."}');

INSERT INTO web_analytics (id, total_visits, unique_visitors, bounce_rate, conversions, top_pages, daily_visits, updated_at) VALUES 
('880e8400-e29b-41d4-a716-446655440001', 1250, 890, 35.2, 45, '[{"path":"/","views":450},{"path":"/portfolio","views":320}]', '[{"date":"2024-01-01","value":120},{"date":"2024-01-02","value":145}]', NOW());

INSERT INTO activity_logs (id, user_id, user_name, user_avatar, action, target, project_id, project_title, type, timestamp, details) VALUES 
('990e8400-e29b-41d4-a716-446655440001', 'user1', 'Sofia R.', 'SR', 'completed task', 'Hero Section Responsiveness', '550e8400-e29b-41d4-a716-446655440001', 'Fintech Dashboard', 'task_completed', NOW(), 'Task completed successfully'),
('990e8400-e29b-41d4-a716-446655440002', 'user2', 'Lucas M.', 'LM', 'commented on', 'API Schema V2', '550e8400-e29b-41d4-a716-446655440002', 'E-commerce Platform', 'comment', NOW(), 'I think we should switch to GraphQL');
```

## Paso 3: Verificar la conexión

Después de ejecutar el SQL, tu aplicación debería conectarse automáticamente. Puedes verificar:

1. Abre http://localhost:3000
2. Navega a las diferentes secciones (Projects, Ideas, Sales, Activity)
3. Los datos de prueba deberían aparecer automáticamente

## Notas importantes:

- Las tablas tienen RLS (Row Level Security) desactivadas por defecto
- Los datos se sincronizarán en tiempo real gracias a las suscripciones de Supabase
- Si necesitas autenticación o restricciones de seguridad, puedo ayudarte a configurarlas después

¡Tu aplicación está lista para usar con Supabase! 🎉

## ¿Problemas de conexión?

Si ves errores de conexión, verifica:
1. Las credenciales en `.env.local` están correctas
2. El proyecto de Supabase está activo
3. Las tablas se crearon correctamente en el SQL Editor
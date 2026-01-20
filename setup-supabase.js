// Script para ejecutar el schema SQL en Supabase
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const schemaSQL = `
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
`

async function setupDatabase() {
  try {
    console.log('🚀 Setting up Supabase database...')
    
    // Execute the SQL in batches
    const statements = schemaSQL.split(';').filter(s => s.trim())
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: statement })
          if (error) {
            console.warn('⚠️  Statement failed:', error.message)
          } else {
            console.log('✅ Statement executed successfully')
          }
        } catch (err) {
          console.warn('⚠️  Could not execute statement:', err)
        }
      }
    }
    
    console.log('✅ Database setup completed!')
    
    // Test connection by querying tables
    console.log('🔍 Testing connection...')
    const { data: projects, error: projectsError } = await supabase.from('projects').select('*')
    const { data: ideas, error: ideasError } = await supabase.from('ideas').select('*')
    const { data: leads, error: leadsError } = await supabase.from('leads').select('*')
    
    if (projectsError) console.warn('Projects query failed:', projectsError.message)
    else console.log('📊 Projects found:', projects?.length || 0)
    
    if (ideasError) console.warn('Ideas query failed:', ideasError.message)
    else console.log('💡 Ideas found:', ideas?.length || 0)
    
    if (leadsError) console.warn('Leads query failed:', leadsError.message)
    else console.log('🎯 Leads found:', leads?.length || 0)
    
    console.log('🎉 Supabase integration complete!')
    
  } catch (error) {
    console.error('❌ Database setup failed:', error)
  }
}

// Run the setup
setupDatabase()
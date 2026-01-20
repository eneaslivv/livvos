# Supabase SQL Schema for eneas-os

-- Projects
CREATE TABLE projects (
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
CREATE TABLE tasks (
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
CREATE TABLE subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE
);

-- Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID,
  user_name TEXT,
  user_initials TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ideas
CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  integrated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activity Logs
CREATE TABLE activity_logs (
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
CREATE TABLE leads (
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
CREATE TABLE web_analytics (
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
CREATE TABLE weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX idx_comments_task_id ON comments(task_id);
CREATE INDEX idx_activity_logs_project_id ON activity_logs(project_id);
CREATE INDEX idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
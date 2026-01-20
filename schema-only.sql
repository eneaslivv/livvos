-- ===================================
-- SCHEMA PARA ENEAS-OS (SOLO SQL)
-- ===================================

-- 1. PROJECTS TABLE
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

-- 2. IDEAS TABLE
CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  integrated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. LEADS TABLE
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

-- 4. ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_name TEXT,
  user_avatar TEXT,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  project_id UUID,
  project_title TEXT,
  type TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  details TEXT,
  meta JSONB
);

-- 5. WEB ANALYTICS TABLE
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

-- INDICES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);

-- SAMPLE DATA
INSERT INTO projects (title, description, progress, status, client, next_steps, color) VALUES 
('Fintech Dashboard', 'Redesigning the core banking experience', 75, 'Active', 'Bank Corp', 'User Testing', '#3b82f6'),
('E-commerce Platform', 'Complete online store solution', 45, 'Active', 'Tech Store', 'Payment integration', '#10b981');

INSERT INTO ideas (content, tags, integrated, created_at) VALUES 
('Explore using Framer Motion for landing page animations', '{"Dev","UX"}', false, NOW()),
('Dark mode toggle should persist via local storage', '{"Dev"}', true, NOW());

INSERT INTO leads (name, email, message, origin, status, created_at, last_interaction, ai_analysis) VALUES 
('Martín Gomez', 'martin.g@startup.io', 'Hi, looking for SaaS rebranding.', 'Web Form', 'new', NOW(), NOW(), '{"category":"branding","temperature":"hot","summary":"High intent SaaS launch imminent.","recommendation":"Send SaaS Branding Kit PDF."}'),
('Sarah Lee', 'sarah@boutique.co', 'Shopify dev needed.', 'Instagram', 'contacted', NOW(), NOW(), '{"category":"ecommerce","temperature":"warm","summary":"Specific need for Shopify Dev.","recommendation":"Share E-com portfolio."}');

INSERT INTO web_analytics (total_visits, unique_visitors, bounce_rate, conversions, top_pages, daily_visits, updated_at) VALUES 
(1250, 890, 35.2, 45, '[{"path":"/","views":450},{"path":"/portfolio","views":320}]', '[{"date":"2024-01-01","value":120},{"date":"2024-01-02","value":145}]', NOW());

INSERT INTO activity_logs (user_name, user_avatar, action, target, project_title, type, timestamp, details) VALUES 
('Sofia R.', 'SR', 'completed task', 'Hero Section Responsiveness', 'Fintech Dashboard', 'task_completed', NOW(), 'Task completed successfully'),
('Lucas M.', 'LM', 'commented on', 'API Schema V2', 'E-commerce Platform', 'comment', NOW(), 'I think we should switch to GraphQL');
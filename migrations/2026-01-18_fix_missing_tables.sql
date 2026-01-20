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

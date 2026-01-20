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


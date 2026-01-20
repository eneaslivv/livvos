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

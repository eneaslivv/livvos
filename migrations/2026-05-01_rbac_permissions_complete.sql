-- ==============================================================================
-- Complete RBAC permission catalog + default role assignments
--
-- Background:
--   * 2025-12-29_rbac_system.sql seeded only sales/crm/finance/projects/team/settings
--     permissions, leaving calendar/documents/analytics/tenant/security/system empty.
--   * Roles `admin`, `manager`, `viewer` had no role_permissions rows at all,
--     so a user assigned one of these roles ended up with effectively no access
--     (only `owner` short-circuits to "all" in code).
--
-- This migration is idempotent: ON CONFLICT DO NOTHING everywhere, and the
-- role mappings only insert if the (role, permission) pair is missing.
-- It does NOT touch existing custom role_permissions or revoke anything.
-- ==============================================================================

-- 1. Fill the permission catalog so every (module, action) the UI checks exists.
INSERT INTO permissions (module, action, description) VALUES
  -- CRM (already partially seeded)
  ('crm',       'create',          'Create CRM contacts and deals'),
  ('crm',       'delete',          'Delete CRM contacts and deals'),
  ('crm',       'view_leads',      'View leads pipeline'),
  -- Sales
  ('sales',     'create',          'Create sales records'),
  ('sales',     'delete',          'Delete sales records'),
  ('sales',     'view_dashboard',  'View sales dashboard'),
  ('sales',     'view_analytics',  'View sales analytics'),
  -- Finance
  ('finance',   'create',          'Create financial records'),
  ('finance',   'delete',          'Delete financial records'),
  ('finance',   'manage',          'Manage finance settings & accounts'),
  -- Projects
  ('projects',  'view',            'View projects'),
  ('projects',  'create',          'Create projects'),
  ('projects',  'edit',            'Edit projects'),
  ('projects',  'delete',          'Delete projects'),
  ('projects',  'assign',          'Assign team members to projects'),
  ('projects',  'manage',          'Manage all project settings'),
  -- Team
  ('team',      'create',          'Invite team members'),
  ('team',      'edit',            'Edit team member info'),
  ('team',      'delete',          'Remove team members'),
  ('team',      'assign',          'Assign roles to team members'),
  -- Calendar
  ('calendar',  'view',            'View calendar events'),
  ('calendar',  'create',          'Create calendar events'),
  ('calendar',  'edit',            'Edit calendar events'),
  ('calendar',  'delete',          'Delete calendar events'),
  ('calendar',  'manage',          'Manage calendar integrations'),
  -- Documents
  ('documents', 'view',            'View documents'),
  ('documents', 'create',          'Upload/create documents'),
  ('documents', 'edit',            'Edit documents'),
  ('documents', 'delete',          'Delete documents'),
  ('documents', 'manage',          'Manage document folders & access'),
  -- Analytics
  ('analytics', 'view',            'View analytics dashboards'),
  ('analytics', 'view_dashboard',  'View main analytics dashboard'),
  ('analytics', 'view_analytics',  'View detailed analytics'),
  ('analytics', 'manage',          'Configure analytics & reports'),
  -- Tenant (workspace settings)
  ('tenant',    'view',            'View workspace info'),
  ('tenant',    'edit',            'Edit workspace settings'),
  ('tenant',    'manage',          'Manage workspace (billing, branding, connections)'),
  -- Security (roles, credentials, audit)
  ('security',  'view',            'View security dashboard & audit log'),
  ('security',  'manage',          'Create/edit roles, credentials, permissions'),
  ('security',  'assign',          'Assign roles to users'),
  -- System
  ('system',    'access',          'Access system administration'),
  ('system',    'manage',          'Manage system-wide settings'),
  -- Auth
  ('auth',      'access',          'Authenticate into the platform')
ON CONFLICT (module, action) DO NOTHING;

-- 2. Re-sync owner -> ALL permissions (covers any newly-added rows above).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'owner'
ON CONFLICT DO NOTHING;

-- 3. Default permissions for `admin`
--    Admin = everything except destructive system-level ops. Can manage team,
--    roles, projects, finance, documents, calendar; cannot reset the workspace.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND NOT (p.module = 'system' AND p.action = 'manage')
ON CONFLICT DO NOTHING;

-- 4. Default permissions for `manager`
--    Manager = full read across the workspace; can create/edit (not delete) most
--    operational data; can assign team to projects but not change roles.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'manager'
  AND (
    -- All view/view_* actions
    p.action IN ('view', 'view_dashboard', 'view_leads', 'view_analytics', 'access')
    -- Create + edit on operational modules
    OR (p.module IN ('crm','sales','projects','calendar','documents','team') AND p.action IN ('create','edit'))
    -- Assign team to projects (but not assign roles → that's security:assign)
    OR (p.module = 'projects' AND p.action = 'assign')
  )
ON CONFLICT DO NOTHING;

-- 5. Default permissions for `viewer`
--    Viewer = read-only. Sees everything that has a "view" action.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'viewer'
  AND p.action IN ('view', 'view_dashboard', 'view_leads', 'view_analytics', 'access')
ON CONFLICT DO NOTHING;

-- 6. Top up `sales` and `finance` with the new fine-grained actions on their modules.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'sales' AND p.module IN ('sales','crm')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'finance' AND p.module IN ('finance','analytics')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

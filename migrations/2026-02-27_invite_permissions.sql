-- ==============================================================================
-- INVITE PERMISSIONS: Ensure roles supports tenant_id and all screen permissions exist
-- ==============================================================================

-- 1. Ensure roles table has tenant_id (required by RLS modify policy)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- 2. Ensure all screen-level permissions exist for navigation access control
INSERT INTO permissions (module, action, description) VALUES
  ('projects',  'view',           'Access to Projects screen'),
  ('team',      'view',           'Access to Team/Clients screen'),
  ('calendar',  'view',           'Access to Calendar screen'),
  ('activity',  'view',           'Access to Activity screen'),
  ('documents', 'view',           'Access to Documents screen'),
  ('sales',     'view_dashboard', 'Access to Sales Overview screen'),
  ('sales',     'view_leads',     'Access to Leads Inbox screen'),
  ('sales',     'view_analytics', 'Access to Analytics screen'),
  ('finance',   'view',           'Access to Financial Center screen')
ON CONFLICT (module, action) DO NOTHING;

-- 3. Ensure owner and admin roles have ALL permissions (including any newly added)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('owner', 'admin')
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- RBAC SYSTEM MIGRATION (Roles, Permissions, Users, Services, Payments)
-- ==============================================================================

-- 1. PROFILES (Extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ROLES
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PERMISSIONS
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL, -- e.g., 'sales', 'crm', 'finance'
  action TEXT NOT NULL, -- e.g., 'view', 'edit', 'delete'
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(module, action)
);

-- 4. ROLE PERMISSIONS (Many-to-Many)
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- 5. USER ROLES (Many-to-Many)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- 6. SERVICES (Toggleable Modules)
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE, -- e.g., 'sales_module'
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  requires_role TEXT[], -- Array of role names that can access this
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. PAYMENT PROCESSORS
CREATE TABLE IF NOT EXISTS payment_processors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'primary' or 'secondary'
  config JSONB DEFAULT '{}', -- Store public keys, etc.
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_processors ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view all profiles (for team lists) but only edit their own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Roles/Permissions: Read-only for most, Write for Admins (simplified for now to public read)
CREATE POLICY "Roles are viewable by everyone" ON roles FOR SELECT USING (true);
CREATE POLICY "Permissions are viewable by everyone" ON permissions FOR SELECT USING (true);
CREATE POLICY "Role Permissions are viewable by everyone" ON role_permissions FOR SELECT USING (true);
CREATE POLICY "User Roles are viewable by everyone" ON user_roles FOR SELECT USING (true);

-- Services/Payments: Read-only for everyone, Write for Admins
CREATE POLICY "Services are viewable by everyone" ON services FOR SELECT USING (true);
CREATE POLICY "Payment Processors are viewable by everyone" ON payment_processors FOR SELECT USING (true);

-- ==============================================================================
-- SEED DATA
-- ==============================================================================

-- Roles
INSERT INTO roles (name, description, is_system) VALUES
('owner', 'Full access to everything', TRUE),
('admin', 'Administrator access', TRUE),
('manager', 'Team manager', TRUE),
('sales', 'Sales representative', TRUE),
('finance', 'Financial officer', TRUE),
('viewer', 'Read-only access', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Permissions (Sample)
INSERT INTO permissions (module, action, description) VALUES
('sales', 'view', 'View sales data'),
('sales', 'edit', 'Edit sales data'),
('crm', 'view', 'View CRM contacts'),
('crm', 'edit', 'Edit CRM contacts'),
('finance', 'view', 'View financial data'),
('finance', 'edit', 'Edit financial data'),
('projects', 'view_assigned', 'View assigned projects'),
('projects', 'view_all', 'View all projects'),
('team', 'view', 'View team members'),
('team', 'manage', 'Manage team members'),
('settings', 'view', 'View settings'),
('settings', 'manage', 'Manage settings')
ON CONFLICT (module, action) DO NOTHING;

-- Map Owner to All Permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'owner'
ON CONFLICT DO NOTHING;

-- Map Finance to Finance Permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'finance' AND p.module IN ('finance', 'settings')
ON CONFLICT DO NOTHING;

-- Map Sales to Sales/CRM Permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'sales' AND p.module IN ('sales', 'crm')
ON CONFLICT DO NOTHING;

-- Services
INSERT INTO services (key, name, description, requires_role) VALUES
('sales', 'Sales Module', 'Manage leads and sales pipeline', '{sales,owner,admin,manager}'),
('crm', 'CRM', 'Customer Relationship Management', '{sales,owner,admin,manager}'),
('finance', 'Finance Module', 'Financial reports and invoicing', '{finance,owner,admin}'),
('projects', 'Projects', 'Project management', '{owner,admin,manager,sales,viewer}')
ON CONFLICT (key) DO NOTHING;

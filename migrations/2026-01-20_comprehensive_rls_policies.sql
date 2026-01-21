-- ==============================================================================
-- COMPREHENSIVE ROW-LEVEL SECURITY POLICIES FOR ENEAS-OS
-- Migration Date: 2026-01-20
-- Purpose: Implement tenant isolation and role-based access control
-- ==============================================================================

-- Create a comprehensive security framework with proper tenant isolation
-- and role-based access control for all domain tables.

-- 1. SECURITY HELPER FUNCTIONS
-- ==============================================================================

-- Function to get current user's tenant
CREATE OR REPLACE FUNCTION current_user_tenant()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id 
    FROM profiles 
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is tenant owner
CREATE OR REPLACE FUNCTION is_tenant_owner(p_tenant_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  v_tenant_id UUID := COALESCE(p_tenant_id, current_user_tenant());
  v_user_tenant UUID;
  v_tenant_owner_id UUID;
BEGIN
  -- Get user's tenant and tenant owner
  SELECT tenant_id INTO v_user_tenant
  FROM profiles 
  WHERE user_id = auth.uid();
  
  SELECT owner_id INTO v_tenant_owner_id
  FROM tenants 
  WHERE id = v_tenant_id;
  
  RETURN v_user_tenant = v_tenant_id 
         AND auth.uid() = v_tenant_owner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION has_permission(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = auth.uid()
    AND p.module = p_module
    AND p.action = p_action
  ) OR is_tenant_owner(); -- Owners have all permissions
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access tenant data
CREATE OR REPLACE FUNCTION can_access_tenant(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_user_tenant() = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's roles for RLS checks
CREATE OR REPLACE FUNCTION get_user_roles()
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT r.name 
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. SECURITY CONTEXTS
-- ==============================================================================

-- Create a security context for tenant-based filtering
CREATE OR REPLACE FUNCTION tenant_security_context()
RETURNS TABLE (
  user_id UUID,
  tenant_id UUID,
  is_owner BOOLEAN,
  user_roles TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    auth.uid() as user_id,
    current_user_tenant() as tenant_id,
    is_tenant_owner() as is_owner,
    get_user_roles() as user_roles;
END;
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. CORE BUSINESS TABLES RLS POLICIES
-- ==============================================================================

-- PROJECTS TABLE
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Ensure projects has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
  END IF;
END
$$;

-- Add owner_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN owner_id UUID REFERENCES profiles(id);
    CREATE INDEX idx_projects_owner_id ON projects(owner_id);
  END IF;
END
$$;

-- Projects: SELECT Policy
CREATE POLICY "projects_select_policy" ON projects
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('projects', 'view_all') OR
    has_permission('projects', 'view_assigned') AND (
      owner_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM project_members pm 
        WHERE pm.project_id = projects.id AND pm.user_id = auth.uid()
      )
    )
  )
);

-- Projects: INSERT Policy
CREATE POLICY "projects_insert_policy" ON projects
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'create') AND
  owner_id = auth.uid()
);

-- Projects: UPDATE Policy
CREATE POLICY "projects_update_policy" ON projects
FOR UPDATE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit') AND (
    owner_id = auth.uid() OR
    has_permission('projects', 'edit_all')
  )
)
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit')
);

-- Projects: DELETE Policy
CREATE POLICY "projects_delete_policy" ON projects
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'delete') AND (
    owner_id = auth.uid() OR
    has_permission('projects', 'delete_all')
  )
);

-- TASKS TABLE
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Ensure tasks has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tasks' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_tasks_tenant_id ON tasks(tenant_id);
  END IF;
END
$$;

-- Tasks: SELECT Policy
CREATE POLICY "tasks_select_policy" ON tasks
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('projects', 'view_all') OR
    has_permission('projects', 'view_assigned') AND (
      assignee_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = tasks.project_id AND p.tenant_id = tasks.tenant_id
        AND (
          p.owner_id = auth.uid() OR
          EXISTS (
            SELECT 1 FROM project_members pm 
            WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
          )
        )
      )
    )
  )
);

-- Tasks: INSERT Policy
CREATE POLICY "tasks_insert_policy" ON tasks
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit') AND
  (assignee_id = auth.uid() OR assignee_id IS NULL)
);

-- Tasks: UPDATE Policy
CREATE POLICY "tasks_update_policy" ON tasks
FOR UPDATE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit') AND (
    assignee_id = auth.uid() OR
    has_permission('projects', 'edit_all')
  )
);

-- Tasks: DELETE Policy
CREATE POLICY "tasks_delete_policy" ON tasks
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'delete') AND (
    assignee_id = auth.uid() OR
    has_permission('projects', 'delete_all')
  )
);

-- MILESTONES TABLE
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

-- Ensure milestones has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'milestones' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE milestones ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_milestones_tenant_id ON milestones(tenant_id);
  END IF;
END
$$;

-- Milestones: SELECT Policy
CREATE POLICY "milestones_select_policy" ON milestones
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'view_all')
);

-- Milestones: INSERT/UPDATE/DELETE Policies
CREATE POLICY "milestones_modify_policy" ON milestones
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit')
)
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'edit')
);

-- ACTIVITIES TABLE
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Ensure activities has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE activities ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_activities_tenant_id ON activities(tenant_id);
  END IF;
END
$$;

-- Activities: SELECT Policy
CREATE POLICY "activities_select_policy" ON activities
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'view_all')
);

-- Activities: INSERT Policy
CREATE POLICY "activities_insert_policy" ON activities
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  user_id = auth.uid() -- Users can only log activities for themselves
);

-- Activities: UPDATE/DELETE Policies (restrictive - activities should be immutable)
CREATE POLICY "activities_immutable_policy" ON activities
FOR UPDATE
USING (false); -- Activities are immutable

CREATE POLICY "activities_delete_policy" ON activities
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('system', 'admin') -- Only system admins can delete
);

-- 4. CRM/LEADS TABLES RLS POLICIES
-- ==============================================================================

-- LEADS TABLE
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Ensure leads has tenant_id and owner_id columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN owner_id UUID REFERENCES profiles(id);
    CREATE INDEX idx_leads_owner_id ON leads(owner_id);
  END IF;
END
$$;

-- Leads: SELECT Policy
CREATE POLICY "leads_select_policy" ON leads
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('sales', 'view_all') OR
    has_permission('sales', 'view_assigned') AND owner_id = auth.uid()
  )
);

-- Leads: INSERT Policy
CREATE POLICY "leads_insert_policy" ON leads
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'create') AND
  owner_id = auth.uid()
);

-- Leads: UPDATE Policy
CREATE POLICY "leads_update_policy" ON leads
FOR UPDATE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND (
    owner_id = auth.uid() OR
    has_permission('sales', 'edit_all')
  )
);

-- Leads: DELETE Policy
CREATE POLICY "leads_delete_policy" ON leads
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'delete') AND (
    owner_id = auth.uid() OR
    has_permission('sales', 'delete_all')
  )
);

-- CLIENTS TABLE
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Ensure clients has tenant_id and owner_id columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE clients ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_clients_tenant_id ON clients(tenant_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE clients ADD COLUMN owner_id UUID REFERENCES profiles(id);
    CREATE INDEX idx_clients_owner_id ON clients(owner_id);
  END IF;
END
$$;

-- Clients: SELECT Policy
CREATE POLICY "clients_select_policy" ON clients
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('sales', 'view_all') OR
    has_permission('sales', 'view_assigned') AND owner_id = auth.uid()
  )
);

-- Clients: INSERT/UPDATE/DELETE Policies
CREATE POLICY "clients_modify_policy" ON clients
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND (
    owner_id = auth.uid() OR
    has_permission('sales', 'edit_all')
  )
)
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND
  owner_id = auth.uid()
);

-- CLIENT_MESSAGES TABLE
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

-- Client Messages: SELECT Policy
CREATE POLICY "client_messages_select_policy" ON client_messages
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'view_all')
);

-- Client Messages: INSERT Policy
CREATE POLICY "client_messages_insert_policy" ON client_messages
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND
  created_by = auth.uid()
);

-- CLIENT_TASKS TABLE
ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;

-- Client Tasks: SELECT Policy
CREATE POLICY "client_tasks_select_policy" ON client_tasks
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('sales', 'view_all') OR
    assigned_to = auth.uid()
  )
);

-- Client Tasks: INSERT/UPDATE/DELETE Policies
CREATE POLICY "client_tasks_modify_policy" ON client_tasks
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND (
    assigned_to = auth.uid() OR
    has_permission('sales', 'edit_all')
  )
);

-- CLIENT_HISTORY TABLE
ALTER TABLE client_history ENABLE ROW LEVEL SECURITY;

-- Client History: SELECT Policy
CREATE POLICY "client_history_select_policy" ON client_history
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'view_all')
);

-- Client History: INSERT Policy
CREATE POLICY "client_history_insert_policy" ON client_history
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('sales', 'edit') AND
  created_by = auth.uid()
);

-- Client History: UPDATE/DELETE Policies (immutable)
CREATE POLICY "client_history_immutable_policy" ON client_history
FOR UPDATE
USING (false);

CREATE POLICY "client_history_delete_policy" ON client_history
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('system', 'admin')
);

-- 5. DOCUMENTS TABLES RLS POLICIES
-- ==============================================================================

-- DOCUMENTS TABLE
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Ensure documents has tenant_id and owner_id columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE documents ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);
  END IF;
END
$$;

-- Documents: SELECT Policy
CREATE POLICY "documents_select_policy" ON documents
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('documents', 'view_all') OR
    has_permission('documents', 'view_own') AND owner_id = auth.uid()
  )
);

-- Documents: INSERT Policy
CREATE POLICY "documents_insert_policy" ON documents
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('documents', 'create') AND
  owner_id = auth.uid()
);

-- Documents: UPDATE Policy
CREATE POLICY "documents_update_policy" ON documents
FOR UPDATE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('documents', 'edit') AND (
    owner_id = auth.uid() OR
    has_permission('documents', 'edit_all')
  )
);

-- Documents: DELETE Policy
CREATE POLICY "documents_delete_policy" ON documents
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('documents', 'delete') AND (
    owner_id = auth.uid() OR
    has_permission('documents', 'delete_all')
  )
);

-- 6. CALENDAR TABLES RLS POLICIES
-- ==============================================================================

-- CALENDAR_EVENTS TABLE
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Ensure calendar_events has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calendar_events' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE calendar_events ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_calendar_events_tenant_id ON calendar_events(tenant_id);
  END IF;
END
$$;

-- Calendar Events: SELECT Policy
CREATE POLICY "calendar_events_select_policy" ON calendar_events
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('calendar', 'view_all') OR
    has_permission('calendar', 'view_own') AND created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM event_attendees ea 
      WHERE ea.event_id = calendar_events.id AND ea.user_id = auth.uid()
    )
  )
);

-- Calendar Events: INSERT Policy
CREATE POLICY "calendar_events_insert_policy" ON calendar_events
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'create') AND
  created_by = auth.uid()
);

-- Calendar Events: UPDATE Policy
CREATE POLICY "calendar_events_update_policy" ON calendar_events
FOR UPDATE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'edit') AND (
    created_by = auth.uid() OR
    has_permission('calendar', 'edit_all')
  )
);

-- Calendar Events: DELETE Policy
CREATE POLICY "calendar_events_delete_policy" ON calendar_events
FOR DELETE
USING (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'delete') AND (
    created_by = auth.uid() OR
    has_permission('calendar', 'delete_all')
  )
);

-- CALENDAR_TASKS TABLE
ALTER TABLE calendar_tasks ENABLE ROW LEVEL SECURITY;

-- Calendar Tasks: SELECT Policy
CREATE POLICY "calendar_tasks_select_policy" ON calendar_tasks
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('calendar', 'view_all') OR
    assigned_to = auth.uid()
  )
);

-- Calendar Tasks: INSERT/UPDATE/DELETE Policies
CREATE POLICY "calendar_tasks_modify_policy" ON calendar_tasks
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'edit') AND (
    assigned_to = auth.uid() OR
    has_permission('calendar', 'edit_all')
  )
);

-- EVENT_ATTENDEES TABLE
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;

-- Event Attendees: SELECT Policy
CREATE POLICY "event_attendees_select_policy" ON event_attendees
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('calendar', 'view_all') OR
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM calendar_events ce 
      WHERE ce.id = event_attendees.event_id AND ce.created_by = auth.uid()
    )
  )
);

-- Event Attendees: INSERT Policy
CREATE POLICY "event_attendees_insert_policy" ON event_attendees
FOR INSERT
WITH CHECK (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'edit') AND (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM calendar_events ce 
      WHERE ce.id = event_attendees.event_id AND ce.created_by = auth.uid()
    )
  )
);

-- Event Attendees: UPDATE/DELETE Policies
CREATE POLICY "event_attendees_modify_policy" ON event_attendees
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'edit') AND
  (user_id = auth.uid() OR has_permission('calendar', 'edit_all'))
);

-- CALENDAR_REMINDERS TABLE
ALTER TABLE calendar_reminders ENABLE ROW LEVEL SECURITY;

-- Calendar Reminders: SELECT Policy
CREATE POLICY "calendar_reminders_select_policy" ON calendar_reminders
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND (
    has_permission('calendar', 'view_all') OR
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM calendar_events ce 
      WHERE ce.id = calendar_reminders.event_id AND ce.created_by = auth.uid()
    )
  )
);

-- Calendar Reminders: INSERT/UPDATE/DELETE Policies
CREATE POLICY "calendar_reminders_modify_policy" ON calendar_reminders
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('calendar', 'edit') AND (
    user_id = auth.uid() OR
    has_permission('calendar', 'edit_all')
  )
);

-- 7. FINANCIAL TABLES RLS POLICIES
-- ==============================================================================

-- FINANCES TABLE (canonical financial table)
ALTER TABLE finances ENABLE ROW LEVEL SECURITY;

-- Ensure finances has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'finances' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE finances ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_finances_tenant_id ON finances(tenant_id);
  END IF;
END
$$;

-- Finances: SELECT Policy
CREATE POLICY "finances_select_policy" ON finances
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('finance', 'view')
);

-- Finances: INSERT/UPDATE/DELETE Policies
CREATE POLICY "finances_modify_policy" ON finances
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('finance', 'edit')
);

-- PROJECT_CREDENTIALS TABLE
ALTER TABLE project_credentials ENABLE ROW LEVEL SECURITY;

-- Project Credentials: SELECT Policy
CREATE POLICY "project_credentials_select_policy" ON project_credentials
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'view_all')
);

-- Project Credentials: INSERT/UPDATE/DELETE Policies
CREATE POLICY "project_credentials_modify_policy" ON project_credentials
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('projects', 'manage_credentials')
);

-- 8. SECURITY/AUTH TABLES RLS POLICIES
-- ==============================================================================

-- PROFILES TABLE
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: SELECT Policy
CREATE POLICY "profiles_select_policy" ON profiles
FOR SELECT
USING (
  -- Users can always view their own profile
  user_id = auth.uid() OR
  -- Users with permission can view all profiles in their tenant
  (has_permission('team', 'view_all') AND tenant_id = current_user_tenant()) OR
  -- Anyone can view basic profile info for project/task assignments
  (
    SELECT 1 FROM projects p WHERE p.owner_id = profiles.user_id AND p.tenant_id = current_user_tenant()
    LIMIT 1
  ) OR
  (
    SELECT 1 FROM tasks t WHERE t.assignee_id = profiles.user_id AND t.tenant_id = current_user_tenant()
    LIMIT 1
  )
);

-- Profiles: UPDATE Policy
CREATE POLICY "profiles_update_policy" ON profiles
FOR UPDATE
USING (
  -- Users can update their own profile
  user_id = auth.uid() OR
  -- Team managers can update profiles in their tenant
  (has_permission('team', 'edit_members') AND tenant_id = current_user_tenant())
);

-- Profiles: DELETE Policy
CREATE POLICY "profiles_delete_policy" ON profiles
FOR DELETE
USING (
  -- Only tenant owners can delete profiles
  is_tenant_owner(tenant_id)
);

-- USER_ROLES TABLE
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- User Roles: SELECT Policy
CREATE POLICY "user_roles_select_policy" ON user_roles
FOR SELECT
USING (
  -- Users can view their own roles
  user_id = auth.uid() OR
  -- Team managers can view roles in their tenant
  (
    has_permission('team', 'view_all') AND
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = user_roles.user_id AND p.tenant_id = current_user_tenant()
    )
  )
);

-- User Roles: INSERT/DELETE Policies
CREATE POLICY "user_roles_modify_policy" ON user_roles
FOR ALL
USING (
  -- Team managers can manage roles in their tenant
  has_permission('team', 'manage_roles') AND
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = user_roles.user_id AND p.tenant_id = current_user_tenant()
  )
);

-- ROLES TABLE
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Roles: SELECT Policy
CREATE POLICY "roles_select_policy" ON roles
FOR SELECT
USING (
  -- Everyone can view non-system roles in their tenant
  (is_system = false AND tenant_id = current_user_tenant()) OR
  -- Users with team permissions can view all roles
  has_permission('team', 'view_all') OR
  -- System roles are visible to everyone (read-only)
  is_system = true
);

-- Roles: INSERT/UPDATE/DELETE Policies
CREATE POLICY "roles_modify_policy" ON roles
FOR ALL
USING (
  -- Only team managers can modify non-system roles
  has_permission('team', 'manage_roles') AND
  is_system = false AND
  tenant_id = current_user_tenant()
);

-- PERMISSIONS TABLE
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Permissions: SELECT Policy (permissions are global, not tenant-scoped)
CREATE POLICY "permissions_select_policy" ON permissions
FOR SELECT
USING (true);

-- Permissions: INSERT/UPDATE/DELETE Policies (system admin only)
CREATE POLICY "permissions_modify_policy" ON permissions
FOR ALL
USING (has_permission('system', 'admin'));

-- ROLE_PERMISSIONS TABLE
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Role Permissions: SELECT Policy
CREATE POLICY "role_permissions_select_policy" ON role_permissions
FOR SELECT
USING (
  -- Users can view permissions for their own roles
  EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.role_id = role_permissions.role_id AND ur.user_id = auth.uid()
  ) OR
  -- Team managers can view all role permissions in their tenant
  has_permission('team', 'view_all')
);

-- Role Permissions: INSERT/UPDATE/DELETE Policies
CREATE POLICY "role_permissions_modify_policy" ON role_permissions
FOR ALL
USING (
  has_permission('team', 'manage_roles') AND
  EXISTS (
    SELECT 1 FROM roles r 
    WHERE r.id = role_permissions.role_id AND 
          (r.tenant_id = current_user_tenant() OR r.is_system = true)
  )
);

-- NOTIFICATIONS TABLE
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Notifications: SELECT Policy
CREATE POLICY "notifications_select_policy" ON notifications
FOR SELECT
USING (
  -- Users can only view their own notifications
  user_id = auth.uid()
);

-- Notifications: INSERT Policy
CREATE POLICY "notifications_insert_policy" ON notifications
FOR INSERT
WITH CHECK (
  -- Users can only create notifications for themselves
  user_id = auth.uid() OR
  -- System can create notifications for users
  has_permission('system', 'admin')
);

-- Notifications: UPDATE Policy
CREATE POLICY "notifications_update_policy" ON notifications
FOR UPDATE
USING (
  -- Users can only update their own notifications (mark as read)
  user_id = auth.uid()
);

-- Notifications: DELETE Policy
CREATE POLICY "notifications_delete_policy" ON notifications
FOR DELETE
USING (
  -- Users can only delete their own notifications
  user_id = auth.uid()
);

-- MESSAGES TABLE
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Messages: SELECT Policy
CREATE POLICY "messages_select_policy" ON messages
FOR SELECT
USING (
  -- Users can view messages they sent or received
  from_user_id = auth.uid() OR
  to_user_id = auth.uid() OR
  -- Team managers can view all messages in their tenant
  (has_permission('team', 'view_all') AND tenant_id = current_user_tenant())
);

-- Messages: INSERT Policy
CREATE POLICY "messages_insert_policy" ON messages
FOR INSERT
WITH CHECK (
  -- Users can only send messages as themselves
  from_user_id = auth.uid() AND
  tenant_id = current_user_tenant()
);

-- Messages: UPDATE/DELETE Policies (messages should be immutable)
CREATE POLICY "messages_immutable_policy" ON messages
FOR UPDATE
USING (false);

CREATE POLICY "messages_delete_policy" ON messages
FOR DELETE
USING (
  -- Only senders can delete their own messages
  from_user_id = auth.uid()
);

-- QUICK_HITS TABLE
ALTER TABLE quick_hits ENABLE ROW LEVEL SECURITY;

-- Quick Hits: SELECT Policy
CREATE POLICY "quick_hits_select_policy" ON quick_hits
FOR SELECT
USING (
  -- Users can view their own quick hits
  assigned_to = auth.uid() OR
  -- Team managers can view all quick hits in their tenant
  (has_permission('team', 'view_all') AND tenant_id = current_user_tenant())
);

-- Quick Hits: INSERT/UPDATE/DELETE Policies
CREATE POLICY "quick_hits_modify_policy" ON quick_hits
FOR ALL
USING (
  -- Users can manage their own quick hits
  assigned_to = auth.uid() OR
  -- Team managers can manage all quick hits in their tenant
  (has_permission('team', 'manage_tasks') AND tenant_id = current_user_tenant())
)
WITH CHECK (
  tenant_id = current_user_tenant()
);

-- 9. CONFIGURATION TABLES RLS POLICIES
-- ==============================================================================

-- TENANTS TABLE
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Tenants: SELECT Policy
CREATE POLICY "tenants_select_policy" ON tenants
FOR SELECT
USING (
  -- Users can view their own tenant
  id = current_user_tenant() OR
  -- System admins can view all tenants
  has_permission('system', 'admin')
);

-- Tenants: INSERT Policy
CREATE POLICY "tenants_insert_policy" ON tenants
FOR INSERT
WITH CHECK (
  -- Only system admins can create tenants
  has_permission('system', 'admin') AND
  owner_id = auth.uid()
);

-- Tenants: UPDATE Policy
CREATE POLICY "tenants_update_policy" ON tenants
FOR UPDATE
USING (
  -- Tenant owners can update their tenant
  owner_id = auth.uid() OR
  -- System admins can update any tenant
  has_permission('system', 'admin')
);

-- Tenants: DELETE Policy
CREATE POLICY "tenants_delete_policy" ON tenants
FOR DELETE
USING (
  -- Only system admins can delete tenants
  has_permission('system', 'admin')
);

-- TENANT_CONFIG TABLE
ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;

-- Tenant Config: SELECT Policy
CREATE POLICY "tenant_config_select_policy" ON tenant_config
FOR SELECT
USING (
  -- Users can view their own tenant config
  tenant_id = current_user_tenant() OR
  -- System admins can view all tenant configs
  has_permission('system', 'admin')
);

-- Tenant Config: INSERT/UPDATE/DELETE Policies
CREATE POLICY "tenant_config_modify_policy" ON tenant_config
FOR ALL
USING (
  -- Tenant owners can manage their config
  EXISTS (
    SELECT 1 FROM tenants t 
    WHERE t.id = tenant_config.tenant_id AND t.owner_id = auth.uid()
  ) OR
  -- System admins can manage any tenant config
  has_permission('system', 'admin')
);

-- WEB_ANALYTICS TABLE
ALTER TABLE web_analytics ENABLE ROW LEVEL SECURITY;

-- Ensure web_analytics has tenant_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'web_analytics' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE web_analytics ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    CREATE INDEX idx_web_analytics_tenant_id ON web_analytics(tenant_id);
  END IF;
END
$$;

-- Web Analytics: SELECT Policy
CREATE POLICY "web_analytics_select_policy" ON web_analytics
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('analytics', 'view')
);

-- Web Analytics: INSERT/UPDATE/DELETE Policies
CREATE POLICY "web_analytics_modify_policy" ON web_analytics
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('analytics', 'edit')
);

-- ANALYTICS_METRICS TABLE
ALTER TABLE analytics_metrics ENABLE ROW LEVEL SECURITY;

-- Analytics Metrics: SELECT Policy
CREATE POLICY "analytics_metrics_select_policy" ON analytics_metrics
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('analytics', 'view')
);

-- Analytics Metrics: INSERT/UPDATE/DELETE Policies
CREATE POLICY "analytics_metrics_modify_policy" ON analytics_metrics
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('analytics', 'edit')
);

-- 10. MIGRATION CLEANUP AND VERIFICATION
-- ==============================================================================

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_id ON event_attendees(user_id);

-- Add triggers for tenant assignment (if not exists)
CREATE OR REPLACE FUNCTION assign_tenant_to_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Assign to default tenant or create new one
  UPDATE profiles 
  SET tenant_id = COALESCE(
    (SELECT id FROM tenants WHERE owner_id = NEW.id LIMIT 1),
    (SELECT id FROM tenants WHERE is_default = true LIMIT 1),
    current_user_tenant()
  )
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION assign_tenant_to_new_user();

-- Verification query to check RLS policies are active
DO $$
DECLARE
  policy_count INTEGER;
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count 
  FROM pg_policies 
  WHERE schemaname = 'public';
  
  SELECT COUNT(*) INTO table_count 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN (
    'projects', 'tasks', 'milestones', 'activities',
    'leads', 'clients', 'client_messages', 'client_tasks', 'client_history',
    'documents', 'calendar_events', 'calendar_tasks', 'event_attendees', 'calendar_reminders',
    'finances', 'project_credentials',
    'profiles', 'user_roles', 'roles', 'permissions', 'role_permissions',
    'notifications', 'messages', 'quick_hits',
    'tenants', 'tenant_config', 'web_analytics', 'analytics_metrics'
  );
  
  RAISE NOTICE 'RLS Migration Complete: % policies created across % tables', policy_count, table_count;
END
$$;

-- ==============================================================================
-- END OF COMPREHENSIVE RLS MIGRATION
-- ==============================================================================
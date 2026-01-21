# Row-Level Security (RLS) Policies Documentation

## Overview

The eneas-os system implements comprehensive Row-Level Security (RLS) policies to ensure:

1. **Tenant Isolation** - Users can only access data from their own tenant
2. **Role-Based Access Control** - Fine-grained permissions based on user roles
3. **Data Protection** - Sensitive data is protected from unauthorized access
4. **System Security** - Critical system functions are properly secured

## Architecture

### Security Framework Components

#### 1. Database Functions
- `current_user_tenant()` - Returns the current user's tenant ID
- `is_tenant_owner(p_tenant_id)` - Checks if user is tenant owner
- `has_permission(p_module, p_action)` - Checks user permissions
- `can_access_tenant(p_tenant_id)` - Validates tenant access
- `get_user_roles()` - Returns user's role array
- `tenant_security_context()` - Comprehensive security context

#### 2. Client-Side Security Helpers
- `lib/securityHelpers.ts` - Client-side security utilities
- Permission checking functions
- Security context management
- Tenant validation helpers

#### 3. Database Policies
- Table-specific RLS policies for all domain tables
- Tenant isolation enforcement
- Role-based access control
- Immutable data protection

## Policy Categories

### 1. Core Business Tables

#### Projects Table (`projects`)
```sql
-- Columns: tenant_id, owner_id (added by RLS migration)
-- Permissions required:
--   SELECT: projects.view_all OR (projects.view_assigned AND owner/assigned)
--   INSERT: projects.create AND owner_id = current_user
--   UPDATE: projects.edit AND (owner OR projects.edit_all)
--   DELETE: projects.delete AND (owner OR projects.delete_all)
```

**Access Rules:**
- Users can see projects they own or are assigned to
- Tenant owners can see all projects
- Project owners can edit their projects
- Admins can edit all projects (with `projects.edit_all`)

#### Tasks Table (`tasks`)
```sql
-- Columns: tenant_id (added by RLS migration)
-- Permissions required:
--   SELECT: projects.view_all OR (projects.view_assigned AND assigned/owner)
--   INSERT: projects.create AND assigned_to = current_user
--   UPDATE: projects.edit AND (assignee OR projects.edit_all)
--   DELETE: projects.delete AND (assignee OR projects.delete_all)
```

**Access Rules:**
- Inherits project access permissions
- Users can see tasks assigned to them
- Project tasks visible based on project access

#### Milestones Table (`milestones`)
```sql
-- Columns: tenant_id (added by RLS migration)
-- Permissions required:
--   SELECT/INSERT/UPDATE/DELETE: projects.edit
```

**Access Rules:**
- Users with project edit permissions can manage milestones
- Tenant-wide visibility for users with project permissions

#### Activities Table (`activities`)
```sql
-- Columns: tenant_id (added by RLS migration)
-- Permissions required:
--   SELECT: projects.view_all
--   INSERT: user_id = current_user (activity logging)
--   UPDATE: disabled (immutable)
--   DELETE: system.admin only
```

**Access Rules:**
- Activities are append-only logs
- Users can only log activities for themselves
- Only system admins can delete activity logs

### 2. CRM/Leads Tables

#### Leads Table (`leads`)
```sql
-- Columns: tenant_id, owner_id (added by RLS migration)
-- Permissions required:
--   SELECT: sales.view_all OR (sales.view_assigned AND owner)
--   INSERT: sales.create AND owner_id = current_user
--   UPDATE: sales.edit AND (owner OR sales.edit_all)
--   DELETE: sales.delete AND (owner OR sales.delete_all)
```

**Access Rules:**
- Sales team members see their assigned leads
- Sales managers can see all leads
- Lead ownership is enforced

#### Clients Table (`clients`)
```sql
-- Columns: tenant_id, owner_id (added by RLS migration)
-- Permissions required:
--   SELECT: sales.view_all OR (sales.view_assigned AND owner)
--   INSERT/UPDATE/DELETE: sales.edit AND (owner OR sales.edit_all)
```

**Access Rules:**
- Similar to leads - ownership-based access
- Client ownership assignment enforced

#### Client Communications
- `client_messages` - Communication history
- `client_tasks` - Client-specific tasks
- `client_history` - Immutable audit trail

### 3. Documents Tables

#### Documents Table (`documents`)
```sql
-- Columns: tenant_id (added by RLS migration)
-- Permissions required:
--   SELECT: documents.view_all OR (documents.view_own AND owner)
--   INSERT: documents.create AND owner_id = current_user
--   UPDATE: documents.edit AND (owner OR documents.edit_all)
--   DELETE: documents.delete AND (owner OR documents.delete_all)
```

**Access Rules:**
- Users can access their own documents
- Document managers can access all tenant documents
- Storage limits enforced at application level

### 4. Calendar Tables

#### Calendar Events (`calendar_events`)
```sql
-- Columns: tenant_id (added by RLS migration)
-- Permissions required:
--   SELECT: calendar.view_all OR (calendar.view_own AND creator) OR attendee
--   INSERT: calendar.create AND created_by = current_user
--   UPDATE: calendar.edit AND (creator OR calendar.edit_all)
--   DELETE: calendar.delete AND (creator OR calendar.delete_all)
```

**Access Rules:**
- Event creators can manage their events
- Attendees can view events they're invited to
- Calendar managers can edit all events

#### Supporting Tables
- `calendar_tasks` - Scheduled tasks with tenant isolation
- `event_attendees` - Attendee management with access control
- `calendar_reminders` - Reminder management

### 5. Financial Tables

#### Finances Table (`finances`)
```sql
-- Columns: tenant_id (added by RLS migration)
-- Permissions required:
--   SELECT: finance.view
--   INSERT/UPDATE/DELETE: finance.edit
```

**Access Rules:**
- Financial data restricted to finance role
- Tenant isolation enforced
- Audit trail maintained

#### Project Credentials (`project_credentials`)
```sql
-- Permissions required:
--   SELECT: projects.view_all
--   INSERT/UPDATE/DELETE: projects.manage_credentials
```

**Access Rules:**
- Encrypted credential storage
- Access limited to project managers
- System-level protection

### 6. Security/Auth Tables

#### Profiles Table (`profiles`)
```sql
-- Permissions required:
--   SELECT: own_profile OR team.view_all OR project_assignments
--   UPDATE: own_profile OR team.edit_members
--   DELETE: tenant.owner only
```

**Access Rules:**
- Users can always view/update their own profile
- Team managers can view team member profiles
- Project assignments allow cross-team visibility

#### Roles & Permissions
- `roles` - Role definitions with tenant scoping
- `permissions` - Global permission definitions
- `user_roles` - User-role assignments
- `role_permissions` - Role-permission mappings

### 7. Notification Tables

#### Notifications (`notifications`)
```sql
-- Permissions required:
--   SELECT/UPDATE/DELETE: user_id = current_user
--   INSERT: user_id = current_user OR system.admin
```

**Access Rules:**
- Users can only manage their own notifications
- System can create notifications for users
- Real-time delivery maintained

#### Messages (`messages`)
```sql
-- Permissions required:
--   SELECT: sender OR recipient OR team.view_all
--   INSERT: from_user = current_user AND correct_tenant
--   UPDATE: disabled (immutable)
--   DELETE: sender only
```

**Access Rules:**
- Messages are immutable after creation
- Participants can view conversation
- Team managers can monitor messages

### 8. Configuration Tables

#### Tenants Table (`tenants`)
```sql
-- Permissions required:
--   SELECT: own_tenant OR system.admin
--   INSERT: system.admin AND owner_id = current_user
--   UPDATE: tenant.owner OR system.admin
--   DELETE: system.admin only
```

**Access Rules:**
- Tenant isolation at the highest level
- System admin controls tenant creation
- Tenant owners manage their tenant

#### Tenant Config (`tenant_config`)
```sql
-- Permissions required:
--   SELECT: own_tenant OR system.admin
--   INSERT/UPDATE/DELETE: tenant.owner OR system.admin
```

**Access Rules:**
- Configuration scoped to tenant
- Owner-level management
- System admin override

## Permission Matrix

### Module Permissions

| Module | Action | Description | Typical Roles |
|--------|--------|-------------|--------------|
| projects | view_all | See all tenant projects | owner, admin, manager |
| projects | view_assigned | See own/assigned projects | member, viewer |
| projects | create | Create new projects | manager, admin |
| projects | edit | Edit projects | owner, manager, admin |
| projects | delete | Delete projects | owner, admin |
| sales | view_all | See all leads/clients | owner, admin, sales_manager |
| sales | view_assigned | See assigned leads/clients | sales_member |
| sales | create | Create leads/clients | sales_member, sales_manager |
| sales | edit | Edit leads/clients | sales_manager, admin |
| sales | delete | Delete leads/clients | sales_manager, admin |
| documents | view_all | See all documents | owner, admin |
| documents | view_own | See own documents | all roles |
| documents | create | Upload documents | all roles |
| documents | edit | Edit documents | owner, admin |
| calendar | view_all | See all calendar events | owner, admin |
| calendar | view_own | See own events | all roles |
| calendar | create | Create events | all roles |
| calendar | edit | Edit events | owner, admin |
| finance | view | View financial data | owner, admin, finance |
| finance | edit | Edit financial data | owner, admin, finance |
| team | view_all | See all team members | owner, admin |
| team | edit_members | Edit team member profiles | owner, admin |
| team | manage_roles | Manage user roles | owner, admin |
| analytics | view | View analytics data | owner, admin |
| analytics | edit | Edit analytics data | owner, admin |

### Role Hierarchy

1. **Owner** - Full control over tenant and all data
2. **Admin** - Administrative access to most functions
3. **Manager** - Department-specific management
4. **Member** - Standard user access to assigned resources
5. **Viewer** - Read-only access to shared resources

## Implementation Details

### Database Schema Additions

#### New Columns
```sql
-- Core tables get tenant_id for isolation
ALTER TABLE projects ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE tasks ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE leads ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE leads ADD COLUMN owner_id UUID REFERENCES profiles(id);
-- ... etc
```

#### Performance Indexes
```sql
-- Tenant-based queries
CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX idx_tasks_tenant_id ON tasks(tenant_id);
-- ... etc

-- Role-based queries
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
-- ... etc
```

### Security Functions

#### Tenant Context Resolution
```sql
CREATE OR REPLACE FUNCTION current_user_tenant()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT tenant_id FROM profiles WHERE user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Permission Checking
```sql
CREATE OR REPLACE FUNCTION has_permission(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = auth.uid()
    AND p.module = p_module
    AND p.action = p_action
  ) OR is_tenant_owner();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Client-Side Integration

#### Security Context Hook
```typescript
import { createSecurityHook } from '../lib/securityHelpers'

const useSecurity = createSecurityHook()

// In component
const { canRead, canUpdate, canDelete } = useSecurity()

if (!canRead('projects')) {
  // Hide projects view
}
```

#### Tenant Validation
```typescript
import { tenantValidator } from '../lib/securityHelpers'

// Before database operation
await tenantValidator.initialize()
const tenantId = tenantValidator.getTenantId()

// Validate tenant isolation
await validateTenantAccess(tenantId)
```

## Testing

### RLS Policy Tests
- Tenant isolation verification
- Role-based access control testing
- Permission enforcement validation
- Performance optimization checks

### Security Function Tests
- Function existence verification
- Permission accuracy testing
- Tenant context validation
- Error handling verification

### Integration Tests
- End-to-end security flow
- Cross-tenant access prevention
- Privilege escalation prevention
- Audit trail verification

## Security Considerations

### Critical Protections

1. **Tenant Isolation** - Users cannot access other tenant data
2. **Privilege Escalation** - No policy allows role elevation
3. **Data Leakage** - Sensitive data properly protected
4. **Injection Prevention** - SQL injection protection via RLS

### Known Limitations

1. **Performance Impact** - RLS adds query overhead (mitigated with indexes)
2. **Complex Queries** - Complex permissions may require multiple policy evaluations
3. **Debugging** - RLS policy failures can be difficult to debug
4. **Migration** - Schema changes require policy updates

### Best Practices

1. **Least Privilege** - Default to no access, grant minimal required permissions
2. **Audit Logging** - Log all permission checks and access attempts
3. **Regular Review** - Periodically review and update RLS policies
4. **Testing** - Comprehensive test coverage for all security scenarios
5. **Monitoring** - Monitor RLS policy performance and failures

## Migration and Deployment

### Migration Steps

1. **Backup Database** - Full backup before migration
2. **Apply Migration** - Run RLS migration in maintenance window
3. **Verify Policies** - Run policy validation script
4. **Test Access** - Verify all access patterns work correctly
5. **Monitor Performance** - Check query performance impact

### Rollback Plan

1. **Disable RLS** - `ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;`
2. **Remove Policies** - `DROP POLICY policy_name ON table_name;`
3. **Remove Functions** - `DROP FUNCTION function_name;`
4. **Restore Backup** - If necessary, restore from backup

## Maintenance

### Regular Tasks

1. **Policy Reviews** - Monthly security policy review
2. **Performance Monitoring** - Weekly performance metrics
3. **Access Audits** - Quarterly access pattern analysis
4. **Security Updates** - Immediate for security issues
5. **Documentation Updates** - As policies evolve

### Monitoring Metrics

1. **Query Performance** - RLS policy evaluation time
2. **Access Denials** - Failed access attempts
3. **Permission Usage** - Most used permissions
4. **Tenant Growth** - Data growth per tenant
5. **Security Events** - Unusual access patterns

## Troubleshooting

### Common Issues

1. **Policy Not Applied** - Check `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
2. **Performance Issues** - Check query plans for policy evaluation
3. **Access Denied** - Verify user roles and permissions
4. **Cross-Tenant Access** - Verify tenant_id in policies
5. **Function Errors** - Check function security definer status

### Debugging Tools

```sql
-- Check RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- List policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public';

-- Test permission function
SELECT has_permission('projects', 'view_all');

-- Check current tenant
SELECT current_user_tenant();
```

This comprehensive RLS implementation provides robust security for the multi-tenant eneas-os platform while maintaining performance and usability.
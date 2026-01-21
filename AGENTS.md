# Agents for eneas-os

## Overview

eneas-os is a multi-tenant SaaS platform for project management and CRM. This document defines the autonomous agent domains that manage specific aspects of the system.

Each agent owns a logical domain, with clear responsibilities, data boundaries, and interfaces.

---

## Domain Agents

### 1. auth-agent

**Owner**: Authentication and Identity Management

**Primary Goal**: Ensure secure user registration, authentication, and profile management with multi-tenant support.

**Context Files**:
- `context/RBACContext.tsx`
- `hooks/useAuth.ts`
- `lib/auth.ts`

**Page Components**:
- `pages/Auth.tsx`
- `pages/AcceptInvite.tsx`

**Database Tables**:
- `auth.users` (Supabase Auth)
- `profiles` (user profiles extended)
- `invitations` (team invitations)

**RPC Functions**:
- None currently

**Key Responsibilities**:
1. User registration and signup flow
2. Login and session management (email/password, magic link, OTP)
3. Profile creation and maintenance
4. Invitation token verification and acceptance
5. Tenant assignment for new users
6. Session persistence and refresh

**Critical Workflows**:

**New User Signup**:
```
User fills form → Supabase.auth.signUp()
           → Trigger creates profile
           → Trigger assigns tenant
           → Trigger creates initial role
           → Redirect to dashboard
```

**Invitation Acceptance**:
```
User clicks invite link → AcceptInvite component
                  → Verify token in invitations table
                  → User sets password
                  → Supabase.auth.signUp()
                  → Trigger assigns role from invitation
                  → Redirect to home
```

**Invariants**:
- Every authenticated user must have a profile record
- Every profile must belong to exactly one tenant
- Invitation tokens must be single-use
- Session must persist across page refreshes

**Security Constraints**:
- Email confirmation must be enforced (configurable)
- Invitation tokens must expire
- Passwords must meet minimum complexity requirements
- Profile access restricted to own user (except tenant owner/admins)

**Known Risks**:
- Profile creation trigger may fail → user stuck without profile
- Invitation flow not fully documented in schema (table missing?)
- Mock data fallback in RBACContext when profile not found

**Agent Interfaces**:
```
auth-agent → tenant-agent: Request tenant assignment for new user
auth-agent → security-agent: Request role assignment
auth-agent → project-agent: Notify on user creation
```

---

### 2. tenant-agent

**Owner**: Multi-Tenant Configuration

**Primary Goal**: Manage tenant creation, branding, feature toggles, and resource limits per organization.

**Context Files**:
- `context/TenantContext.tsx`
- `config/whitelabel.ts`

**Page Components**:
- `pages/TenantSettings.tsx`
- `components/config/GeneralSettings.tsx`

**Database Tables**:
- `tenants` (organization records)
- `tenant_config` (per-tenant settings)

**RPC Functions**:
- `get_tenant_branding()` - Retrieve branding configuration
- `create_tenant_with_config(p_name, p_slug, p_owner_id)` - Create tenant with defaults

**Key Responsibilities**:
1. Tenant creation and initialization
2. Branding configuration (colors, logos, names)
3. Feature toggles (sales_module, team_management, client_portal, notifications, ai_assistant)
4. Resource limits (max_users, max_projects, max_storage_mb)
5. Tenant-wide settings management

**Critical Workflows**:

**Tenant Creation**:
```
Owner signs up → Create tenant record
              → Create tenant_config with defaults
              → Assign owner user to tenant
              → Apply branding CSS variables
```

**Branding Application**:
```
User logs in → TenantContext loads tenant_config
            → Merge with defaults
            → Apply CSS vars to document.documentElement
            → Update document title
```

**Invariants**:
- Every tenant must have exactly one config record
- Branding must merge with defaults (no fields missing)
- CSS variables must apply before app renders
- Feature flags must be accessible to all components

**Security Constraints**:
- Users can only view their own tenant config
- Tenant owners can only modify their own tenant
- Resource limits must be enforced (not currently implemented)

**Known Risks**:
- Branding applied via direct DOM manipulation (React-specific issues)
- Tenant isolation not enforced in RLS policies (only uses auth.uid())
- Resource limits not enforced at database level

**Agent Interfaces**:
```
tenant-agent → auth-agent: Provide tenant_id for new users
tenant-agent → security-agent: Provide tenant-level permissions
tenant-agent → all agents: Provide feature flags (sales_enabled, etc.)
```

---

### 3. security-agent

**Owner**: RBAC and Access Control

**Primary Goal**: Implement granular role-based access control with role management and permission enforcement.

**Context Files**:
- `context/RBACContext.tsx`
- `types/rbac.ts`

**Page Components**:
- `components/config/RoleManagement.tsx`
- `components/config/UserManagement.tsx`

**Database Tables**:
- `roles` (role definitions)
- `permissions` (granular permissions)
- `user_roles` (user→role mappings)
- `role_permissions` (role→permission mappings)

**RPC Functions**:
- `is_admin(user_id)` - Check if user has admin privileges

**Key Responsibilities**:
1. Role management (CRUD)
2. Permission management (CRUD)
3. User role assignment
4. Access control checks (hasPermission, hasRole)
5. Security gate enforcement in UI

**Critical Workflows**:

**Permission Check**:
```
Component requests access → hasPermission(module, action)
                        → Load user roles
                        → Load permissions for roles
                        → Check if module+action exists
                        → Return true/false
                        → UI shows/hides based on result
```

**Role Assignment**:
```
Admin assigns role → Insert into user_roles
                 → Trigger validates role exists
                 → Trigger updates user permissions cache
                 → UI re-renders with new access
```

**Invariants**:
- Owner role grants all permissions implicitly
- System roles (is_system=true) cannot be deleted
- Every permission must have module and action
- Permission checks must be synchronous (no async calls in UI)

**Security Constraints**:
- Users can only assign roles they have
- Permission checks must happen server-side (RLS)
- UI gates must be backed by database policies
- Mock data fallback MUST be disabled in production

**Known Risks**:
- Mock data fallback in RBACContext (lines 39-47) creates security hole
- Permission checks are client-side only (need server RLS)
- Owner role hardcoded to grant all permissions (no granular override)
- Role changes mid-session may not reflect immediately

**Agent Interfaces**:
```
security-agent → all agents: Provide hasPermission(module, action) helper
security-agent → tenant-agent: Enforce tenant-scoped permissions
security-agent → auth-agent: Assign default role to new users
```

---

### 4. project-agent

**Owner**: Project Lifecycle Management

**Primary Goal**: Manage projects, tasks, milestones, and project-related resources.

**Context Files**:
- `context/ProjectsContext.tsx`

**Page Components**:
- `pages/Projects.tsx`
- `pages/Home.tsx` (project cards)

**Database Tables**:
- `projects` (main project entity)
- `tasks` (project tasks)
- `milestones` (project milestones)
- `activities` (project activity feed)
- `project_credentials` (service credentials for projects)

**RPC Functions**:
- None currently

**Key Responsibilities**:
1. Project CRUD operations
2. Task creation, assignment, and tracking
3. Milestone management
4. Progress calculation
5. Project credential storage
6. Activity logging for project events

**Critical Workflows**:

**Project Creation**:
```
User creates project → insert into projects table
                   → Create initial task (optional)
                   → Log activity (project_created)
                   → Create notification
                   → Realtime subscription updates UI
```

**Task Assignment**:
```
Manager assigns task → update task.assigned_to
                   → Send notification to assignee
                   → Update assignee workload
                   → Log activity (task_assigned)
```

**Progress Calculation**:
```
Tasks change → Recalculate project progress
             → Sum completed tasks / total tasks
             → Update project.progress
             → Trigger progress update event
```

**Invariants**:
- Every task must belong to a project
- Project progress must be 0-100
- Deleting project must cascade delete tasks, milestones, activities
- Activity logs must preserve who did what and when

**Security Constraints**:
- Users can only view projects they're assigned to (or all if has permission)
- Users can only edit projects they own or manage
- Project credentials must be encrypted (CURRENTLY PLAIN TEXT - SECURITY ISSUE)
- Activity logs must be append-only (cannot be modified)

**Known Risks**:
- Project credentials stored in plain text in `project_credentials.password_text`
- No dedicated FinanceContext - financial data scattered in ProjectsContext
- Progress calculation not validated (can be manually set)
- Activity and activity_logs tables both exist (redundant)

**Agent Interfaces**:
```
project-agent → crm-agent: Convert lead to project
project-agent → team-agent: Assign work to members
project-agent → finance-agent: Track project financials
project-agent → document-agent: Attach files to projects
```

---

### 5. crm-agent

**Owner**: Lead and Client Management

**Primary Goal**: Ingest leads, manage client relationships, track interactions, and convert leads to projects.

**Context Files**:
- `context/ClientsContext.tsx`
- `hooks/useLeadToProject.ts`

**Page Components**:
- `pages/Sales.tsx` (CRM, Inbox, Analytics views)
- `pages/Clients.tsx`

**Database Tables**:
- `leads` (lead management with AI analysis)
- `clients` (client entities)
- `client_messages` (communication history)
- `client_tasks` (client-specific tasks)
- `client_history` (interaction audit trail)

**RPC Functions**:
- None currently

**Key Responsibilities**:
1. Lead ingestion from web forms and manual entry
2. AI analysis of leads (category, temperature, summary, recommendation)
3. Lead status management (new → contacted → following → closed/lost)
4. Client CRUD operations
5. Communication tracking (emails, calls, meetings)
6. Lead-to-project conversion workflow

**Critical Workflows**:

**Lead Ingestion**:
```
Web form submits → Insert into leads table
                → AI analysis populates ai_analysis JSONB
                → Create notification for sales team
                → Realtime update to Sales page
```

**Lead to Project Conversion**:
```
Sales clicks "Convert" → createProject()
                       → Store lead metadata in project
                       → Update lead.status = 'closed'
                       → Store converted_to_project_id in lead
                       → Create conversion notification
                       → Redirect to Projects page
```

**AI Analysis** (NOT YET IMPLEMENTED):
```
New lead created → Call AI service (OpenAI/Anthropic?)
                 → Analyze message content
                 → Determine category (branding, web-design, etc.)
                 → Determine temperature (cold, warm, hot)
                 → Generate summary and recommendation
                 → Store in lead.ai_analysis
```

**Invariants**:
- Every lead must have a status (new, contacted, following, closed, lost)
- Every lead must have a temperature (cold, warm, hot)
- Every client must have an owner
- Lead conversion must preserve all metadata
- Communication history must be immutable

**Security Constraints**:
- Users can only view leads they own or are assigned to
- AI analysis must be rate-limited (cost control)
- Client communication history is private to owner
- Conversion creates project with proper permissions

**Known Risks**:
- AI analysis fields exist but no AI integration code found
- Lead ingestion from web forms not documented (no webhook endpoint)
- `invitations` table referenced but not in CRM schema
- No validation on lead status transitions

**Agent Interfaces**:
```
crm-agent → project-agent: Convert lead to project
crm-agent → analytics-agent: Report conversion metrics
crm-agent → team-agent: Assign leads to sales team
crm-agent → security-agent: Check CRM access permissions
```

---

### 6. finance-agent

**Owner**: Financial Tracking

**Primary Goal**: Track project financials, expenses, billing, and payment processing.

**Context Files**:
- `context/FinanceContext.tsx`

**Page Components**:
- (Dedicated Finance page doesn't exist yet)
- `components/config/PaymentSettings.tsx`

**Database Tables**:
- `finances` (canonical project financial tracking)
- `project_credentials` (payment service credentials)
- `payment_processors` (payment gateway configuration)

**RPC Functions**:
- `get_project_financial_summary(p_project_id)` - Get comprehensive financial summary

**Key Responsibilities**:
1. Project financial tracking (agreed, collected, expenses, hours)
2. Expense management (direct and imputed expenses)
3. Business model tracking (fixed, hourly, retainer)
4. Financial health calculation
5. Payment processor management
6. Billing and invoicing (not yet implemented)

**Critical Workflows**:

**Financial Tracking**:
```
Project updates finances → Update totals
                          → Recalculate health
                          → Update profit margin
                          → Trigger health change notification
```

**Payment Processing** (NOT YET IMPLEMENTED):
```
Invoice generated → Create finance record
                → Charge payment via processor
                → Update total_collected
                → Update project financial health
```

**Health Calculation**:
```
financials updated → Calculate (total_collected - direct_expenses - imputed_expenses) / total_agreed
                   → Set health field (profitable, break-even, loss)
                   → Visual indicator in UI
```

**Invariants**:
- Every project must have financial records
- Health must be one of: profitable, break-even, loss
- Expenses must be tracked as direct or imputed
- Financial records must be append-only (cannot modify history)

**Security Constraints**:
- Financial data accessible only to Finance role and Owner
- Payment processor credentials must be encrypted
- Audit trail for all financial changes
- No manual override of calculated health

**Known Risks**:
- Payment processing not implemented (only configuration)
- No invoicing system
- Project credentials stored in plain text (shared security issue)

**Agent Interfaces**:
```
finance-agent → project-agent: Report financial health per project
finance-agent → analytics-agent: Aggregate financial metrics
finance-agent → security-agent: Enforce finance permissions
```

---

### 7. calendar-agent

**Owner**: Scheduling and Events

**Primary Goal**: Manage calendar events, task scheduling, reminders, and attendee coordination.

**Context Files**:
- `context/CalendarContext.tsx`

**Page Components**:
- `pages/Calendar.tsx`

**Database Tables**:
- `calendar_events` (meetings, work blocks, deadlines)
- `calendar_tasks` (scheduled tasks with drag-drop)
- `event_attendees` (event participants)
- `calendar_reminders` (notification triggers)
- `calendar_labels` (tags/categories)

**RPC Functions**:
- None currently

**Key Responsibilities**:
1. Event creation and management
2. Task scheduling with time blocks
3. Recurring event support
4. Attendee management and RSVP
5. Reminder configuration
6. Drag-and-drop task scheduling
7. Calendar integration (not yet implemented)

**Critical Workflows**:

**Event Creation**:
```
User creates event → Insert into calendar_events
                  → Add attendees to event_attendees
                  → Set up reminders
                  → Send notifications to attendees
                  → Update calendar UI
```

**Task Scheduling**:
```
User drags task → Update calendar_tasks.start_date, order_index
                  → Recalculate conflicts
                  → Update project task schedule
                  → Send notification to assignee
```

**Reminder Trigger**:
```
Event time approaches → Check calendar_reminders
                    → Calculate trigger time (event - minutes_before)
                    → Send notification (or email)
                    → Mark reminder as sent
```

**Invariants**:
- Every event must have at least one organizer attendee
- Recurring events must follow RFC 5545 (not yet implemented)
- Tasks cannot overlap (validation not yet implemented)
- Reminders must fire before event time

**Security Constraints**:
- Users can only view their own events
- Event creators can edit/cancel
- Attendees can RSVP but cannot edit
- Private events (not yet implemented) hide from non-attendees

**Known Risks**:
- No conflict detection for overlapping events/tasks
- Recurring events not implemented (only placeholder field)
- No calendar integration (Google, Outlook, etc.)
- Drag-drop order_index not validated at DB level
- Reminders trigger via client-side polling (inefficient)

**Agent Interfaces**:
```
calendar-agent → team-agent: Check attendee availability
calendar-agent → project-agent: Link events to projects
calendar-agent → notifications-agent: Trigger event reminders
```

---

### 8. document-agent

**Owner**: File and Document Management

**Primary Goal**: Manage documents, folders, file storage, sharing, and document versioning.

**Context Files**:
- `context/DocumentsContext.tsx`

**Page Components**:
- `pages/Docs.tsx`

**Database Tables**:
- `documents` (document metadata)
- (Folders not in current schema - only folder field in documents table)

**Storage**:
- Supabase Storage bucket: 'documents'

**RPC Functions**:
- None currently

**Key Responsibilities**:
1. Document CRUD operations (create, edit, delete)
2. Folder organization
3. File upload and storage management
4. Document tagging and search
5. Pinning and archiving
6. Sharing (not yet implemented)

**Critical Workflows**:

**Document Creation**:
```
User creates doc → Insert into documents (metadata)
                 → Upload file to storage (if applicable)
                 → Apply tags
                 → Set folder
                 → Update document list UI
```

**File Upload**:
```
User selects file → Upload to storage.documents bucket
                 → Get file URL
                 → Create documents record with URL
                 → Track storage usage
                 → Check tenant limits
```

**Document Search**:
```
User searches → Query documents table by title/content/tags
              → Filter by folder
              → Sort by date, pinned status
              → Return results
```

**Invariants**:
- Every document must have an owner
- Storage usage must be tracked per tenant
- Deleted documents must be removed from storage
- Folder names must be unique per owner (not enforced)

**Security Constraints**:
- Users can only access their own documents
- Folder structure cannot be accessed by other tenants
- Public sharing requires explicit permission (not yet implemented)
- Storage limits must be enforced (not yet implemented)

**Known Risks**:
- Folders implemented as text field, not separate table (no nested folders)
- No document versioning (only one version per document)
- No collaborative editing
- Storage limits not enforced at database level
- No file type validation on upload

**Agent Interfaces**:
```
document-agent → project-agent: Attach documents to projects
document-agent → tenant-agent: Report storage usage
document-agent → security-agent: Enforce document access
```

---

### 9. team-agent

**Owner**: Collaboration and Notifications

**Primary Goal**: Manage team members, workloads, notifications, and activity tracking.

**Context Files**:
- `context/TeamContext.tsx`
- `context/NotificationsContext.tsx`

**Page Components**:
- `pages/Team.tsx`
- `components/NotificationBell.tsx`

**Database Tables**:
- `notifications` (user alerts)
- `activity_logs` (audit trail)
- `activities` (general activity feed)
- `messages` (message inbox)
- `quick_hits` (quick action items)
- `profiles` (read-only team member info)

**RPC Functions**:
- `create_notification(p_user_id, p_type, p_title, p_message, p_link, p_metadata)` - Create user notification

**Key Responsibilities**:
1. Team member management (invite, edit roles, suspend)
2. Workload assignment and tracking
3. Notification delivery and management
4. Activity logging and audit trail
5. Message inbox management
6. Quick hits (micro-tasks) management

**Critical Workflows**:

**Team Invitation**:
```
Admin invites user → Create invitation record
                 → Generate unique token
                 → Send email with token
                 → Track invitation status
```

**Notification Delivery**:
```
Event occurs → call create_notification()
            → Insert into notifications table
            → Realtime push to user
            → Update NotificationBell badge
            → User marks as read
```

**Workload Tracking**:
```
Task assigned → Calculate assignee's total assigned tasks
              → Calculate pending tasks
              → Update member.workload
              → Display in Team page
```

**Invariants**:
- Every user must belong to a team (via tenant)
- Every notification must have a recipient
- Activity logs must be immutable (append-only)
- Notification read status must be tracked

**Security Constraints**:
- Users can only view their own team members (same tenant)
- Notifications accessible only to recipient
- Activity logs accessible only to tenant members
- Only admins can send team-wide notifications

**Known Risks**:
- `activities` and `activity_logs` both exist (redundant)
- No email service configured for invitations
- Notification batching not implemented (spam risk)
- Workload calculation not optimized (expensive queries)
- No read receipts or notification delivery confirmation

**Agent Interfaces**:
```
team-agent → security-agent: Check team management permissions
team-agent → project-agent: Report member assignments
team-agent → calendar-agent: Check availability
team-agent → all agents: Deliver domain-specific notifications
```

---

### 10. analytics-agent

**Owner**: Metrics and Insights

**Primary Goal**: Track web analytics, aggregate metrics, calculate KPIs, and generate insights.

**Context Files**:
- (Not yet created - inline in pages)

**Page Components**:
- `pages/Sales.tsx` (analytics view)
- `pages/Home.tsx` (KPI cards)

**Database Tables**:
- `web_analytics` (web traffic metrics)
- `analytics_metrics` (general metrics)
- `quick_hits` (tracked quick actions)

**RPC Functions**:
- None currently

**Key Responsibilities**:
1. Web analytics tracking (visits, bounce rate, conversions)
2. Daily/weekly/monthly metric aggregation
3. KPI calculation (productivity, conversion rate, etc.)
4. Insight generation (AI-powered, not yet implemented)
5. Report generation (not yet implemented)

**Critical Workflows**:

**Analytics Tracking**:
```
Page visit → Update web_analytics
          → Increment total_visits
          → Check unique visitor
          → Update top_pages
          → Recalculate bounce_rate
```

**Metric Aggregation**:
```
Daily job runs → Sum metrics by date
               → Store in analytics_metrics
               → Calculate trends
               → Update dashboard charts
```

**KPI Calculation**:
```
Metrics loaded → Calculate conversion_rate (conversions / visits)
             → Calculate productivity (tasks_completed / hours_worked)
             → Calculate response_time (lead to first contact)
             → Update Home dashboard
```

**Invariants**:
- Analytics must be aggregated daily
- Historical data must be preserved
- KPI calculations must be deterministic
- Top pages must reflect actual visits

**Security Constraints**:
- Analytics accessible only to users with analytics permissions
- Cannot delete historical data
- Cannot manually override calculated metrics

**Known Risks**:
- No scheduled aggregation job (data may not be summarized)
- No data retention policy (unlimited growth)
- Web analytics not integrated with external tracking (Google Analytics, etc.)
- AI insights not implemented (placeholder fields exist)
- No real-time analytics (delayed until aggregation)

**Agent Interfaces**:
```
analytics-agent → crm-agent: Provide conversion metrics
analytics-agent → project-agent: Provide productivity KPIs
analytics-agent → finance-agent: Provide financial reports
```

---

## Cross-Agent Communication Matrix

```
┌──────────────┬─────────────────────────────────────────────────────────────────────┐
│              │ auth  │tenant │security│project│ crm   │finance│calendar│doc   │team   │analytics
├──────────────┼─────────────────────────────────────────────────────────────────────┤
│ auth         │       │tenant  │role    │notify  │        │        │        │team   │        │
│              │       │assign  │assign  │on-create│        │        │        │assign │        │
├──────────────┼─────────────────────────────────────────────────────────────────────┤
│ tenant       │       │        │tenant- │feature │feature │feature │feature │feature│feature │
│              │       │        │scoped  │flags   │flags   │flags   │flags  │flags  │flags   │
├──────────────┼─────────────────────────────────────────────────────────────────────┤
│ security     │       │        │        │project │crm     │finance │calendar│doc    │team   │analytics│
│              │       │        │        │perms   │perms   │perms   │perms  │perms  │perms   │
├──────────────┼─────────────────────────────────────────────────────────────────────┤
│ project      │notify │        │check   │        │convert │financial│link   │assign │metrics │
│              │assign │        │perms   │        │lead    │data    │events │work   │data    │
├──────────────┼─────────────────────────────────────────────────────────────────────┤
│ crm          │       │        │check   │convert │        │        │        │client │assign │lead    │
│              │       │        │perms   │project │        │        │        │tasks  │leads  │metrics │
├──────────────┼─────────────────────────────────────────────────────────────────────┤
│ finance      │       │        │check   │report  │        │        │        │        │team   │reports │
│              │       │        │perms   │health  │        │        │        │        │workload│       │
├──────────────┼─────────────────────────────────────────────────────────────────────┤
│ calendar     │       │        │        │link    │        │        │        │        │check  │        │
│              │       │        │        │project │        │        │        │        │avail  │        │
├──────────────┼─────────────────────────────────────────────────────────────────────┤
│ document     │       │storage │check   │attach  │        │        │        │        │        │        │
│              │       │report  │perms   │project │        │        │        │        │        │        │
├──────────────┼─────────────────────────────────────────────────────────────────────┤
│ team         │assign │        │check   │assign  │assign  │        │check   │        │        │metrics │
│              │member │        │perms   │work    │leads   │        │avail  │        │        │        │
├──────────────┼─────────────────────────────────────────────────────────────────────┤
│ analytics    │       │        │        │metrics │metrics │reports │        │        │metrics │        │
│              │       │        │        │data    │data    │data    │        │        │data    │        │
└──────────────┴─────────────────────────────────────────────────────────────────────┘
```

---

## Shared Infrastructure

### Global Context Provider Stack
```
ErrorBoundary
  └── RBACProvider
        └── TenantProvider
              └── NotificationsProvider
                    └── TeamProvider
                          └── ClientsProvider
                                └── CalendarProvider
                                      └── DocumentsProvider
                                            └── ProjectsProvider
                                                  └── AppContent (Pages)
```

### Shared Utilities
- `lib/supabase.ts` - Supabase client initialization
- `lib/auth.ts` - Authentication utilities
- `lib/activity.ts` - Activity logging helper
- `lib/errorLogger.ts` - Debugging and error tracking
- `hooks/useSupabase.ts` - Generic CRUD hook with realtime

### Shared Components
- `components/Layout.tsx` - Main shell with navigation
- `components/TopNavbar.tsx` - Global actions header
- `components/ErrorBoundary.tsx` - Error catching
- `components/DebugPanel.tsx` - Developer tools

---

## Implementation Priority

### Phase 1: Foundation (Critical)
1. **security-agent**: Fix mock data fallback, implement RLS enforcement
2. **auth-agent**: Complete profile creation flow, fix invitation schema
3. **tenant-agent**: Implement tenant isolation enforcement

### Phase 2: Core Features
4. **project-agent**: Implement dedicated FinanceContext, fix credential encryption
5. **crm-agent**: Implement AI integration for lead analysis
6. **team-agent**: Implement email service for invitations

### Phase 3: Advanced Features
7. **finance-agent**: Implement payment processing and invoicing
8. **calendar-agent**: Implement recurring events and conflict detection
9. **document-agent**: Implement folder structure and versioning

### Phase 4: Analytics & Insights
10. **analytics-agent**: Implement scheduled aggregation and AI insights

---

## Known System-Level Issues

### Security Issues
1. **Plain text passwords** in `project_credentials.password_text` - MUST encrypt
2. **Mock data fallbacks** in RBACContext - MUST disable in production
3. **No RLS enforcement** for tenant isolation - MUST implement
4. **Client-side only** permission checks - MUST add server-side validation

### Data Model Issues
5. **Duplicate tables**: `activities` vs `activity_logs` (finances table issue resolved)
6. **Missing schema**: `invitations` table not defined (referenced in code)
7. **Unused imports**: Firebase imported but never used
8. **Folders as text field**: Should be separate table for nested structure

### Feature Gaps
9. **AI not implemented**: Lead analysis fields exist but no integration
10. **Email service missing**: Invitations and magic links not configured
11. **Payment processing**: Only configuration, no actual processing
12. **Calendar integration**: No Google/Outlook sync
13. **Document versioning**: No history or collaborative editing
14. **Data retention**: No policy for cleaning old data
15. **Resource limits**: Not enforced at database level

---

## Questions Requiring Answers

Before implementing autonomous agents, these questions MUST be answered:

1. **Multi-Tenant Strategy**: Single-DB multi-tenant or multi-instance (separate DB per tenant)?
2. **AI Integration**: Which AI service? OpenAI, Anthropic, local LLM? API keys location?
3. **Security Stance**: Are mock fallbacks intentional for demo or production bug?
4. **Email Provider**: What email service? SendGrid, Resend, AWS SES, Supabase Email?
5. **Finance Tables**: Which is canonical? `finances` or `finance_records`?
6. **Storage Costs**: Who pays? Tenant billing or platform operator?
7. **Migration Status**: Are all migration files in `/migrations` applied to production?
8. **Deployment**: Vercel, Netlify, Docker, Kubernetes?
9. **Data Retention**: What's the policy for old leads, activities, notifications?
10. **Rate Limiting**: Are there public API limits for lead ingestion?

---

## Version History

- **v1.0** (2026-01-19): Initial agent structure definition based on comprehensive system analysis

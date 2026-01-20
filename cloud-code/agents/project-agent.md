# Project Agent

## Identity
| Field | Value |
|-------|-------|
| Name | project-agent |
| Type | Domain Specialist |
| Status | ⚠️ Limited |
| Mode | Read-Validate |
| Blocker | Credentials access blocked |

## Purpose

Manages project lifecycle including creation, task management, milestones, and project-level settings.

## Responsibilities

- ✅ Project CRUD operations
- ✅ Task management (create, assign, update, complete)
- ✅ Milestone tracking
- ✅ Project status transitions
- ⚠️ Project credentials (data only, security blocked)

## Non-Responsibilities

- ❌ Lead management (pre-conversion) → crm-agent
- ❌ Financial calculations → finance-agent
- ❌ Credential encryption → security-agent
- ❌ Calendar events → calendar-agent

## Allowed Actions

| Action | Status |
|--------|--------|
| Read projects | ✅ Yes |
| Read tasks | ✅ Yes |
| Read milestones | ✅ Yes |
| Write projects | ✅ Yes |
| Write tasks | ✅ Yes |
| Write milestones | ✅ Yes |
| Access credentials | 🚫 Blocked |

## Data Access

| Table | Access |
|-------|--------|
| projects | Read, Write |
| tasks | Read, Write |
| milestones | Read, Write |
| project_credentials | 🚫 Blocked |

## Invariants

1. Project must belong to valid tenant
2. Task must belong to valid project
3. Status transitions follow defined workflow
4. Assignee must belong to same tenant
5. Deleted projects cascade appropriately

## Project Status State Machine

```
┌─────────┐
│  draft  │
└────┬────┘
     │
     ▼
┌─────────┐     ┌─────────┐
│ active  │────►│ on_hold │
└────┬────┘     └────┬────┘
     │               │
     ▼               │
┌─────────┐          │
│completed│◄─────────┘
└─────────┘

     │ (any state)
     ▼
┌─────────┐
│cancelled│
└─────────┘
```

## Task Status State Machine

```
todo → in_progress → review → done
                       │
                       └──► blocked
```

## Key Workflows

### Create Project (from Lead)
```
1. Receive conversion data from crm-agent (via core-guardian)
2. Validate required fields
3. Create project with tenant_id
4. Create default milestones (if template exists)
5. Notify team-agent to log activity
6. Return project_id to crm-agent
```

### Assign Task
```
1. Verify project exists and user has access
2. Verify assignee belongs to same tenant
3. Create task with assignee_id
4. Request team-agent to notify assignee
5. Log activity
```

## Testing Requirements

- Tenant isolation on all operations
- Status transition validation
- Task-project relationship integrity
- Assignee tenant validation
- Cascade behavior on deletion
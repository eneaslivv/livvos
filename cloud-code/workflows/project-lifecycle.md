# Workflow: Lead to Project Conversion

## Overview

Converts a qualified lead into a new project, coordinating between crm-agent and project-agent.

## Status

⚠️ **BLOCKED** - Lead status rules undefined

## Trigger

- Manual: User clicks "Convert to Project" button
- Automated: (Future) Lead reaches certain score

## Agents Involved

| Agent | Role |
|-------|------|
| crm-agent | Initiator, lead validation |
| core-guardian | Coordinator, approval |
| project-agent | Project creation |
| team-agent | Notifications, logging |

## Prerequisites

- Lead must exist and belong to user's tenant
- Lead status must be 'qualified' or 'proposal' (TBD)
- User must have 'convert_lead' permission
- Required lead fields must be populated

## Workflow Steps

```
┌─────────────────────────────────────────┐
│ 1. User initiates conversion            │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 2. crm-agent validates lead             │
│    - Check status is valid              │
│    - Check required fields              │
│    - Check user permissions             │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 3. crm-agent prepares project data      │
│    - Map lead fields to project         │
│    - Generate project name              │
│    - Set default values                 │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 4. core-guardian requests approval      │
│    - Create approval notification       │
│    - Wait for human response            │
└─────────────────┬───────────────────────┘
                  │
         ┌───────┴───────┐
         │               │
      [Approved]      [Rejected]
         │               │
         ▼               ▼
┌─────────────┐   ┌─────────────┐
│ 5a. Execute │   │ 5b. Cancel  │
│ conversion  │   │ Log reason  │
└─────────────┬──┘   └──────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 6. project-agent creates project        │
│    - Insert project record              │
│    - Create default milestones          │
│    - Return project_id                  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 7. crm-agent updates lead               │
│    - Set status = 'converted'           │
│    - Store project_id reference         │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 8. team-agent notifications             │
│    - Notify project owner               │
│    - Log activity                       │
└─────────────────────────────────────────────┘
```

## Data Mapping

| Lead Field | Project Field |
|------------|---------------|
| name | name |
| client_id | client_id |
| description | description |
| budget | budget |
| tenant_id | tenant_id |
| assigned_to | owner_id |

## Error Handling

| Error | Action |
|-------|--------|
| Lead not found | Return error, no changes |
| Invalid status | Return error with valid statuses |
| Permission denied | Return 403, log attempt |
| Project creation fails | Rollback, keep lead unchanged |
| Notification fails | Log warning, continue |

## Rollback Strategy

If any step after approval fails:
1. Delete created project (if any)
2. Keep lead in original state
3. Log failure reason
4. Notify user of failure

## Testing Requirements

- Happy path end-to-end
- Invalid lead status rejection
- Permission denial
- Project creation failure rollback
- Notification failure handling

---

# FILE: cloud-code/workflows/user-onboarding.md

```markdown
# Workflow: User Onboarding

## Overview

Handles new user registration and setup, either via invitation or direct sign-up.

## Status

⚠️ **PARTIALLY BLOCKED** - Invitations schema unclear

## Triggers

- Invitation acceptance (clicking invite link)
- Direct sign-up (registration form)

## Agents Involved

| Agent | Role |
|-------|------|
| auth-agent | Authentication, profile creation |
| tenant-agent | Tenant assignment |
| security-agent | Role assignment |
| team-agent | Welcome notification |

## Flow A: Invitation Acceptance

```
┌─────────────────────────────────────────┐
│ 1. User clicks invitation link          │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 2. auth-agent validates invitation      │
│    - Check token exists                 │
│    - Check not expired                  │
│    - Check not used                     │
└─────────────────┬───────────────────────┘
                  │
         ┌───────┴───────┐
         │               │
      [Valid]       [Invalid]
         │               │
         ▼               ▼
┌─────────────┐   ┌─────────────┐
│ Continue    │   │ Show error  │
└─────────────┘   └─────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 3. User completes registration form     │
│    - Name, password, etc.               │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 4. auth-agent creates auth.user         │
│    (via Supabase Auth)                  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 5. auth-agent creates profile           │
│    - Link to auth.user                  │
│    - Copy data from invitation          │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 6. tenant-agent assigns tenant          │
│    - Use tenant_id from invitation      │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 7. security-agent assigns role          │
│    - Use role from invitation OR        │
│    - Assign default 'member' role       │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 8. auth-agent marks invitation used     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 9. team-agent sends welcome             │
│    - Create notification                │
│    - (Future) Send welcome email        │
└─────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 10. Redirect to dashboard               │
└─────────────────────────────────────────────┘
```

## Flow B: Direct Sign-Up

Similar but:
- No invitation validation
- Tenant assignment may require additional step (select/create tenant)
- Default role assigned

## Error Handling

| Error | Action |
|-------|--------|
| Expired invitation | Show expiry message, offer to request new |
| Used invitation | Show error, suggest login |
| Email already exists | Redirect to login |
| Supabase Auth error | Show generic error, log details |

## Testing Requirements

- Valid invitation acceptance
- Expired invitation rejection
- Profile creation verification
- Tenant assignment verification
- Role assignment verification
- Welcome notification delivery

---

# FILE: cloud-code/workflows/project-lifecycle.md

```markdown
# Workflow: Project Lifecycle

## Overview

Manages project state transitions from creation to completion or cancellation.

## Status

✅ **ACTIVE** (core flow documented)

## Agents Involved

| Agent | Role |
|-------|------|
| project-agent | Primary owner |
| team-agent | Notifications |
| finance-agent | Financial tracking (read-only) |

## State Machine

```
                    ┌─────────┐
                    │  draft  │
                    └────┬────┘
                         │ activate
                         ▼
    ┌─────────────────────────────────────┐
    │              active                │
    └─────┬─────────────────────┬───────┘
            │ pause              │ complete
            ▼                    │
    ┌─────────────┐          │
│   on_hold   │───────────────┤
    └─────────────┘
                         │ resume     │
    ┌─────────┐
    │ completed │◄─────────┘
    └─────────┘
     │ (any state)
     ▼ cancel
            ▼
    ┌─────────────┐
    │ cancelled │
    └─────────┘
```

## Transitions

| From | To | Trigger | Conditions |
|------|-----|---------|------------|
| draft | active | activate | Required fields complete |
| active | on_hold | pause | Reason provided |
| on_hold | active | resume | None |
| active | completed | complete | All tasks done (optional) |
| * (not completed) | cancelled | cancel | Reason provided |

## Workflow: Activate Project

```
1. Validate project is in 'draft' status
2. Validate required fields are complete
3. Update status to 'active'
4. Set activated_at timestamp
5. Notify team members
6. Log activity
```

## Workflow: Complete Project

```
1. Validate project is 'active' or 'on_hold'
2. (Optional) Check all tasks are done
3. Update status to 'completed'
4. Set completed_at timestamp
5. Notify stakeholders
6. Log activity
7. Trigger financial summary (future)
```

## Workflow: Cancel Project

```
1. Validate project is not 'completed'
2. Require cancellation reason
3. Update status to 'cancelled'
4. Set cancelled_at timestamp
5. Store cancellation reason
6. Notify stakeholders
7. Log activity
```

## Notifications

| Transition | Recipients | Message |
|------------|------------|---------|
| → active | Team members | "Project X has been activated" |
| → on_hold | Team members | "Project X is on hold: {reason}" |
| → completed | All stakeholders | "Project X has been completed" |
| → cancelled | All stakeholders | "Project X has been cancelled: {reason}" |

## Testing Requirements

- All valid transitions
- Invalid transition rejection
- Timestamp updates
- Notification delivery
- Activity logging
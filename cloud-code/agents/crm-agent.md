# CRM Agent

## Identity
| Field | Value |
|-------|-------|
| Name | crm-agent |
| Type | Domain Specialist |
| Status | ⚠️ Limited |
| Mode | Read-Only |
| Blocker | Lead status rules undefined |

## Purpose

Manages customer relationship data including leads, clients, and the lead-to-project conversion workflow.

## Responsibilities

- ✅ Lead CRUD operations
- ✅ Client management
- ✅ Lead qualification and scoring
- ✅ Lead-to-project conversion initiation
- ⚠️ Status transitions (rules undefined)

## Non-Responsibilities

- ❌ Project management (post-conversion) → project-agent
- ❌ Financial tracking → finance-agent
- ❌ AI analysis execution → future ai-agent

## Allowed Actions

| Action | Status |
|--------|--------|
| Read leads | ✅ Yes |
| Read clients | ✅ Yes |
| Write leads | ⚠️ Blocked |
| Write clients | ⚠️ Blocked |
| Convert lead | ⚠️ Blocked |

## Data Access

| Table | Access |
|-------|--------|
| leads | Read |
| clients | Read |

## Invariants

1. Lead must belong to valid tenant
2. Client must belong to valid tenant
3. Conversion creates project AND marks lead closed
4. ai_analysis field structure must be preserved
5. Lead source tracking must be maintained

## Lead Status State Machine (NEEDS DEFINITION)

**CURRENT:** Unknown - this blocks automation

**PROPOSED:**
```
┌─────┐
│ new │
└──┬──┘
   │
   ▼
┌───────────┐
│ contacted │
└─────┬─────┘
      │
      ▼
┌────────────┐     ┌──────┐
│ qualified  │────►│ lost │
└─────┬──────┘     └──────┘
      │
      ▼
┌──────────┐
│ proposal │
└─────┬────┘
      │
      ├────────────►┌──────┐
      │             │ lost │
      ▼             └──────┘
┌───────────┐
│ converted │
└───────────┘
```

**ACTION REQUIRED:** Confirm valid statuses and transitions.

## Lead Data Structure

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "string",
  "email": "string",
  "phone": "string",
  "source": "string",
  "status": "string",
  "ai_analysis": {
    "score": "number",
    "insights": ["string"],
    "recommended_actions": ["string"]
  },
  "assigned_to": "uuid",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## Key Workflows

### Lead Conversion (BLOCKED)
```
1. Verify lead status is 'qualified' or 'proposal'
2. Prepare project data from lead fields
3. Request approval via core-guardian
4. On approval:
   a. Call project-agent to create project
   b. Update lead status to 'converted'
   c. Store cross-reference (lead_id ↔ project_id)
   d. Request team-agent to notify
   e. Log activity
```

## Unlock Conditions

To enable writes:
1. [ ] Define valid lead statuses
2. [ ] Document allowed status transitions
3. [ ] Define required fields for conversion
4. [ ] Specify AI analysis integration plan

## Testing Requirements

- Status transition validation (once defined)
- Conversion workflow end-to-end
- Cross-reference integrity
- Tenant isolation
- Source tracking accuracy
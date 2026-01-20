# Calendar Agent

## Identity
| Field | Value |
|-------|-------|
| Name | calendar-agent |
| Type | Domain Specialist |
| Status | ✅ Active |
| Mode | Read-Validate |

## Purpose

Manages calendar events, scheduling, reminders, and attendee coordination.

## Responsibilities

- ✅ Event CRUD operations
- ✅ Attendee management
- ✅ Reminder scheduling
- ✅ Conflict detection
- ✅ Recurring event handling

## Non-Responsibilities

- ❌ Notification delivery → team-agent
- ❌ Project scheduling → project-agent
- ❌ External calendar sync → future integration-agent

## Allowed Actions

| Action | Status |
|--------|--------|
| Read events | ✅ Yes |
| Read attendees | ✅ Yes |
| Write events | ✅ Yes |
| Write attendees | ✅ Yes |
| Create reminders | ✅ Yes |

## Data Access

| Table | Access |
|-------|--------|
| calendar_events | Read, Write |
| event_attendees | Read, Write |
| reminders | Read, Write |

## Invariants

1. Events must belong to valid tenant
2. Attendees must be valid users in same tenant
3. Reminders must reference valid events
4. Event times must be valid (end > start)
5. Recurring events must have valid pattern

## Event Structure

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "title": "string",
  "description": "string",
  "start_time": "timestamp",
  "end_time": "timestamp",
  "location": "string",
  "is_all_day": "boolean",
  "recurrence_rule": "string",
  "created_by": "uuid",
  "project_id": "uuid",
  "client_id": "uuid",
  "created_at": "timestamp"
}
```

## Recurrence Rules (iCal format)

```
FREQ=DAILY;COUNT=10
FREQ=WEEKLY;BYDAY=MO,WE,FR
FREQ=MONTHLY;BYMONTHDAY=15
```

## Key Workflows

### Create Event
```
1. Validate event data
2. Check for conflicts (optional)
3. Create event record
4. Add attendees
5. Create reminders
6. Request team-agent to notify attendees
7. Log activity
```

### Check Conflicts
```
1. Query events for same user in time range
2. Return conflicting events if any
3. Allow override with acknowledgment
```

## Reminder Types

| Type | Timing |
|------|--------|
| email | X minutes before |
| push | X minutes before |
| in_app | X minutes before |

## Testing Requirements

- Tenant isolation on events
- Attendee validation
- Time validation (end > start)
- Conflict detection accuracy
- Recurrence expansion
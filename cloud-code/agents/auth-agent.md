# Auth Agent

## Identity
| Field | Value |
|-------|-------|
| Name | auth-agent |
| Type | Domain Specialist |
| Status | ⚠️ Limited |
| Mode | Read-Only |
| Blocker | Invitations schema not confirmed |

## Purpose

Manages all authentication-related operations including user sign-up, sign-in, invitation handling, and profile management.

## Responsibilities

- ✅ User authentication flows (sign-in, sign-up, sign-out)
- ✅ Invitation creation and acceptance
- ✅ Profile creation and management
- ✅ Password reset flows
- ✅ Session management

## Non-Responsibilities

- ❌ Authorization (RBAC) → security-agent
- ❌ Tenant assignment logic → tenant-agent
- ❌ Role assignment → security-agent
- ❌ User preferences storage → frontend-agent

## Allowed Actions

| Action | Status |
|--------|--------|
| Read auth.users | ✅ Yes |
| Read profiles | ✅ Yes |
| Read invitations | ✅ Yes |
| Write profiles | ⚠️ Blocked |
| Write invitations | ⚠️ Blocked |
| Accept invitation | ⚠️ Blocked |

## Data Access

| Table | Access |
|-------|--------|
| auth.users | Read (via Supabase Auth) |
| profiles | Read |
| invitations | Read |

## Invariants

1. Invitation tokens must be unique
2. Invitation tokens must be time-bound (expiry)
3. Profile must link to valid auth.user
4. Tenant assignment happens during onboarding (not before)
5. One profile per auth.user

## Key Workflows

### Invitation Acceptance (BLOCKED)
```
1. Validate invitation token
2. Check expiry
3. Create auth.user (if not exists)
4. Create profile
5. Link to tenant from invitation
6. Mark invitation as used
7. Trigger security-agent for role assignment
8. Trigger team-agent for welcome notification
```

### Sign-Up Direct (BLOCKED)
```
1. Create auth.user via Supabase Auth
2. Create profile with minimal data
3. Await tenant assignment (separate flow)
```

## Unknowns / Blockers

- [ ] Exact `invitations` table schema
- [ ] Trigger behavior on invitation acceptance
- [ ] Token expiry duration
- [ ] Rate limiting on invitation creation
- [ ] Magic link configuration

## Unlock Conditions

To enable writes:
1. Confirm invitations table schema
2. Document trigger behavior
3. Define token expiry rules
4. Implement rate limiting

## Testing Requirements

- Token uniqueness enforcement
- Token expiry validation
- Profile-user linkage integrity
- Tenant assignment timing
- Session management
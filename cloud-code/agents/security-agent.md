# Security Agent

## Identity
| Field | Value |
|-------|-------|
| Name | security-agent |
| Type | Domain Specialist |
| Status | 🚫 Blocked |
| Mode | Read-Only |
| Blocker | Plain-text credentials in project_credentials |

## Purpose

Enforces RBAC, manages RLS policies, handles credential security, and maintains audit logs for security-relevant operations.

## Responsibilities

- ✅ RBAC enforcement (roles, permissions)
- ✅ RLS policy validation
- ✅ Permission checking
- ⚠️ Credential encryption/decryption (BLOCKED)
- ✅ Security audit logging

## Non-Responsibilities

- ❌ Authentication → auth-agent
- ❌ User profiles → auth-agent
- ❌ Domain business rules → domain agents

## Allowed Actions

| Action | Status |
|--------|--------|
| Read roles | ✅ Yes |
| Read permissions | ✅ Yes |
| Read user_roles | ✅ Yes |
| Validate permissions | ✅ Yes |
| Write roles | 🚫 Blocked |
| Write permissions | 🚫 Blocked |
| Access credentials | 🚫 Blocked |

## Data Access

| Table | Access |
|-------|--------|
| roles | Read |
| permissions | Read |
| user_roles | Read |
| role_permissions | Read |
| activity_logs | Read, Append |
| project_credentials | 🚫 Blocked |

## Invariants

1. All data access must pass RBAC check
2. Tenant isolation must be enforced at ALL times
3. No plain-text secrets in production
4. Audit logs are immutable (append-only)
5. Role assignment respects tenant boundaries
6. Owner role exists in every tenant

## Permission Check Flow

```
Request arrives
    │
    ▼
Extract user_id, tenant_id
    │
    ▼
Query user_roles WHERE user_id AND tenant_id
    │
    ▼
Query role_permissions for user's roles
    │
    ▼
Check if required permission exists
    │
    ├── Yes → Allow
    └── No → Deny
```

## RBAC Structure

```
User → UserRole → Role → RolePermission → Permission

Tables:
- users (auth.users)
- user_roles (user_id, role_id, tenant_id)
- roles (id, name, is_system, tenant_id)
- role_permissions (role_id, permission_id)
- permissions (id, name, resource, action)
```

## Critical Blocker: Credentials

**Current State:** `project_credentials` stores credentials in plain text.

**Required Before Unblocking:**
1. [ ] Design encryption strategy (AES-256 / Vault / External)
2. [ ] Encrypt all existing credentials
3. [ ] Implement encryption/decryption layer
4. [ ] Audit all credential access points
5. [ ] Add credential access logging
6. [ ] Test encryption in all scenarios

**Credential Handling (FUTURE):**
```
Store: plaintext → encrypt → store ciphertext
Retrieve: ciphertext → decrypt → return to authorized user
NEVER: log credentials, cache decrypted, transmit unencrypted
```

## Testing Requirements

- Permission check accuracy: 100%
- Tenant isolation: All scenarios pass
- Role assignment validation
- Audit log immutability
- RLS policy enforcement
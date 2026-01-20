# Skill: Database Migration Design

## Purpose

Design and validate database migrations ensuring data integrity, backward compatibility, and safe rollback.

## When to Activate

- When schema changes are needed
- Before applying migrations
- When planning data transformations
- During architecture changes

## Migration Principles

1. **Always reversible** - Every migration must have a rollback
2. **Non-destructive** - Never delete data without backup
3. **Backward compatible** - Old code should work during deploy
4. **Tested** - Run on copy of production data first
5. **Documented** - Clear description of changes

## Migration Checklist

### Before Writing

- [ ] Understand current schema
- [ ] Identify all affected tables
- [ ] Check for foreign key dependencies
- [ ] Estimate data volume impact
- [ ] Plan rollback strategy

### Writing Migration

- [ ] Use transactional DDL
- [ ] Add IF EXISTS / IF NOT EXISTS
- [ ] Handle NULL values explicitly
- [ ] Set appropriate defaults
- [ ] Consider index impact

### Before Applying

- [ ] Test on development
- [ ] Test on staging with production data copy
- [ ] Verify rollback works
- [ ] Check query performance
- [ ] Coordinate with team

### After Applying

- [ ] Verify data integrity
- [ ] Check application functionality
- [ ] Monitor performance
- [ ] Update documentation

## Templates

### Add Column
```sql
-- Up
ALTER TABLE {table}
ADD COLUMN IF NOT EXISTS {column} {type} DEFAULT {value};

-- Down
ALTER TABLE {table}
DROP COLUMN IF EXISTS {column};
```

### Rename Column
```sql
-- Up
ALTER TABLE {table}
RENAME COLUMN {old_name} TO {new_name};

-- Down
ALTER TABLE {table}
RENAME COLUMN {new_name} TO {old_name};
```

### Add Index
```sql
-- Up
CREATE INDEX CONCURRENTLY IF NOT EXISTS {index_name}
ON {table} ({columns});

-- Down
DROP INDEX IF EXISTS {index_name};
```

### Add RLS Policy
```sql
-- Up
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;

CREATE POLICY {policy_name} ON {table}
FOR ALL
TO authenticated
USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Down
DROP POLICY IF EXISTS {policy_name} ON {table};
```

## Output Template

```markdown
# Migration: {name}

**Version:** {version}
**Date:** {date}
**Author:** {author}

## Purpose

{why this migration is needed}

## Changes

| Table | Change | Type |
|-------|--------|------|
| {table} | {description} | ADD/MODIFY/DROP |

## SQL

### Up Migration
\`\`\`sql
{up_sql}
\`\`\`

### Down Migration
\`\`\`sql
{down_sql}
\`\`\`

## Risks

| Risk | Mitigation |
|------|------------|
| {risk} | {mitigation} |

## Testing

- [ ] Tested on development
- [ ] Tested on staging
- [ ] Rollback verified
- [ ] Performance checked

## Rollback Plan

{steps to rollback if issues occur}
```

---
# FILE: cloud-code/skills/security-review.md

```markdown
# Skill: Security Review

## Purpose

Comprehensive security review of code, configurations, and data handling to identify vulnerabilities and ensure compliance.

## When to Activate

- Before production deployments
- When security concerns arise
- During code review of sensitive areas
- Quarterly security audits
- After security incidents

## Review Areas

### 1. Authentication

- [ ] Passwords properly hashed (never plain text)
- [ ] Session tokens secure and rotated
- [ ] JWT tokens validated properly
- [ ] Magic links expire appropriately
- [ ] Rate limiting on auth endpoints

### 2. Authorization

- [ ] RBAC properly enforced
- [ ] Permission checks on all endpoints
- [ ] No privilege escalation paths
- [ ] Tenant isolation maintained
- [ ] Admin functions protected

### 3. Data Protection

- [ ] Sensitive data encrypted at rest
- [ ] Sensitive data encrypted in transit (HTTPS)
- [ ] PII handled according to policy
- [ ] Credentials not in code or logs
- [ ] Backups encrypted

### 4. Input Validation

- [ ] All inputs sanitized
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (output encoding)
- [ ] File uploads validated
- [ ] API inputs validated

### 5. RLS & Database

- [ ] RLS enabled on all tenant tables
- [ ] Policies correctly implemented
- [ ] No bypass paths
- [ ] Audit logging in place

### 6. Infrastructure

- [ ] Environment variables secure
- [ ] Secrets not in repository
- [ ] Dependencies up to date
- [ ] No known vulnerabilities (npm audit)

## Critical Issues (CURRENT)

### CRITICAL: Plain-text Credentials
**Location:** `project_credentials` table
**Risk:** Credential exposure
**Status:** UNRESOLVED
**Required Action:** Implement encryption

### HIGH: Incomplete RLS
**Location:** Multiple domain tables
**Risk:** Tenant data leakage
**Status:** UNRESOLVED
**Required Action:** Complete RLS audit and implementation

## Output Template

```markdown
# Security Review Report

**Date:** {date}
**Reviewer:** {agent/person}
**Scope:** {what was reviewed}

## Summary

| Severity | Count |
|----------|-------|
| Critical | X |
| High | X |
| Medium | X |
| Low | X |

## Findings

### CRITICAL

| Finding | Location | Risk | Recommendation |
|---------|----------|------|----------------|
| {finding} | {location} | {risk} | {action} |

### HIGH

{same format}

### MEDIUM

{same format}

### LOW

{same format}

## Recommendations

1. {prioritized recommendation}
2. {recommendation}

## Follow-up

| Action | Owner | Deadline |
|--------|-------|----------|
| {action} | {agent} | {date} |
```

---
# FILE: cloud-code/memory/known-bugs.md

```markdown
# Known Bugs

## Active Bugs

### BUG-001: Plain-text credentials
- **Severity:** CRITICAL
- **Status:** Open
- **Affects:** security-agent, project-agent
- **Table:** `project_credentials`
- **Description:** Credentials stored without encryption
- **Impact:** Security risk, blocks automation
- **Workaround:** None - must be fixed
- **Assigned:** security-agent

### BUG-002: Duplicate finance tables
- **Severity:** MEDIUM
- **Status:** Open
- **Affects:** finance-agent
- **Tables:** `finances`, `finance_records`
- **Description:** Two tables exist for financial data
- **Impact:** Data integrity unclear, blocks writes
- **Workaround:** Read-only mode
- **Assigned:** system-architect

### BUG-003: Duplicate activity tables
- **Severity:** MEDIUM
- **Status:** Open
- **Affects:** team-agent
- **Tables:** `activities`, `activity_logs`
- **Description:** Two tables exist for activity tracking
- **Impact:** Audit trail unclear, blocks writes
- **Workaround:** Read-only mode
- **Assigned:** system-architect

### BUG-004: Incomplete RLS policies
- **Severity:** HIGH
- **Status:** Open
- **Affects:** All agents
- **Description:** Not all domain tables have RLS enabled
- **Impact:** Potential tenant isolation breach
- **Workaround:** Manual tenant_id filtering in code
- **Assigned:** security-agent

### BUG-005: Mock data fallbacks in production
- **Severity:** MEDIUM
- **Status:** Open
- **Affects:** frontend-agent
- **Description:** Code falls back to mock data if real data fails
- **Impact:** May mask real issues, show fake data
- **Workaround:** Monitor for mock data usage
- **Assigned:** frontend-agent

---

## Bug Template

```markdown
### BUG-XXX: Title
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **Status:** Open | In Progress | Resolved | Won't Fix
- **Affects:** [agents]
- **Description:** ...
- **Impact:** ...
- **Workaround:** ...
- **Assigned:** [agent]
```
```

---

## FILE: cloud-code/memory/fixed-issues.md

```markdown
# Fixed Issues

## Resolved Bugs

(None yet - system is initializing)

---

## Template

```markdown
### BUG-XXX: Title (FIXED)
- **Severity:** {severity}
- **Fixed Date:** YYYY-MM-DD
- **Fixed By:** {agent}
- **Root Cause:** {explanation}
- **Solution:** {what was done}
- **Verification:** {how it was tested}
- **Regression Test:** {test added}
```
```

---

# FILE: cloud-code/memory/pending-decisions.md

```markdown
# Pending Decisions

## DECISION-PENDING-001: Canonical Finance Table
- **Status:** Pending
- **Owner:** system-architect
- **Urgency:** HIGH (blocks finance-agent)
- **Context:** Both `finances` and `finance_records` tables exist
- **Options:**
  1. Use `finances` as canonical, deprecate `finance_records`
  2. Use `finance_records` as canonical, deprecate `finances`
  3. Merge into new table with clear schema
- **Decision Criteria:** Which has more data? Better schema? More references?
- **Impact:** Unblocks finance-agent writes
- **Deadline:** Before Phase 1 completion

## DECISION-PENDING-002: Canonical Activity Table
- **Status:** Pending
- **Owner:** system-architect
- **Urgency:** MEDIUM (blocks team-agent)
- **Context:** Both `activities` and `activity_logs` tables exist
- **Options:**
  1. Use `activities` as canonical
  2. Use `activity_logs` as canonical
  3. Merge with clear naming convention
- **Decision Criteria:** Schema comparison, usage in code
- **Impact:** Unblocks team-agent writes
- **Deadline:** Before Phase 1 completion

## DECISION-PENDING-003: Lead Status State Machine
- **Status:** Pending
- **Owner:** crm-agent + product owner
- **Urgency:** HIGH (blocks crm-agent)
- **Context:** Lead statuses and transitions not documented
- **Options:** Define valid statuses and allowed transitions
- **Questions:**
  - What are the valid lead statuses?
  - What transitions are allowed?
  - What triggers each transition?
- **Impact:** Unblocks crm-agent writes
- **Deadline:** Before CRM automation

## DECISION-PENDING-004: Credential Encryption Strategy
- **Status:** Pending
- **Owner:** security-agent + system-architect
- **Urgency:** CRITICAL (blocks security)
- **Context:** `project_credentials` stores plain text
- **Options:**
  1. Application-level encryption (AES-256-GCM)
  2. Supabase Vault (if available)
  3. External secrets manager (AWS Secrets Manager, HashiCorp Vault)
- **Decision Criteria:** Security, complexity, cost, maintenance
- **Impact:** Unblocks security automation
- **Deadline:** ASAP - critical security issue

## DECISION-PENDING-005: Multi-tenant Strategy
- **Status:** Pending
- **Owner:** system-architect + product owner
- **Urgency:** LOW (architectural)
- **Context:** Need to confirm long-term multi-tenant approach
- **Options:**
  1. Single DB with RLS (current)
  2. Schema-per-tenant
  3. Database-per-tenant
- **Decision Criteria:** Scale, isolation, complexity, cost
- **Impact:** Architecture foundation for scaling

---

## Decision Template

```markdown
## DECISION-PENDING-XXX: Title
- **Status:** Pending | In Discussion | Decided
- **Owner:** {agent/person}
- **Urgency:** CRITICAL | HIGH | MEDIUM | LOW
- **Context:** {why this decision is needed}
- **Options:**
  1. {option}
  2. {option}
- **Decision Criteria:** {how to decide}
- **Impact:** {what it affects}
- **Deadline:** {when needed}
```

---

# FILE: cloud-code/memory/test-results.md

```markdown
# Test Results Log

## Latest Run

**Date:** (Not yet run)
**Status:** Pending initial test suite

---

## Result Template

```markdown
## Test Run: YYYY-MM-DD HH:MM

**Trigger:** {manual | CI | deployment}
**Branch:** {branch}
**Commit:** {hash}

### Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Unit | X | X | X |
| Integration | X | X | X |
| Isolation | X | X | X |
| Security | X | X | X |
| **Total** | **X** | **X** | **X** |

### Failed Tests

| Test | Error | Category |
|------|-------|----------|
| {test_name} | {error} | {category} |

### New Issues Found

- {issue}

### Notes

{any relevant notes}
```
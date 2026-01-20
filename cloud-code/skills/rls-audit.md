# Skill: RLS Audit

## Purpose

Audit Row-Level Security policies across all tables to identify gaps, verify tenant isolation, and ensure RBAC enforcement.

## When to Activate

- Before enabling write operations for any agent
- After schema changes
- During security reviews
- When tenant isolation concerns arise
- Before production deployments

## Execution Steps

### Step 1: Inventory All Tables
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

### Step 2: Check RLS Status
```sql
SELECT 
  schemaname,
  tablename, 
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
```

### Step 3: List All Policies
```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Step 4: Test Tenant Isolation
For each tenant-scoped table:
```sql
-- Set role to test user from tenant A
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "user-a", "tenant_id": "tenant-a"}';

-- Attempt to read other tenant's data
SELECT COUNT(*) FROM {table} WHERE tenant_id != 'tenant-a';
-- Expected: 0 rows (RLS blocks access)

-- Attempt to insert with wrong tenant
INSERT INTO {table} (tenant_id, ...) VALUES ('tenant-b', ...);
-- Expected: Error (RLS blocks)
```

### Step 5: Document Findings

## Output Template

```markdown
# RLS Audit Report

**Date:** YYYY-MM-DD
**Auditor:** {agent-name}

## Summary

| Metric | Count |
|--------|-------|
| Tables audited | X |
| RLS enabled | Y |
| RLS missing | Z |
| Policies total | N |
| Issues found | M |

## Tables Without RLS

| Table | Risk Level | Recommendation |
|-------|------------|----------------|
| {table} | HIGH | Enable RLS with tenant policy |

## Policy Gaps

| Table | Gap | Risk | Recommendation |
|-------|-----|------|----------------|
| {table} | {description} | {level} | {action} |

## Test Results

| Test | Table | Result | Notes |
|------|-------|--------|-------|
| Tenant isolation read | {table} | PASS/FAIL | |
| Tenant isolation write | {table} | PASS/FAIL | |
| RBAC enforcement | {table} | PASS/FAIL | |

## Recommendations

1. {recommendation}
2. {recommendation}

## Next Audit

Scheduled: {date}
```

## Frequency

- Scheduled: Weekly
- On-demand: Before major changes
- Required: Before new agent activation
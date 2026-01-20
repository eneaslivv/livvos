# Finance Agent

## Identity
| Field | Value |
|-------|-------|
| Name | finance-agent |
| Type | Domain Specialist |
| Status | 🚫 Blocked |
| Mode | Read-Only |
| Blocker | Duplicate finance tables |

## Purpose

Manages financial data, calculations, reporting, and health metrics.

## Responsibilities

- ✅ Financial data retrieval
- ✅ Financial calculations
- ✅ Health metrics computation
- ⚠️ Financial record creation (BLOCKED)
- ⚠️ Financial updates (BLOCKED)

## Non-Responsibilities

- ❌ Payment processing → future payment-agent
- ❌ External integrations → future integration-agent
- ❌ Project management → project-agent

## Allowed Actions

| Action | Status |
|--------|--------|
| Read finances | ✅ Yes |
| Read finance_records | ✅ Yes |
| Calculate metrics | ✅ Yes |
| Write finances | 🚫 Blocked |
| Write finance_records | 🚫 Blocked |

## Data Access

| Table | Access | Note |
|-------|--------|------|
| finances | Read | DUPLICATE |
| finance_records | Read | DUPLICATE |

## Critical Issue: Duplicate Tables

**Problem:** Both `finances` and `finance_records` exist.

**Questions:**
- Which is the canonical source of truth?
- What is the relationship between them?
- Should one be deprecated?
- Is there data in both that needs merging?

**Required Decision:** See `memory/pending-decisions.md`

## Invariants

1. Financial records must link to valid project/tenant
2. Calculations must be deterministic
3. Currency handling must be consistent
4. Amounts must not go negative (unless allowed)

## Financial Metrics

### Project Health
```
budget_used = sum(expenses) / budget
on_track = budget_used <= expected_at_date
health_score = weighted(budget, timeline, scope)
```

### Tenant Overview
```
total_revenue = sum(project_revenues)
total_expenses = sum(project_expenses)
profit_margin = (revenue - expenses) / revenue
```

## Data Structure (Assumed)

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "project_id": "uuid",
  "type": "income | expense",
  "amount": "decimal",
  "currency": "string",
  "description": "string",
  "date": "date",
  "category": "string",
  "created_at": "timestamp"
}
```

## Unlock Conditions

To enable writes:
1. [ ] Determine canonical table
2. [ ] Document schema differences
3. [ ] Plan data migration if needed
4. [ ] Update all references in code
5. [ ] Remove/deprecate unused table

## Testing Requirements

- Calculation accuracy
- Currency handling
- Tenant isolation
- Metric consistency
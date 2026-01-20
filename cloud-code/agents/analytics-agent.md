# Analytics Agent

## Identity
| Field | Value |
|-------|-------|
| Name | analytics-agent |
| Type | Domain Specialist |
| Status | ✅ Active |
| Mode | Read-Only (by design) |

## Purpose

Provides metrics, insights, and reporting across all domains. Read-only by design to ensure data integrity.

## Responsibilities

- ✅ Aggregate metrics computation
- ✅ Dashboard data provision
- ✅ Trend analysis
- ✅ Cross-domain insights
- ✅ Report generation

## Non-Responsibilities

- ❌ Data mutation (by design)
- ❌ Real-time subscriptions → frontend-agent
- ❌ Alert creation → team-agent

## Allowed Actions

| Action | Status |
|--------|--------|
| Read all domain tables | ✅ Yes |
| Compute aggregations | ✅ Yes |
| Generate reports | ✅ Yes |
| Write to any table | ❌ Never |

## Data Access

| Domain | Tables | Access |
|--------|--------|--------|
| Projects | projects, tasks, milestones | Read |
| CRM | leads, clients | Read |
| Finance | finances, finance_records | Read |
| Calendar | calendar_events | Read |
| Documents | documents | Read |
| Team | activities, activity_logs | Read |

## Invariants

1. NEVER write to any data table
2. Aggregations must respect tenant isolation
3. Queries must be optimized (no full table scans)
4. Cache where appropriate
5. Results must be deterministic

## Metrics Catalog

### Project Metrics
```
- projects_total
- projects_by_status
- tasks_completed_rate
- average_project_duration
- overdue_tasks_count
```

### CRM Metrics
```
- leads_total
- leads_by_status
- conversion_rate
- average_lead_age
- leads_by_source
```

### Finance Metrics
```
- total_revenue
- total_expenses
- profit_margin
- budget_utilization
- revenue_by_project
```

### Team Metrics
```
- active_users
- tasks_per_user
- activity_frequency
- notification_read_rate
```

## Query Patterns

### Tenant-Scoped Aggregation
```sql
SELECT 
  status, 
  COUNT(*) as count
FROM projects
WHERE tenant_id = :tenant_id
GROUP BY status;
```

### Time-Series Data
```sql
SELECT 
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as count
FROM leads
WHERE tenant_id = :tenant_id
  AND created_at >= :start_date
GROUP BY month
ORDER BY month;
```

## Caching Strategy

| Metric Type | Cache Duration |
|-------------|----------------|
| Real-time (dashboard) | No cache |
| Daily aggregates | 1 hour |
| Historical trends | 24 hours |
| Static reports | Until data changes |

## Testing Requirements

- Tenant isolation in all queries
- Aggregation accuracy
- Query performance
- Cache invalidation
- No write operations ever
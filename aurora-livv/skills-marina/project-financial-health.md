# Skill: project-financial-health (Marina)

## When to use
- "¿Cómo va {proyecto}?"
- "¿Cuáles están en pérdida?"
- "¿Por qué este proyecto está mal?"

## SQL

For one project:
```sql
SELECT * FROM get_project_financial_summary(:project_id);
```

For tenant overview:
```sql
SELECT
  p.id, p.title, p.client, p.status,
  f.business_model,
  f.total_agreed,
  f.total_collected,
  f.direct_expenses + f.imputed_expenses AS total_expenses,
  f.profit_margin,
  f.health,
  CASE
    WHEN f.total_agreed > 0
      THEN ROUND(f.total_collected / f.total_agreed * 100, 1)
    ELSE 0
  END AS collection_rate
FROM projects p
JOIN finances f ON f.project_id = p.id
WHERE p.tenant_id = :tenant_id
  AND p.status = 'Active'
ORDER BY f.profit_margin ASC NULLS LAST;
```

## Logic

Health is set by DB trigger. Marina reads it.

Drivers Marina surfaces when a project is `loss`:
1. **Collection lag**: `total_collected / total_agreed < 0.5` and project is mid/late
2. **Expense bloat**: `total_expenses > total_agreed * 0.7`
3. **Hour overrun** (hourly model): `hours_worked * hourly_rate > total_agreed`
4. **Scope creep** (fixed model): `total_expenses > 1.1 * total_agreed`

Marina names the driver explicitly. "Estás en pérdida por *hour overrun*" not "estás en pérdida porque sí".

## Output

Single project → canvas `display` with:
- `stat_cards`: margin, collection rate, hours worked, total agreed
- `markdown_block`: 2-3 sentence narrative with the *driver*

Tenant overview → `project_grid` block sorted by margin asc, with health pill on each.

## Prohibitions

- Never compute margin yourself — read `profit_margin` (generated column).
- Never show `health = 'profitable'` for a project where `total_collected = 0` (it's misleading even if the formula says so) — annotate "not yet billed".
- Never recommend "raise prices" as a fix unless the user asks for recommendations.

# Skill: source-attribution (Nova)

## When to use
- "¿De dónde vienen los leads?"
- "¿Qué canal me funciona?"
- "¿Cuánto plata me trajo Instagram?"

## Attribution priority

For each lead, attribution source =
1. `leads.utm->>'source'` if not null
2. `leads.origin` if not null
3. literal string `'Unattributed'` otherwise

Never collapse `Unattributed` into "Other". Showing it explicitly is how the user notices their intake is broken.

## SQL

```sql
WITH attributed AS (
  SELECT
    l.id,
    l.status,
    COALESCE(NULLIF(l.utm->>'source',''), NULLIF(l.origin,''), 'Unattributed') AS source,
    l.created_at,
    (SELECT f.total_collected
     FROM finances f
     JOIN projects p ON p.id = f.project_id
     WHERE p.tenant_id = l.tenant_id
       AND p.client = l.company       -- best-effort join; documented in caveats
     LIMIT 1) AS attributed_revenue
  FROM leads l
  WHERE l.tenant_id = :tenant_id
    AND l.created_at BETWEEN :window_start AND :window_end
)
SELECT
  source,
  COUNT(*)                                                   AS leads_n,
  COUNT(*) FILTER (WHERE status = 'qualified')                AS qualified_n,
  COUNT(*) FILTER (WHERE status = 'won')                      AS won_n,
  COALESCE(SUM(attributed_revenue) FILTER (WHERE status='won'), 0) AS revenue,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status='qualified') / NULLIF(COUNT(*),0), 1) AS qual_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status='won')       / NULLIF(COUNT(*),0), 1) AS win_rate
FROM attributed
GROUP BY source
ORDER BY leads_n DESC;
```

## Caveat to surface

The revenue join is best-effort (`projects.client = leads.company`). When the join fails, revenue is 0 for that lead. Nova must say so: "(la atribución de revenue es aproximada — los proyectos joinan por nombre de cliente)."

## Output

Canvas `display`:
- `donut_chart`: source → leads_n
- `attribution_table`: source, leads_n, qual_rate, win_rate, revenue
- Signal line: "X convierte Yx mejor que Z a `qualified`."
- Noise line: any source with n < 10 → mention as "señal incipiente, no concluir todavía".

## Prohibitions

- Never compute "ROI" without paid-spend data (Livv doesn't store it in v1).
- Never recommend "double down on X" based on win_rate alone with n<20.
- Always show `Unattributed` explicitly. Even if it's 1%.

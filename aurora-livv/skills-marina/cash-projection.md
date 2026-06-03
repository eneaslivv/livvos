# Skill: cash-projection (Marina)

## When to use
- "¿Cuánto voy a cobrar el mes que viene?"
- "¿Tengo plata para pagar X?"
- "Projection a 12 semanas"

## SQL

Outstanding receivables grouped by expected pay date:

```sql
WITH expected AS (
  SELECT
    p.id   AS project_id,
    p.title,
    p.client,
    f.business_model,
    f.total_agreed - f.total_collected AS outstanding,
    -- expected pay date: prefer proposal.payment_terms, else project updated_at + 30d
    COALESCE(
      (SELECT pr.accepted_at + (pr.payment_terms_days || ' days')::interval
       FROM proposals pr
       WHERE pr.tenant_id = :tenant_id
         AND pr.project_id = p.id
         AND pr.status = 'accepted'
       ORDER BY pr.accepted_at DESC
       LIMIT 1),
      p.updated_at + interval '30 days'
    ) AS expected_pay_date
  FROM projects p
  JOIN finances f ON f.project_id = p.id
  WHERE p.tenant_id = :tenant_id
    AND p.status = 'Active'
    AND f.total_collected < f.total_agreed
)
SELECT
  to_char(date_trunc('week', expected_pay_date), 'YYYY-MM-DD') AS week_start,
  SUM(outstanding) AS expected_inflow,
  COUNT(*)         AS deals_n,
  jsonb_agg(jsonb_build_object('project_id', project_id, 'title', title, 'client', client, 'amount', outstanding)) AS detail
FROM expected
WHERE expected_pay_date BETWEEN now() AND now() + interval '12 weeks'
GROUP BY 1
ORDER BY 1;
```

## Logic

- Window = next 12 weeks by default (user can override).
- Bucket by ISO week start.
- For each bucket: sum expected inflows + count deals.
- Stack against last-12-weeks **actual** inflows for a side-by-side bar chart.

## Output

Canvas `display`:
- `bar_chart`: x = week, y = USD, two series (`expected`, `last_year_same_period`)
- `stat_cards`: total expected (12wk), biggest single week, n_at_risk (deals with expected_pay_date < now)

If `n_at_risk > 0`, Marina says: "Hay N deals con fecha esperada vencida — los muestro en rojo."

## Prohibitions

- Never present this as a "guarantee". Always preface with: "Proyección — depende de que paguen a tiempo."
- Never include lost-deal recovery in this number.
- If sample is < 5 active projects, refuse the projection and say so.

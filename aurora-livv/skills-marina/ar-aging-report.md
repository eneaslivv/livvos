# Skill: ar-aging-report (Marina)

## When to use
- "¿Quién me debe?"
- "¿Cuánto tengo pendiente de cobro?"
- "AR aging"

## Buckets

Standard: 0–30 / 31–60 / 61–90 / 90+ days past expected pay date.

## SQL

```sql
WITH receivables AS (
  SELECT
    p.id AS project_id,
    p.title,
    p.client,
    f.total_agreed - f.total_collected AS outstanding,
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
    AND f.total_collected < f.total_agreed
)
SELECT
  CASE
    WHEN expected_pay_date >= now() - interval '30 days' THEN '0-30'
    WHEN expected_pay_date >= now() - interval '60 days' THEN '31-60'
    WHEN expected_pay_date >= now() - interval '90 days' THEN '61-90'
    ELSE '90+'
  END AS bucket,
  SUM(outstanding) AS total,
  COUNT(*) AS deals_n,
  jsonb_agg(jsonb_build_object('project_id', project_id, 'title', title, 'client', client, 'amount', outstanding) ORDER BY outstanding DESC) AS detail
FROM receivables
WHERE expected_pay_date < now() OR expected_pay_date >= now() - interval '30 days'
GROUP BY 1
ORDER BY
  CASE bucket WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END;
```

## Output

Canvas `display`:
- `stat_cards`: total AR, % over 60 days, oldest invoice age
- `bar_chart`: x = bucket, y = USD, color-coded (green → red)
- `attribution_table`: per-bucket detail with client + amount

## Prohibitions

- Never tag a client as a "bad payer" in the response — show the data, let the user judge.
- Never aggregate buckets ("over 60") without offering the breakdown. The buckets exist for a reason.
- Never include `lost` deals or `cancelled` projects in this report (those have no expected pay).

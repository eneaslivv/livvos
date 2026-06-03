# Skill: bottleneck-detection (Nova)

## When to use
- "¿Dónde estoy perdiendo?"
- "Bottleneck"
- "¿Qué stage es el problema?"

## Definition

**Bottleneck = the stage with the biggest *absolute* drop in lead count to the next stage in the window**, not the biggest %.

Rationale: a 50% drop on 4 leads is not a problem. A 25% drop on 80 leads is.

## SQL

```sql
WITH entries AS (
  SELECT
    l.id,
    h->>'to' AS stage,
    (h->>'at')::timestamptz AS at
  FROM leads l
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.history,'[]'::jsonb)) AS h
  WHERE l.tenant_id = :tenant_id
    AND (h->>'at')::timestamptz BETWEEN :window_start AND :window_end
),
counts AS (
  SELECT stage, COUNT(DISTINCT id) AS n
  FROM entries
  WHERE stage IN ('new','contacted','qualified','proposal','negotiation','won')
  GROUP BY stage
),
ordered AS (
  SELECT stage, n,
    CASE stage
      WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'qualified' THEN 3
      WHEN 'proposal' THEN 4 WHEN 'negotiation' THEN 5 WHEN 'won' THEN 6
    END AS ord
  FROM counts
)
SELECT
  prev.stage  AS from_stage,
  curr.stage  AS to_stage,
  prev.n      AS from_n,
  curr.n      AS to_n,
  prev.n - curr.n AS absolute_drop,
  ROUND(100.0 * (prev.n - curr.n) / NULLIF(prev.n, 0), 1) AS drop_pct
FROM ordered prev
JOIN ordered curr ON curr.ord = prev.ord + 1
ORDER BY absolute_drop DESC
LIMIT 5;
```

## Output

Canvas `display`:
- `stat_cards`: biggest bottleneck stage pair, absolute drop, %
- `bar_chart`: per-transition absolute drop
- one-line diagnosis: "El choke point es `qualified → proposal`: perdés N leads. Mirá `proposal-readiness` para entender por qué."

## Prohibitions

- Never call a stage a bottleneck if `from_n < 10` (too noisy).
- Never recommend "improve qualified-to-proposal" without naming a concrete first action (Solara's `proposal-readiness` skill is the link).
- Never report multiple bottlenecks as equal. The biggest absolute drop is the one. Other drops get listed as "secondary".

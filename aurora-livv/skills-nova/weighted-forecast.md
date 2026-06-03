# Skill: weighted-forecast (Nova)

## When to use
- "¿Cuánto voy a cerrar este trimestre?"
- "Forecast"
- "¿Vamos a llegar a la meta?"

## Default probabilities

| Stage | Default probability |
|---|---|
| new | 0.05 |
| contacted | 0.10 |
| qualified | 0.25 |
| proposal | 0.50 |
| negotiation | 0.75 |
| won | 1.00 |
| lost | 0.00 |

Override via `tenant_config.stage_probabilities` JSONB.

## SQL

```sql
WITH probs AS (
  SELECT COALESCE(tc.stage_probabilities, '{
    "new":0.05,"contacted":0.10,"qualified":0.25,
    "proposal":0.50,"negotiation":0.75,"won":1.00,"lost":0.00
  }'::jsonb) AS p
  FROM tenant_config tc WHERE tc.tenant_id = :tenant_id
),
deals AS (
  SELECT
    l.id, l.name, l.company, l.status,
    -- expected close date: if proposal exists, accepted_at expectation; else last_interaction + 21d
    COALESCE(
      (SELECT pr.accepted_at + interval '14 days'
       FROM proposals pr
       WHERE pr.tenant_id = :tenant_id
         AND pr.project_id IS NULL
         AND pr.lead_id = l.id
       LIMIT 1),
      l.last_interaction + interval '21 days'
    ) AS expected_close,
    COALESCE(
      (SELECT amount FROM proposals pr
       WHERE pr.tenant_id = :tenant_id
         AND pr.lead_id = l.id
       ORDER BY pr.updated_at DESC LIMIT 1),
      (l.ai_analysis->>'estimated_value')::numeric,
      0
    ) AS deal_value
  FROM leads l
  WHERE l.tenant_id = :tenant_id
    AND l.status NOT IN ('won','lost')
)
SELECT
  d.status,
  ROUND((probs.p->>d.status)::numeric, 2) AS probability,
  COUNT(*)                                AS deals_n,
  SUM(d.deal_value)                       AS pipeline,
  ROUND(SUM(d.deal_value) * (probs.p->>d.status)::numeric, 2) AS weighted
FROM deals d CROSS JOIN probs
WHERE d.expected_close BETWEEN :window_start AND :window_end
GROUP BY d.status, probs.p
ORDER BY probability DESC;
```

## Logic

1. Read or default the stage probabilities.
2. For each active deal in the window, multiply value × stage prob.
3. Sum the weighted by stage and overall.
4. Always show **three scenarios**: best (sum at 100% prob each), likely (weighted), worst (only `won` already + half of `negotiation`).

## Output

Canvas `display`:
- `stat_cards`: best / likely / worst, with weighted as the headline
- `bar_chart`: x = stage, y = pipeline & weighted (overlay)
- Note: "Probabilidades por etapa: editables en Settings."

If user asks to tune probabilities → emit `interactive` canvas with sliders, then `workflow` to save.

## Prohibitions

- Never present a single number without the 3 scenarios.
- Never use a probability >1 or <0 (clamp + flag).
- Never compute a 12-month forecast — too long a horizon. Cap at one quarter.

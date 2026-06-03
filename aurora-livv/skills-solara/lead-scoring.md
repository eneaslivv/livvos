# Skill: lead-scoring (Solara)

## When to use
- "¿Qué leads tengo más calientes?"
- "¿Cuál priorizo hoy?"
- "Score de Martín?"

## SQL

```sql
-- Top N leads by composite score in the active window
WITH scored AS (
  SELECT
    l.id,
    l.name,
    l.email,
    l.company,
    l.origin,
    l.status,
    l.last_interaction,
    COALESCE((l.ai_analysis->>'score')::numeric, 0) AS ai_score,
    CASE l.ai_analysis->>'temperature'
      WHEN 'hot' THEN 1.0
      WHEN 'warm' THEN 0.6
      WHEN 'cold' THEN 0.2
      ELSE 0.4
    END AS temp_weight,
    CASE
      WHEN now() - l.last_interaction < interval '24 hours' THEN 1.0
      WHEN now() - l.last_interaction < interval '7 days'  THEN 0.7
      WHEN now() - l.last_interaction < interval '30 days' THEN 0.3
      ELSE 0.1
    END AS recency_weight,
    CASE l.status
      WHEN 'qualified'   THEN 1.0
      WHEN 'proposal'    THEN 1.2
      WHEN 'negotiation' THEN 1.4
      WHEN 'contacted'   THEN 0.6
      WHEN 'new'         THEN 0.3
      WHEN 'won'         THEN 0.0
      WHEN 'lost'        THEN 0.0
      ELSE 0.4
    END AS stage_weight
  FROM leads l
  WHERE l.tenant_id = :tenant_id
    AND l.status NOT IN ('won','lost')
    AND l.created_at >= now() - interval ':window_days days'
)
SELECT
  id, name, email, company, origin, status, last_interaction, ai_score,
  ROUND( (0.45 * ai_score + 0.35 * temp_weight + 0.20 * recency_weight) * stage_weight, 3 ) AS composite_score
FROM scored
ORDER BY composite_score DESC
LIMIT :limit;
```

## Logic

Composite score = weighted blend of:
- 45% `ai_analysis.score` (model-derived)
- 35% temperature (hot/warm/cold)
- 20% recency of last interaction
- × stage multiplier (proposal > negotiation > qualified > contacted > new)

Won/lost leads always score 0. Stage multipliers can favor proposal slightly over qualified because proposals are closer to revenue.

## Output

Canvas `display` with `lead_list` block, sorted desc by composite_score. Stat card showing pipeline-weighted value (sum of `proposals.amount * stage_probability`).

## Prohibitions

- Never invent a score for a lead missing `ai_analysis`. Use 0 and surface the gap: "este lead no fue analizado todavía".
- Never display the formula to the user unless asked.
- Don't show scores rounded above 2 decimals; user shouldn't think this is sub-percentage precision.

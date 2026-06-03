# Skill: stale-deal-detection (Solara)

## When to use
- "¿Qué tengo stale?"
- Proactively on Monday morning briefing
- After Solara just answered "what's hot" and there were no hot ones (offer next-best)

## SQL

```sql
SELECT
  l.id,
  l.name,
  l.company,
  l.status,
  l.last_interaction,
  l.ai_analysis->>'temperature' AS temperature,
  EXTRACT(EPOCH FROM (now() - l.last_interaction)) / 86400.0 AS days_since_touch
FROM leads l
WHERE l.tenant_id = :tenant_id
  AND l.status IN ('contacted','qualified','proposal','negotiation')
  AND (
    (l.ai_analysis->>'temperature' = 'hot'  AND l.last_interaction < now() - interval '2 days')
    OR
    (l.ai_analysis->>'temperature' = 'warm' AND l.last_interaction < now() - interval '5 days')
    OR
    (l.ai_analysis->>'temperature' = 'cold' AND l.last_interaction < now() - interval '14 days')
    OR
    (l.ai_analysis->>'temperature' IS NULL  AND l.last_interaction < now() - interval '7 days')
  )
ORDER BY
  CASE l.ai_analysis->>'temperature'
    WHEN 'hot'  THEN 1
    WHEN 'warm' THEN 2
    WHEN 'cold' THEN 3
    ELSE 4
  END,
  l.last_interaction ASC
LIMIT 10;
```

## Stale thresholds (by temperature)

| Temperature | Stale after |
|---|---|
| hot | 2 days |
| warm | 5 days |
| cold | 14 days |
| (null) | 7 days |

## Output

Canvas `display` with:
- `stat_cards`: total stale, total hot-stale, oldest touch
- `lead_list`: sorted by temp → recency

If `total_hot_stale > 0`, Solara opens her message with the count and a question: "Tenés N hot sin tocar — ¿te draftéo los follow-ups?"

## Prohibitions

- Never include `won` or `lost` leads (they are by definition not stale).
- Never include `new` leads (those need first contact, not follow-up — that's a different state).
- Don't surface more than 10 in one canvas. If there are more, say so and offer pagination.

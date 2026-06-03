# Skill: funnel-snapshot (Nova)

## When to use
- "Mostrame el funnel"
- "¿Cuánto convierto de new a qualified?"
- "Snapshot semanal"

## SQL

Reads `leads.history` JSONB to detect stage **entries** in the window (not "current state at end").

```sql
WITH stage_entries AS (
  SELECT
    l.id,
    h->>'to' AS stage_reached,
    (h->>'at')::timestamptz AS reached_at
  FROM leads l
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.history, '[]'::jsonb)) AS h
  WHERE l.tenant_id = :tenant_id
    AND (h->>'at')::timestamptz BETWEEN :window_start AND :window_end
),
counted AS (
  SELECT stage_reached, COUNT(DISTINCT id) AS n
  FROM stage_entries
  WHERE stage_reached IN ('new','contacted','qualified','proposal','negotiation','won','lost')
  GROUP BY stage_reached
)
SELECT stage_reached, n,
  ROUND(100.0 * n / NULLIF(LAG(n) OVER (ORDER BY
    CASE stage_reached
      WHEN 'new' THEN 1
      WHEN 'contacted' THEN 2
      WHEN 'qualified' THEN 3
      WHEN 'proposal' THEN 4
      WHEN 'negotiation' THEN 5
      WHEN 'won' THEN 6
      WHEN 'lost' THEN 99
    END), 0), 1) AS pct_of_prev_stage
FROM counted
ORDER BY
  CASE stage_reached
    WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'qualified' THEN 3
    WHEN 'proposal' THEN 4 WHEN 'negotiation' THEN 5 WHEN 'won' THEN 6
    WHEN 'lost' THEN 99
  END;
```

## Logic

- Window default 30 days. User can override.
- Conversion = `count(reached stage_n in window) / count(reached stage_n-1 in window)`.
- `lost` is shown separately (not part of the conversion chain).
- Always include `n` per stage in the canvas.

## Output

Canvas `display`:
- `stat_cards`: top of funnel n, qualified n, won n, end-to-end conversion %
- `bar_chart`: x = stage, y = n; second series overlay with conversion %
- text: one-line summary with the "weakest stage drop"

## Prohibitions

- Never use end-of-window snapshot counts as conversion proxies (introduces bias from in-flight deals).
- Never call a 50% drop a "leak" if n=4. Suppress conversion % when prior stage n<10 — show `—` instead.
- Always state the window explicitly ("últimos 30 días, n=47").

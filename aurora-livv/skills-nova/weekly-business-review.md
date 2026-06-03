# Skill: weekly-business-review (Nova)

## When to use
- "Hacé el WBR"
- "Resumen semanal"
- "¿Cómo me fue esta semana?"

## Tier
**WRITE** — generates a structured artifact and persists to `agents.artifacts`. Preview-required.

## Composition

Nova composes a 6-section narrative:

1. **Headline** (1 line): the most important fact this week.
2. **Pipeline movement**: leads added / advanced / lost, with deltas vs last week.
3. **Revenue snapshot**: collected this week vs same week prior + open AR.
4. **Source signal**: best-converting source this week + Unattributed share.
5. **Bottleneck**: the biggest drop pair (`bottleneck-detection`) + one suggested action.
6. **One question for the founder**: a strategic question Nova thinks the user should chew on this week.

## SQL pipeline

Nova chains 5 reads:
- `funnel-snapshot` window=7d
- `source-attribution` window=7d
- `weighted-forecast` window=quarter
- `bottleneck-detection` window=30d (smaller windows too noisy for bottleneck)
- previous-period `funnel-snapshot` for delta

Then renders the narrative via an inline prompt with the data as JSON context.

## Output

Canvas `workflow`:
- Stepper: 5 read steps + 1 compose + 1 save artifact
- Preview: the rendered 6-section markdown
- CTA: "Guardar WBR de esta semana"

On confirm → write to `agents.artifacts`:
```sql
INSERT INTO agents.artifacts (tenant_id, kind, title, body, generated_by_agent, created_at)
VALUES (:tenant_id, 'wbr', 'WBR week of ' || to_char(:window_start, 'YYYY-MM-DD'), :markdown, 'nova', now());
```

## Prohibitions

- Never include a metric in WBR that wasn't computed by a named skill — full traceability.
- Never compose subjective language ("an exciting week") — Nova's voice is observational.
- Never skip section 6. The question forces engagement.
- Never run WBR for a window where leads < 10 OR analytics_days < 7. Refuse and say so.

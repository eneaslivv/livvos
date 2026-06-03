# Skill: proposal-readiness (Solara)

## When to use
- "¿Estoy listo para mandarle propuesta a X?"
- "¿Qué me falta para cerrar a Martín?"

## Readiness checklist

Solara probes 6 signals; each is satisfied / not / unknown:

| # | Signal | DB source |
|---|---|---|
| 1 | Decision-maker identified | `leads.ai_analysis.decision_maker_confirmed` boolean |
| 2 | Budget signal | `leads.ai_analysis.budget_signal ∈ {confirmed, range, none}` |
| 3 | Timeline signal | `leads.ai_analysis.timeline_signal ∈ {urgent, defined, vague, none}` |
| 4 | Scope clarity | `leads.ai_analysis.scope_clarity ∈ {clear, partial, fuzzy}` |
| 5 | Pricing model agreed | inferred from messages (recent contains keyword) |
| 6 | At least 1 discovery activity | `activity_logs` of `type='discovery_call'` exists |

## SQL

```sql
SELECT
  l.id, l.name, l.status,
  l.ai_analysis->>'decision_maker_confirmed' AS dm,
  l.ai_analysis->>'budget_signal'  AS budget,
  l.ai_analysis->>'timeline_signal' AS timeline,
  l.ai_analysis->>'scope_clarity'   AS scope,
  EXISTS (
    SELECT 1 FROM activity_logs a
    WHERE a.tenant_id = :tenant_id
      AND a.target = l.id::text
      AND a.type = 'discovery_call'
  ) AS has_discovery
FROM leads l
WHERE l.id = :lead_id
  AND l.tenant_id = :tenant_id;
```

## Logic

- 5+ signals satisfied → "ready, send proposal"
- 3–4 signals → "ready with caveat" — Solara lists what's missing
- ≤2 signals → "not ready, do discovery first"

## Output

Canvas `display` with a checklist (kind=`markdown_block`) showing ✓ / ✗ / ? for each signal. Add a one-line verdict.

## Prohibitions

- Never tell user "send the proposal" if scope is `fuzzy`. Recommend 1 more discovery instead.
- Never assume budget from company size — only from explicit signals in `ai_analysis`.
- If `has_discovery = false`, never call this lead ready, regardless of other signals.

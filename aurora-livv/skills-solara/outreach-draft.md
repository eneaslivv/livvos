# Skill: outreach-draft (Solara)

## When to use
- "Draftéame un follow-up para Martín"
- "¿Qué le digo a Sarah?"
- "Empezame un cold email para esta lista"

## Hard rule
**Solara writes the draft. Solara does NOT send anything.** The user copies + sends from their own email tool.
This is non-negotiable until v2 ships an email integration.

## SQL

```sql
-- Pull the lead + its last 3 history events to draft personalized follow-up
SELECT
  l.id, l.name, l.email, l.company, l.origin, l.status,
  l.ai_analysis,
  COALESCE(l.history, '[]'::jsonb) AS history,
  l.last_interaction,
  (
    SELECT jsonb_agg(jsonb_build_object('action', a.action, 'target', a.target, 'ts', a.timestamp) ORDER BY a.timestamp DESC)
    FROM activity_logs a
    WHERE a.tenant_id = :tenant_id
      AND a.target = l.id::text
    LIMIT 3
  ) AS recent_activity
FROM leads l
WHERE l.id = :lead_id
  AND l.tenant_id = :tenant_id;
```

## Logic

1. Pull lead + history + last activity.
2. Detect the *purpose* of the follow-up from `ai_analysis.recommendation` if present, else infer from `status`:
   - `new` → introduction + qualifying question
   - `contacted` → bump (no response yet)
   - `qualified` → propose discovery call OR pricing reveal
   - `proposal` → answer outstanding objection / nudge decision
   - `negotiation` → confirm or address last redline
3. Generate 2 variants (warm vs direct), max 110 words each.
4. End every email with a single clear ask (question or meeting link, not both).

## Variant rules

| Variant | Length | Open | CTA |
|---|---|---|---|
| Warm | 80–110 words | observation about their company | open question |
| Direct | 50–80 words | "Quería retomar X" | yes/no question or proposed date |

## Output

Canvas `interactive` with two textareas (warm + direct), a `subject_suggestion` for each, and a "Save draft to lead history" button (workflow tier).

## Prohibitions

- ❌ "I hope this email finds you well"
- ❌ "Just circling back" / "Just following up"
- ❌ Any link the user didn't already share
- ❌ Quotes invented about their company ("I saw you guys are crushing it" without evidence)
- ❌ Sending — period. The button writes the draft to `leads.history`, does not invoke email.

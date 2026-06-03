# Skill: deal-stage-coach (Solara)

## When to use
- "¿En qué stage está {lead}?"
- "¿Puedo pasar a {lead} a proposal?"
- "¿Por qué este lead no avanza?"

## State machine (enforced)

```
new ──► contacted ──► qualified ──► proposal ──► negotiation ──► won
  │           │            │            │              │           │
  └──────────►└────────────└────────────└──────────────└──────► lost
```

Allowed transitions (only these):

| From | To | Required check |
|---|---|---|
| new | contacted | first outreach logged in history |
| contacted | qualified | discovery call completed (activity_logs row of type='discovery_call') |
| qualified | proposal | proposal row exists with status in {draft,sent,viewed} |
| proposal | negotiation | proposal.status = 'viewed' or buyer replied |
| negotiation | won | proposal.status = 'accepted' |
| any (except won) | lost | reason required |

Anything else → reject with `VALIDATION`.

## SQL (probe before allowing transition)

```sql
-- Check if move to 'proposal' is allowed for a given lead
SELECT
  l.id AS lead_id,
  l.status AS current_status,
  EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.lead_id = l.id
      AND p.tenant_id = :tenant_id
      AND p.status IN ('draft','sent','viewed')
  ) AS has_proposal
FROM leads l
WHERE l.id = :lead_id
  AND l.tenant_id = :tenant_id;
```

## Logic

1. Validate the requested transition against the table above.
2. Probe the required check via SQL.
3. If allowed → emit `workflow` canvas with diff:
   - `leads.status`: from → to
   - `leads.history`: append `{from, to, by, at, reason}`
4. If not allowed → tell user exactly which check failed and what to do.

## Output

Canvas `workflow` for the transition. Canvas `display` if the user is just asking "where is X".

## Prohibitions

- Never skip stages. (e.g. `new` → `proposal` is rejected even with override.)
- Never mark `won` programmatically — Solara always asks "¿ya firmaron?" once even if the data says yes, because there are too many off-system handshakes.
- Never store the `reason` for `lost` as null. Force user to give one (free text, min 4 chars).

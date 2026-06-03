# Skill: error-handling

> Shared. Errors are not bugs from the user's perspective — they are messages.

## Error taxonomy

| Code | Meaning | What agent says |
|---|---|---|
| `RLS_VIOLATION` | Query violated tenant isolation | "No puedo acceder a esos datos en tu workspace" — log + escalate |
| `NOT_FOUND` | Row doesn't exist | "No encontré ese {entity} — ¿lo buscaste por nombre exacto?" |
| `VALIDATION` | Input failed a CHECK / business rule | Surface the rule, ask for correction |
| `TIMEOUT` | DB > 10s | "Esto está tardando. Probemos con un filtro más chico." |
| `CONFLICT` | Optimistic concurrency (rowversion changed) | "Alguien tocó esto en paralelo. ¿Refrescamos?" |
| `RATE_LIMIT` | Per-agent QPS exceeded | "Frenemos un toque, estoy procesando muchas." |
| `LLM_DOWNSTREAM` | Claude error / refusal | "Me quedé sin contexto. Pedímelo más corto." |
| `TOOL_NOT_FOUND` | Agent tried to call a tool not in its tier | Log as routing error, fall back |

## Mandatory: never expose the stack trace

The user sees the `hint` field of the error envelope. The `code` only when it's actionable (`CONFLICT`).

## Mandatory: surface the audit_id

Every error response includes the `audit_id`. The agent appends "(ref: {short_id})" to its message so the user can quote it to support.

## Retry policy

- READ tools: retry once on TIMEOUT with smaller window.
- WRITE tools: NEVER auto-retry. Surface the error and let the user retry by re-clicking Confirm.
- DESTRUCTIVE tools: NEVER auto-retry.

## When the LLM itself fails

If the LLM call fails (Claude API error, content policy, etc.), the back-end returns a stock message in the active agent's voice:

| Agent | Fallback message |
|---|---|
| Atlas | "Algo se cruzó. Probemos de nuevo." |
| Solara | "Se me trabó la idea. Repetímelo en una línea." |
| Marina | "No puedo confirmar ese número ahora — error técnico (ref: {audit_id}). Reintentá en 30s." |
| Nova | "Me quedé sin señal. Reintentá." |

## When the agent realizes mid-response that it doesn't have data

Stop, don't hallucinate. Say so:

> Solara: "No tengo el monto de la propuesta de Carlos en la DB. ¿Lo cargás vos primero o querés que lo dejemos como estimado?"

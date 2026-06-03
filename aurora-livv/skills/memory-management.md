# Skill: memory-management

> Shared. What the agents remember between sessions, and what they forget.

## The 3 memory layers

### 1. Session memory (volatile)
Lives in `agents.messages` for the lifetime of a chat session. Cleared when the user closes the dock or 24h passes.

Holds:
- Last 20 turns of the conversation
- Last tool calls + their results
- Pending workflow canvases waiting confirmation

### 2. User memory (persistent, per-user)
Lives in `agents.memories` with `scope = 'user'`. Indexed by `user_id`.

Holds:
- Preferences (`preferred_time_window: '7d'`, `default_currency: 'ARS'`)
- Quirks the user requested (`always_skip_low_value_leads_under: 500`)
- Recently dismissed suggestions (so we don't re-suggest the same thing 3 messages later)
- Tone overrides ("be more terse")

### 3. Tenant memory (persistent, per-tenant)
Lives in `agents.memories` with `scope = 'tenant'`. Indexed by `tenant_id`.

Holds:
- Stage probabilities (overrides Nova's defaults)
- North-star metric (Nova writes this; Atlas/Solara/Marina can read)
- Business model norms ("most projects fixed-price, retainer is ~20%")
- Known high-value clients (so Solara prioritizes their threads)

## Per-agent memory categories

Listed in each agent's frontmatter `memory_categories`. The agent ONLY reads/writes these categories — if Solara tries to write `north_star_metric`, it's blocked at the tool level.

## Write semantics

Every memory write is:
1. Validated against the agent's allowed categories
2. Stored as `{scope, key, value JSONB, written_by_agent, written_at, ttl_days?}`
3. Logged in `agents.audit_log` like any other write
4. Surfaced to the user **once** with: "Anoté: {key} = {value}. Decímelo si te molesta y lo borro."

## Read semantics

On every user turn, the agent receives a "memory context" object:

```json
{
  "user_memories": [...],
  "tenant_memories": [...],
  "session_recent": [last 10 turns]
}
```

It is the agent's responsibility to honor these. E.g., if user_memories has `tone: "terse"`, the agent must produce ≤200-char responses.

## Forget command

The user can say "olvidate de {X}" or "no me sugieras más {Y}". The agent must:
1. Parse the target
2. Emit a `workflow` canvas confirming the deletion (because it's a write)
3. On confirm, delete the row from `agents.memories`

## Anti-patterns

- ❌ Storing PII outside what the user explicitly shared (no scraping)
- ❌ Storing other tenants' data (RLS enforced anyway)
- ❌ Cross-agent memory leak — Solara cannot read Marina's `default_currency` directly; both read from the shared tenant scope
- ❌ Inferring preferences from a single message ("user said 'thanks' once = warm tone forever")

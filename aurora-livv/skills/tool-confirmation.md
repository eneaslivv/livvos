# Skill: tool-confirmation (tiered)

> Shared. Defines how each tool tier behaves at runtime.

## The three tiers

| Tier | When | UI behavior | Backend behavior |
|---|---|---|---|
| **READ** | Pure SELECT, no state change | Execute immediately, render result | Write `audit_log` row with `tier='READ'`, no idempotency needed |
| **WRITE** | Single or few-row mutation, reversible | Show `workflow` canvas with diff + "Confirm" button | Require `idempotency_key`, double-write audit before/after |
| **DESTRUCTIVE** | Multi-row delete, irreversible action, or bulk mark-as-lost | Show typing confirmation modal ("BORRAR" / "DELETE") + 5s cooldown + admin notification | Require `idempotency_key`, **and** verify the user's role has `can_destruct=true` |

## Why tiered, not binary

"Pedir confirmación" is vague. Three explicit levels means:
- a user can read at the speed of thought (no confirmation),
- a user can modify state with one click of trust,
- a user CANNOT accidentally nuke data (must type the word + wait + admin notified).

## Tier classification rules

A tool is **DESTRUCTIVE** if any of these are true:
- it deletes rows (any `DELETE FROM`)
- it modifies >5 rows in one call
- it changes a financial total by >20%
- it sends external communication (email, SMS, webhook)

A tool is **WRITE** if it changes state but is reversible by a compensating tool.

A tool is **READ** otherwise.

## What the agent does at each tier

### READ
1. Agent calls the tool.
2. Tool executes.
3. Agent shapes the result into `display` canvas.
4. No confirmation step.

### WRITE
1. Agent calls a `*_prepare` variant which returns the diff but does NOT commit.
2. Agent emits `workflow` canvas with the diff.
3. User clicks Confirm.
4. Front-end re-calls agent with `confirm: true` + same `idempotency_key`.
5. Agent calls `*_commit` variant.
6. Agent emits a follow-up `display` canvas with the result.

### DESTRUCTIVE
1. Same prepare/commit split.
2. Agent's `workflow` canvas includes `confirm_phrase: "BORRAR"` and `cooldown_seconds: 5`.
3. UI gates the button: disabled until cooldown elapses AND user typed the phrase exactly.
4. On commit, system fires a notification to the tenant owner (`destructive_action_alert`).

## Confirm modal content (UI must render)

For WRITE:
```
Solara va a:
  · update lead "Martín Gomez" status: qualified → proposal
  · append history entry "Marked as proposal-ready"
[Cancelar]  [Confirmar]
```

For DESTRUCTIVE:
```
⚠ Acción irreversible
Marina va a borrar la fila de finances del proyecto "Bank Corp".
Esto no se puede deshacer.

Para confirmar, escribí: BORRAR
[ ____________ ]   ⏱ 5s

[Cancelar]  [Confirmar]    ← disabled hasta cooldown + texto exacto
```

## Backend enforcement

The Edge Function that handles each tool **must independently re-check the tier**, not trust the front-end. A WRITE call that arrives without idempotency_key is rejected. A DESTRUCTIVE call that arrives without `confirm_phrase: "BORRAR"` matching is rejected. This is so even a compromised front-end cannot escalate.

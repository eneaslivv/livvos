# Skill: supabase-query

> Shared. Defines how every agent reads from / writes to Supabase.

## When to use
Always, on every tool call that touches the DB.

## Hard rules

1. **Every query MUST filter by tenant_id.** No exceptions. If a function doesn't accept tenant_id it's wrong — fix the function, do not bypass.
2. **Reads use the user's JWT** (RLS enforces tenant isolation).
3. **Writes go through Edge Functions** when DESTRUCTIVE or multi-step; direct supabase-js writes only for single-row WRITE actions.
4. **All writes must record an `agents.audit_log` row** before returning success to the user.
5. **No `select *`** in agent-issued queries. Whitelist columns.

## Standard SELECT pattern

```sql
SELECT id, name, status, created_at
FROM leads
WHERE tenant_id = :tenant_id
  AND status = ANY(:statuses)
ORDER BY last_interaction DESC
LIMIT :limit;
```

## Standard WRITE pattern (preview-then-commit)

1. Agent prepares write payload.
2. Agent emits `canvas.type = 'workflow'` with `preview` block showing exact before/after.
3. UI shows "Confirm" / "Cancel" buttons.
4. On confirm, the front-end calls the agent endpoint with `confirm: true` and the same `idempotency_key` that was generated client-side.
5. Endpoint:
   - Begin transaction
   - `INSERT INTO agents.audit_log(...)` with `status = 'pending'`
   - Execute the write
   - Update audit_log to `status = 'committed'` with rowversion
   - Commit
6. If anything throws → rollback + audit_log `status = 'failed'` with error message.

## Standard error envelope returned to the agent

```json
{
  "ok": false,
  "code": "RLS_VIOLATION | NOT_FOUND | VALIDATION | TIMEOUT | CONFLICT",
  "message": "human-readable",
  "hint": "what the agent should say to the user",
  "audit_id": "uuid"
}
```

The agent must surface the `hint` to the user. Never expose the raw `code` unless it's `CONFLICT` (then it's actionable).

## Anti-patterns

- ❌ Building SQL from concatenated string with user input
- ❌ Catching an RLS violation and retrying with elevated privileges
- ❌ Returning more than 100 rows in a single agent response payload
- ❌ Using `auth.uid()` inside an agent's tool definition — pass it as `:user_id` param

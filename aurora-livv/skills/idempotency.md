# Skill: idempotency

> Shared. Prevents double-writes when the user clicks Confirm twice or the network retries.

## The contract

Every WRITE and DESTRUCTIVE tool call MUST carry an `idempotency_key` (UUID v4).

The key is generated **client-side** when the `workflow` canvas is first rendered.
The same key is sent on the Confirm click.
If the user double-clicks, the second request arrives with the same key — backend deduplicates.

## Storage

```sql
CREATE TABLE agents.idempotency_keys (
  key UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  request_hash TEXT NOT NULL,         -- sha256 of canonicalized params
  response_payload JSONB,             -- cached response
  status TEXT NOT NULL,               -- pending | committed | failed
  created_at TIMESTAMPTZ DEFAULT now(),
  committed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT now() + interval '24 hours'
);
```

## Lifecycle

1. **First arrival** of a key: row inserted with `status = 'pending'`. Tool executes. On success, `status = 'committed'` + `response_payload` cached.
2. **Second arrival** with same key + same `request_hash`:
   - If `status = 'committed'` → return the cached `response_payload` (no re-execution).
   - If `status = 'pending'` → return 409 CONFLICT "in flight, retry in 2s".
   - If `status = 'failed'` → allow retry (treat as new).
3. **Second arrival** with same key but **different** `request_hash` → reject as `IDEMPOTENCY_KEY_REUSED` (the client is broken).

## Request hash

Canonicalize the params: sort keys, lowercase, drop nulls, JSON-stringify, sha256. The agent doesn't have to think about this — the SDK helper does it.

## TTL

Keys expire after 24h. A nightly job hard-deletes expired keys.

## Anti-patterns

- ❌ Using a timestamp as the idempotency key (collisions)
- ❌ Server-generating the key (defeats the purpose — client retries are the case to cover)
- ❌ Skipping idempotency for "small" writes (Solara's `update_lead_status` is small but DB triggers fire on it)

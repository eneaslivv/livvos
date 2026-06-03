# aurora-livv

Multi-agent conversational layer for **Livv** (eneas-os).

> v1 ships 3 specialists (**Solara** — sales · **Marina** — finance · **Nova** — growth) + 1 orchestrator (**Atlas**), modeled after the Aurora playbook used in Payper.

## What this is

A persistent FAB across the Livv admin that opens a chat dock. Each chat is owned by one of 3 personalities, each with its own color, voice, hard limits, and toolset. The user can confirm or edit any agent action before it touches the database.

| Agent | Color | Owns |
|---|---|---|
| Atlas (orchestrator) | slate | routing |
| Solara | magenta | leads, deals, outreach |
| Marina | emerald | invoices, expenses, project financial health |
| Nova | blue | funnel, sources, forecast, bottlenecks |

## What's inside

- 4 agent prompts (`agents/`)
- 9 shared skills + 15 domain skills (`skills/`, `skills-*/`)
- 11-table `agents.*` schema migration + 8 operational views (`db/`)
- Deterministic seed + 54 eval cases + runner (`evals/`)
- Next.js 14 frontend shell + mock backend (`frontend-next/`)
- Full audit / idempotency / kill-switch / saga compensation infrastructure

## Start here

1. Read **DISCOVERY.md** — what the product is, which schema gaps exist, what we decided.
2. Read **agents/atlas.md** then any one of solara/marina/nova to understand the 12-dimension personality contract.
3. Read **skills/visual-output.md** to understand canvas v2.0.
4. Read **TESTING.md** for the 5-level validation strategy.
5. Read **PLAYBOOK.md** to replicate this for any other product.

## Run the frontend (mock mode, no LLM)

```bash
cd frontend-next
npm install
npm run dev
# open http://localhost:3000
```

## Run the evals

```bash
cd evals
python run_evals.py --all --mode mock --report report.html
open report.html
```

## Apply the DB migration (staging only — read SCHEMA_GAPS first)

```bash
psql $SUPABASE_DB_URL -f db/migrations/01_agents_schema.sql
psql $SUPABASE_DB_URL -f db/views/02_agent_metrics.sql
psql $SUPABASE_DB_URL -f evals/seed-data.sql        # optional — seed for staging
```

## Flip to live (Claude wired in)

1. Set `ANTHROPIC_API_KEY` in `frontend-next/.env.local`
2. Set `AURORA_MODE=live` in same file (default is `mock`)
3. Restart the Next dev server

## Mode dual

Per-tenant toggle in `tenant_config.agent_mode`:
- `'multi'` (default) → 3 personalities visible
- `'unified'` → backend still routes, front shows one face

No deploy, no LLM swap. Just a SQL UPDATE.

## File tree

See `IMPLEMENTATION.md`.

## License

Same as the host Livv project.

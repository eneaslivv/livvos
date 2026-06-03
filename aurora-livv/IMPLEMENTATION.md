# IMPLEMENTATION.md — How aurora-livv was built

> Reading order: this file → DISCOVERY.md → SCHEMA_GAPS.md → agents/*.md → skills/*.md → frontend-next/README.md.

## What's in this folder

```
aurora-livv/
├── DISCOVERY.md            ← Phase A · what the project is and what we decided
├── SCHEMA_GAPS.md          ← auditor output · prompts vs real schema
├── EXPANSION_PLAN.md       ← v2+ agents roadmap
├── TESTING.md              ← 5-level validation strategy
├── PLAYBOOK.md             ← reproducible recipe (Phase D)
├── README.md               ← entry point for someone new to the folder
├── IMPLEMENTATION.md       ← this file
│
├── agents/                 ← 4 agents (atlas + solara + marina + nova)
├── skills/                 ← 9 shared skills (all agents load these)
├── skills-solara/          ← 5 sales-specific skills with SQL
├── skills-marina/          ← 5 finance-specific skills with SQL
├── skills-nova/            ← 5 growth-specific skills with SQL
│
├── db/
│   ├── migrations/01_agents_schema.sql   ← 11 tables in agents.*
│   └── views/02_agent_metrics.sql        ← 8 operational views
│
├── evals/
│   ├── seed-data.sql       ← deterministic test fixture (1 tenant, 7 leads, 5 projects, finances)
│   ├── cases-solara.json   ← 18 cases with assertions
│   ├── cases-marina.json   ← 18 cases
│   ├── cases-nova.json     ← 18 cases
│   ├── mock_backend_py.py  ← Python mock for fast eval iteration
│   └── run_evals.py        ← runner (mock + live modes, HTML report)
│
└── frontend-next/          ← Phase C · Next.js 14 + TS app with mock backend
    ├── package.json
    ├── README.md
    ├── tsconfig.json
    ├── next.config.mjs
    ├── app/                ← App Router (layout, page, /api/chat, per-module pages)
    ├── components/         ← AuroraDock, AuroraFab, AuroraOrb, Sidebar, Topbar, Canvas
    ├── lib/                ← tokens (CSS vars), agents (registry), mock-backend
    └── public/
```

## Tech stack chosen

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 14 App Router + TS | Mature, ships server actions + API routes in one place; matches the multi-tenant SaaS pattern of Livv |
| Styling | CSS custom properties + Tailwind utility classes for layout only | Color tokens live in `lib/tokens.ts` and become CSS vars at runtime; agents change accent without rebuild |
| Animation | Framer Motion for the dock slide + Orb breathing | already a dep in Livv |
| Icons | Lucide React | already used in Livv |
| State | React useState + custom `useAgent()` hook (no global store needed in v1) | premature abstraction is risk; v2 may add zustand if needed |
| LLM | Claude Sonnet 4.6 for specialists; Opus 4.6 for Atlas (routing benefits from larger context) | Cost-balanced |
| Backend chat | Next API routes calling Anthropic SDK | One process, no extra service |
| DB | Supabase (existing Livv DB) | No new infra |

## Personality contract (12 dimensions)

Lives in each agent's frontmatter — **never** in prose. Treated as data the runtime reads. The eval suite asserts on warmth/pacing/length consistency.

## Why the 3 agents we chose

- **Solara (Sales)** — pays back immediately. Closes deals = revenue.
- **Marina (Finance)** — protects revenue. Cash is the metric that kills businesses.
- **Nova (Growth)** — explains why the other two move. Without Nova, the user knows the score but not the cause.

The 4th, Atlas, is structural — it's the router that makes the multi-agent feel coherent.

## Mode dual (multi vs unified)

Backend always emits `agent: "atlas|solara|marina|nova"` in the response.
Front decides via `tenant_config.agent_mode`:
- `multi` → 3 personalities visible, dock theme changes per agent
- `unified` → one "Livv Assistant" face, internal routing hidden, single brand color

Toggle = `UPDATE tenant_config SET agent_mode = 'unified' WHERE tenant_id = X` — no deploy, no LLM change.

## Tier of risk (READ / WRITE / DESTRUCTIVE)

Each tool in `agents/{name}.md` is classified in `tools_by_tier`. The skill `skills/tool-confirmation.md` defines runtime behavior:
- READ → immediate
- WRITE → preview canvas + confirm
- DESTRUCTIVE → typing confirmation + cooldown + admin notify

Backend re-validates the tier; the front cannot escalate.

## Audit log + idempotency + kill switch

All three live in `agents.*` schema (migration 01). Every WRITE/DESTRUCTIVE goes through them. Skill `skills/idempotency.md` defines the contract.

## Saga compensation

Multi-step writes (e.g., `convert_lead_to_project`, `draft_invoice_from_proposal`) declare their compensation map in the agent's frontmatter. If step 3 of 4 fails, the saga undoes 2 and 1 in reverse.

## Canvas v2.0

4 canvas types: `display | workflow | interactive | route`.
`skills/visual-output.md` is the source of truth for shapes.
Front-end renders the same components regardless of agent — the canvas's `agent` field picks the color theme.

## Evals

54 cases across 3 agents (~18 each). Runner in Python so it's portable. Mock mode runs in <2s, live mode validates the LLM. Assertions cover: forbidden phrases, required mentions, canvas types, block kinds, max length, number invention, tone signals.

## What is intentionally not in v1

- No retrieval / RAG. The schema is small enough to ground per-query.
- No fine-tuning. The personalities live in prompts.
- No agent-to-agent calls. Atlas routes via canvas, agents don't invoke each other.
- No real email send. Solara drafts, user copies.
- No payment processor integration. Marina prepares invoices, user delivers.
- No bank reconciliation. Out of scope.

## What ships green vs needs work

| Layer | Status |
|---|---|
| Discovery + audit | ✓ green |
| Agent prompts (4) | ✓ green |
| Shared skills (9) | ✓ green |
| Domain skills (15) | ✓ green |
| DB migration + views | ✓ green — needs to run against staging |
| Seed data | ✓ green |
| Eval cases (54) | ✓ green — assertions reviewed |
| Mock backend (Py + TS) | ✓ green |
| Next.js frontend shell | ✓ green |
| Live backend wired to Claude | ⚠ needs ANTHROPIC_API_KEY + sanity test |
| Production deploy | ✗ requires Livv RLS audit + migration apply |

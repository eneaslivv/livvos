# DISCOVERY.md — Livv multi-agent system

> Phase A output. Read this first.
> Cross-references the real schema in `/migrations/*.sql` against the agent design.

---

## 1. Product context

**Livv (eneas-os)** is a multi-tenant SaaS for boutique creative agencies, consultancies, and productized-service shops. Sweet-spot ICP: 3–25 person teams, retainer + project mix, founder-led, want to remove the founder from day-to-day ops.

The product currently exposes ~15 surface areas (Strategy, Content, Sales Pipeline, Finance, Clients, Calendar, Communications, Team Scaling, Growth Dashboard, Strategy Toolkit, Products marketplace, Partners, Brief/Home, Master mode, Agent tab).

The multi-agent layer ships on top of this — it does not replace it. The chat appears as a persistent FAB across the admin and operates against the existing Supabase tables with tenant_id isolation.

---

## 2. Agents selected for v1 (multi mode)

| Agent | Color | Role mirror | Tagline | Domain tables (primary) |
|---|---|---|---|---|
| **Atlas** (orchestrator) | slate `#475569` | Chief of Staff | "The map that routes the work" | reads `agent_*` only |
| **Solara** | magenta `#E11D74` | Sales Manager / BDR / AE | "Closes deals like fine art" | `leads`, `clients`, `proposals`, `activity_logs` |
| **Marina** | emerald `#10B981` | Bookkeeper / Controller | "Calm waters in the cashflow" | `finances`, `projects`, `invoices`, `proposals` |
| **Nova** | electric blue `#3B82F6` | Head of Growth / RevOps | "The signal in the noise" | `web_analytics`, `leads`, `finances`, `projects` |

Mode = **multi** (3 visible personalities). Backend always emits `agent` per message; front decides multi vs unified per tenant via `tenant_config.agent_mode`.

---

## 3. Schema map (real, not assumed)

### Tenant + RBAC
- `tenants(id, …)`
- `tenant_config(tenant_id, branding JSONB, modules_enabled JSONB, agent_mode TEXT)` — *agent_mode column to be added*
- `profiles(id → auth.users, tenant_id, role, …)`
- `roles`, `permissions`, `user_roles`, `role_permissions`
- `permission_audit_log(user_id, tenant_id, module, action, allowed, ts)`

### Sales (Solara)
- `leads(id, tenant_id, name, email, company, message, origin, utm JSONB, status, ai_analysis JSONB, history JSONB, created_at, last_interaction)`
- `clients(id, tenant_id, name, email, company, status, …)`
- `proposals(…)` — proposed in `2026-01-28_proposals.sql`
- `client_messages`, `client_history`, `client_tasks`

### Finance (Marina)
- `finances(id, project_id, tenant_id, total_agreed, total_collected, direct_expenses, imputed_expenses, hours_worked, business_model ∈ {fixed,hourly,retainer}, hourly_rate, health ∈ {profitable,break-even,loss}, profit_margin GENERATED, created_at, updated_at)`
- `projects(id, title, status, client, …)`
- RPC: `get_project_financial_summary(p_project_id UUID) → JSONB`

### Growth (Nova)
- `web_analytics(total_visits, unique_visitors, bounce_rate, conversions, top_pages JSONB, daily_visits JSONB, updated_at)`
- Cross-reads `leads`, `finances`, `projects`

### Cross-cutting
- `activity_logs(action, target, project_id, type, ts, meta JSONB)`
- `notifications`, `messages`, `quick_hits`
- `tasks`, `subtasks`, `comments` (project mgmt)

---

## 4. Schema gaps detected (audit output)

These were found by cross-referencing existing migrations against the cloud-code agent docs (`cloud-code/agents/*.md`):

| # | Issue | Severity | Source |
|---|---|---|---|
| 1 | `finances` vs `finance_records` duplicate | MED | `cloud-code/SYSTEM.md` line 34 |
| 2 | `activities` vs `activity_logs` duplicate | MED | `cloud-code/SYSTEM.md` line 35 |
| 3 | Plain-text credentials in `project_credentials` | CRIT | `cloud-code/SYSTEM.md` line 37 (already addressed in `2026-01-20_credential_encryption.sql`) |
| 4 | Lead status state machine not enforced (no CHECK constraint, no enum) | HIGH | `cloud-code/agents/crm-agent.md` line 55 |
| 5 | `leads.tenant_id` missing in `schema-only.sql` and `supabase_schema.sql` (added later in fix migrations) | HIGH | inferred |
| 6 | RLS coverage incomplete across all tables | HIGH | `2026-01-20_comprehensive_rls_policies.sql` partially addresses |
| 7 | No `tenant_config.agent_mode` column → cannot toggle multi/unified per tenant | NEW | required for this work |
| 8 | No `agents.*` schema → no audit log, no idempotency, no kill-switch storage | NEW | required for this work |

Gaps 7 and 8 are addressed by the new `db/migrations/01_agents_schema.sql` shipped in this folder.

---

## 5. Functional-domain → agent mapping

| Section in product | Agent that owns the chat there | Notes |
|---|---|---|
| Sales Pipeline / LeadDetail | Solara | primary domain |
| Outreach / Communications | Solara | reads + drafts |
| Finance / Invoicing | Marina | primary domain |
| Project Finance widget | Marina | embedded view |
| Growth Dashboard / Funnel / Forecast / Activity | Nova | primary domain |
| Home / Brief | Atlas → routes to whichever is relevant | "morning briefing" use case |
| Strategy / Content / Team / Clients / Calendar | out of v1 scope | future agents |

---

## 6. Tier-of-risk policy (READ / WRITE / DESTRUCTIVE)

All tools the agents can invoke are classified into one of three tiers:

- **READ** — execute directly, audited only. Example: "what's my pipeline this week" → `SELECT … FROM leads`.
- **WRITE** — preview rendered in a `workflow` canvas + explicit "Confirm" button. Example: "draft a follow-up email to Sarah" → returns drafted text in canvas, user confirms before any insert/notify.
- **DESTRUCTIVE** — typing confirmation ("DELETE" / "BORRAR") + 5-second cooldown + admin notification. Example: "wipe pipeline of Q4 lost leads" → blocked unless owner role.

Per-agent tier mapping lives in each `agents/{name}.md` under `tools_by_tier`.

---

## 7. What ships in this folder

```
aurora-livv/
├── DISCOVERY.md                        ← this file
├── README.md                           ← entry point
├── IMPLEMENTATION.md                   ← how it was built
├── SCHEMA_GAPS.md                      ← detail of section 4
├── EXPANSION_PLAN.md                   ← v2 agents roadmap
├── TESTING.md                          ← how to validate level by level
├── PLAYBOOK.md                         ← reproducible recipe (Phase D)
├── agents/
│   ├── atlas.md                        ← orchestrator
│   ├── solara.md                       ← Sales Coach
│   ├── marina.md                       ← Finance Operator
│   └── nova.md                         ← Growth Strategist
├── skills/                             ← 9 shared skills
├── skills-solara/                      ← 5 sales-specific skills
├── skills-marina/                      ← 5 finance-specific skills
├── skills-nova/                        ← 5 growth-specific skills
├── db/
│   ├── migrations/01_agents_schema.sql ← 11 tables in agents.* schema
│   └── views/02_agent_metrics.sql      ← 8 operational views
├── evals/
│   ├── seed-data.sql
│   ├── cases-solara.json
│   ├── cases-marina.json
│   ├── cases-nova.json
│   └── run_evals.py
└── frontend-next/                      ← Phase C: Next.js shell + mock backend
```

# Skill: project-schema

> Shared. Canonical table reference for Livv. Updated as the real schema evolves.
> If a query references a column not in here, the agent is wrong — escalate.

## Tenant + RBAC

| Table | Key columns |
|---|---|
| `tenants` | `id`, `name`, `created_at` |
| `tenant_config` | `tenant_id`, `branding JSONB`, `modules_enabled JSONB`, `default_currency_code TEXT`, `stage_probabilities JSONB`, `agent_mode TEXT` *(added by aurora-livv migration)* |
| `profiles` | `id` (= auth.uid), `tenant_id`, `display_name`, `role`, `created_at` |
| `roles` | `id`, `name`, `is_system` |
| `permissions` | `id`, `module`, `action` |
| `user_roles` | `user_id`, `role_id`, `tenant_id` |
| `role_permissions` | `role_id`, `permission_id` |
| `permission_audit_log` | `user_id`, `tenant_id`, `module`, `action`, `allowed`, `timestamp` |

## Sales

### `leads`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `tenant_id` | UUID | added by RLS hardening migration |
| `name` | TEXT | required |
| `email` | TEXT | required |
| `company` | TEXT | optional |
| `message` | TEXT | initial inbound text |
| `origin` | TEXT | "Web Form" / "Instagram" / "Referral" / etc. |
| `utm` | JSONB | source, medium, campaign |
| `status` | TEXT | enum-by-convention: `new\|contacted\|qualified\|proposal\|negotiation\|won\|lost` |
| `ai_analysis` | JSONB | `{category, temperature, summary, recommendation, score}` |
| `history` | JSONB | array of `{from, to, by, at, reason?}` |
| `created_at`, `last_interaction` | TIMESTAMPTZ | |

### `clients`
Post-conversion. Minimal canonical fields: `id, tenant_id, name, email, company, status, created_at`.

### `client_messages`, `client_tasks`, `client_history`
Linked to `clients(id)` via `client_id`, all carry `tenant_id`.

### `proposals` (from `2026-01-28_proposals.sql`)
Status flow: `draft → sent → viewed → accepted | rejected | expired`. Linked to `leads(id)`.

## Finance

### `finances`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | required, FK |
| `tenant_id` | UUID | required, FK |
| `total_agreed` | NUMERIC | contract amount |
| `total_collected` | NUMERIC | received |
| `direct_expenses` | NUMERIC | hard costs |
| `imputed_expenses` | NUMERIC | labor/overhead |
| `hours_worked` | NUMERIC | append-only via `log_hours_worked` |
| `business_model` | TEXT | `fixed\|hourly\|retainer` (CHECK) |
| `hourly_rate` | NUMERIC | nullable |
| `health` | TEXT | `profitable\|break-even\|loss` (CHECK + trigger) |
| `profit_margin` | NUMERIC | **GENERATED STORED** — never write |
| `created_at`, `updated_at`, `created_by` | | |

### RPC `get_project_financial_summary(p_project_id UUID) → JSONB`
Returns: project_id, total_agreed, total_collected, direct_expenses, imputed_expenses, total_expenses, hours_worked, business_model, health, profit_margin, collection_rate, effective_hourly_rate.

## Projects + delivery

| Table | Key columns |
|---|---|
| `projects` | `id, title, description, progress, status, client, next_steps, color, updated_at` |
| `tasks` | `id, title, completed, priority, project_id, due_date, start_date, end_date, assignee_id` |
| `subtasks` | `id, task_id, text, completed` |
| `comments` | `id, task_id, user_id, text, created_at` |
| `milestones` | (referenced in agent docs, not in core schema file — confirm migration) |

## Growth / analytics

### `web_analytics`
| Column | Type | Notes |
|---|---|---|
| `total_visits` | INT | running |
| `unique_visitors` | INT | running |
| `bounce_rate` | NUMERIC | % |
| `conversions` | INT | running |
| `top_pages` | JSONB | array of `{path, views}` |
| `daily_visits` | JSONB | array of `{date, value}` |
| `updated_at` | TIMESTAMPTZ | |

## Cross-cutting

| Table | Purpose |
|---|---|
| `activity_logs` | append-only audit feed (`user_name, action, target, project_id, type, timestamp, meta`) |
| `notifications` | UI notification queue |
| `messages` | inbox between tenant users |
| `quick_hits` | per-user quick todos |

## Agent-system tables (new — see `db/migrations/01_agents_schema.sql`)

Live in schema `agents.*`:
- `agents.sessions`, `agents.messages`, `agents.tool_calls`
- `agents.audit_log`, `agents.idempotency_keys`, `agents.kill_switches`
- `agents.compensations`, `agents.artifacts`, `agents.evals_runs`, `agents.feedback`, `agents.memories`

## Known gaps (do not pretend these exist)

- No `invoices` table in v1 schema → `draft_invoice_from_proposal` writes to `proposals.invoice_data` JSONB until table lands.
- No `expenses` standalone table → tracked inside `finances.direct_expenses` + `imputed_expenses`.
- No bank-statement reconciliation source.
- `milestones` referenced but not confirmed in canonical migrations.

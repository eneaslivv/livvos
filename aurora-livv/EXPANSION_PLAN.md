# EXPANSION_PLAN.md — Roadmap for v2+ agents

> v1 ships Atlas + Solara + Marina + Nova.
> This doc explains the order in which the remaining 11 surface areas get their own agent.

## The reasoning behind the order

The original mapping you wrote has 15 sections. Three principles decide ordering:

1. **ROI of automating the role** — Sales Coach pays back immediately; Org Designer pays back when the team is bigger than 8.
2. **Frequency of use** — Daily Coach / Brief gets used every morning; Tenant Health Monitor weekly at most.
3. **Schema readiness** — Finance, Sales, Growth already have schema. Content Engine needs a content_calendar table that doesn't exist yet.

## v2 (next 90 days)

### Agent #5 — Sol (Daily Coach / Brief)
- **Mirrors role:** Chief of Staff / Executive Coach
- **Surface area:** Home / Brief tab, morning notifications
- **Color:** warm yellow `#F59E0B`
- **Key skills:** overnight-synthesis, focus-recommendation, pre-meeting-briefing, end-of-day-recap
- **Schema needs:** none new (reads everything that exists)
- **Why next:** lock-in. A user who opens Livv every morning to read Sol's brief never churns.

### Agent #6 — Vera (Content Producer)
- **Mirrors role:** Content Strategist + Editorial Manager + Copywriter
- **Surface area:** Content Engine (Studio / Pipeline / Calendar / Channels)
- **Color:** purple `#8B5CF6`
- **Key skills:** brand-voice-translation, hook-writing, channel-format (LinkedIn / Reel / Newsletter), repurposing-suggestions, cadence-compliance
- **Schema needs:** `content_calendar`, `brand_voices`, `content_pieces` tables — propose in next migration cycle
- **Why second:** highest-frequency creative work, sucks the most founder hours today.

### Agent #7 — Tara (Triage Assistant / Inbox)
- **Mirrors role:** Executive Assistant / Inside Sales
- **Surface area:** Communications / Inbox tab
- **Color:** rose `#F43F5E`
- **Key skills:** message-classification, draft-replies, VIP-flagging, meeting-extraction
- **Schema needs:** Gmail / Slack OAuth integrations + `unified_inbox` view

## v3 (90–180 days)

### Agent #8 — Octa (Engagement Designer)
- **Mirrors role:** Solutions Architect / Engagement Manager
- **Surface area:** Strategy Toolkit
- **Skills:** framework-picker, scope-of-work-drafting, deliverable-design, pricing-architecture
- **Schema needs:** `frameworks`, `engagement_templates`

### Agent #9 — Hex (Org Designer / People)
- **Mirrors role:** COO / Head of People
- **Surface area:** TeamScaling
- **Color:** indigo `#6366F1`
- **Skills:** capacity-heatmap, JD-drafting, comp-benchmarking, hiring-funnel
- **Schema needs:** `roles_target`, `people`, `comp_bands`

### Agent #10 — Relay (Relationship Curator / CSM)
- **Mirrors role:** Customer Success Manager
- **Surface area:** Clients tab (post-sale)
- **Skills:** touchpoint-gaps, NPS-prediction, expansion-signal
- **Schema needs:** `client_health_scores`, `nps_responses`

## v4 (180+ days)

### Agent #11 — Pact (Partner Activator)
Partners portal / referral mechanics.

### Agent #12 — Strato (Strategy Analyst)
Brand ↔ ICP drift, positioning consistency. Pairs with Vera.

### Agent #13 — Tic (Task Triager / PM)
Calendar redistribution, capacity-aware scheduling. Pairs with Hex.

### Agent #14 — Pix (Product Marketer)
Marketplace pricing tier copy, embed widget generation.

### Agent #15 — Hub (Tenant Health Monitor — Master mode)
Cross-tenant for the Livv platform operator (you). Lives in master mode, predicts churn / expansion.

---

## Cross-cutting integrations to schedule

The original map listed 6 integrations that supercharge multiple agents. Order:

| # | Integration | Unlocks | When |
|---|---|---|---|
| 1 | Call recording (Whisper / AssemblyAI) | Solara + Strato + Relay | v2.1 |
| 2 | Time tracking (Toggl / Harvest) | Marina (utilization), Hex (capacity) | v2.2 |
| 3 | Email warm-up + outreach (Instantly / Smartlead) | Solara | v3.0 |
| 4 | Meeting intelligence (Granola / Fireflies) | Tara + Strato | v3.0 |
| 5 | KPI auto-pull (GA, LinkedIn, Stripe) | Nova | v3.1 |
| 6 | Slack / Discord listening | Tara | v4 |

---

## Re-use of the v1 substrate

When v2 agents land, they reuse:
- Same `agents.*` schema (sessions, messages, tool_calls, audit_log, idempotency_keys, kill_switches, memories, artifacts, feedback, evals_runs)
- Same canvas types (`display | workflow | interactive | route`)
- Same tier classification (READ / WRITE / DESTRUCTIVE)
- Same `tenant_config.agent_mode` toggle (multi / unified)
- Same `response-format`, `tool-confirmation`, `error-handling`, `memory-management`, `idempotency`, `currency-formatter` shared skills

Each new agent adds:
- One `agents/{name}.md` with 12-dim frontmatter
- A `skills-{name}/` folder with 3–6 atomic skills
- ~15 eval cases in `evals/cases-{name}.json`
- Routing rule in `agents/atlas.md`
- Optionally: 1–3 new domain tables

This is the recipe. The first 4 agents took the heavy lifting. Each subsequent agent is ~3 days of work.

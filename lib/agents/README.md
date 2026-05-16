# Agent system

Structured, domain-segmented AI for the dashboard. Every AI surface in
the app routes through this layer instead of calling Gemini directly.

## Why

Before this:
- AI calls were scattered (AiAdvisor, Brief, FinanceChat, EmailDraftPanel)
- Each surface re-built its own prompt + data-loading + response shaping
- Easy for the model to "wing it" when prompts lacked grounding
- Hard to extend — adding a new capability meant editing every caller

After this:
- One `Orchestrator` entry point
- Domain agents own their persona + system prompt + curated skills
- Skills are typed read/write operations against real DB tables
- The LLM is given ONLY data the skills returned + a strict
  "no invention" rule

## Layers

```
┌─────────────────────────────────────────────────────┐
│  UI (Brief.tsx, AiAdvisor, Per-page widgets)        │
│  calls runOrchestrator({ query, ctx })              │
└─────────────────────────┬───────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────┐
│  Orchestrator                                       │
│  • Routes query to an Agent (by keyword or forced)  │
│  • Runs the Agent's read skills                     │
│  • Bundles agent prompt + skill results             │
│  • Calls Gemini via sendAdvisorChat                 │
│  • Returns reply + skillTrace + proposedActions     │
└─────────────────────────┬───────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────┐
│  Agents (tasks / finance / calendar / clients /     │
│         projects / inbox)                           │
│  • systemPrompt (persona + non-invention rule)      │
│  • skills: Skill[]                                  │
│  • routingHints: string[]                           │
└─────────────────────────┬───────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────┐
│  Skills                                             │
│  • read: query DB via supabase (RLS = tenant-safe)  │
│  • write: returns a ProposedAction (no auto-exec)   │
│  • Returns { ok, kind, data?, reason? }             │
└─────────────────────────────────────────────────────┘
```

## Folders

```
lib/agents/
├── README.md              ← this doc
├── types.ts               ← Skill, Agent, ExecutionContext, NON_INVENTION_RULES
├── registry.ts            ← AGENTS[], AGENT_BY_ID, SKILL_BY_ID
├── orchestrator.ts        ← runOrchestrator()
├── index.ts               ← public API
├── skills/                ← one file per domain
│   ├── tasks.ts           ← list_open_for_me, list_overdue, count, search, …
│   ├── finance.ts         ← monthly_summary, overdue_installments, project_profitability
│   ├── calendar.ts        ← today_events, upcoming_events, detect_conflicts
│   ├── clients.ts         ← list, get
│   ├── projects.ts        ← list, health
│   └── inbox.ts           ← pending, ai_flagged_requests
└── agents/                ← one file per domain
    ├── tasks-agent.ts
    ├── finance-agent.ts
    ├── calendar-agent.ts
    ├── clients-agent.ts
    ├── projects-agent.ts
    └── inbox-agent.ts
```

## Non-invention contract

Every agent's system prompt ends with the `NON_INVENTION_RULES` block
from `types.ts`:

> STRICT FACT RULE — every concrete value you mention (task title, due
> date, amount, client name, project, person) MUST come from data in
> the SKILL RESULTS block. NEVER invent.
> 
> If the skills returned no data, say so explicitly: "No matching X
> found." Do NOT guess or extrapolate.
> 
> If the skills returned partial data, work only with what you have. Do
> NOT fill gaps with assumptions.
> 
> When citing a number (count, amount, percentage), reference where it
> came from when relevant ("based on 12 open tasks").
> 
> Never claim to have taken an action you did not take. Write
> operations require a ProposedAction the user approves separately.

Skills enforce the same on their side: a query with no matches returns
`{ ok: false, reason: 'not_found' }` rather than an empty array the
agent could shrug at.

## How to add a new agent

1. Create `skills/<domain>.ts` with read-only skills.
2. Create `agents/<domain>-agent.ts` with the `AgentDefinition`.
3. Register it in `registry.ts`.
4. Add its routing hints (keywords) so the orchestrator picks it up.

Done. Every existing AI surface gets the new agent for free.

## How to add a new skill to an existing agent

1. Add the skill to the right file under `skills/`.
2. Append it to the exported `<domain>Skills` array.
3. The registry picks it up automatically.

Skills should be:
- Single-purpose (one read or one proposal)
- Type-safe (validate params)
- Tenant-scoped (use `ctx.tenantId` in every query)
- Honest (return `ok: false, reason: 'no_match'` instead of empty data)

## Direct skill use (no LLM)

Sometimes a widget just needs data, not a chat response. Skip the
orchestrator:

```ts
import { SKILL_BY_ID } from '@/lib/agents';
import { supabase } from '@/lib/supabase';

const skill = SKILL_BY_ID.get('finance.monthly_summary')!;
const result = await skill.run(
  { year: 2026, month: 5 },
  { db: supabase, tenantId: currentTenant.id, userId: user.id }
);
if (result.ok) {
  console.log(result.data); // { income, expense, net, ... }
}
```

## Wire-up

Currently used by:
- `pages/Brief.tsx` — daily briefing chat
- (future) `components/AiAdvisor.tsx` — global AI panel
- (future) `components/finance/FinanceAssistant.tsx`
- (future) per-page widgets that want direct skill access

Long-term: every AI call in the app routes through `runOrchestrator` or
direct `SKILL_BY_ID.get(...).run()`. No more direct Gemini calls from
random components.

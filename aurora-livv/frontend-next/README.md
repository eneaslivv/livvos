# aurora-livv · frontend-next

Next.js 14 + TypeScript shell with the multi-agent dock running against the in-memory mock backend.

## Run

```bash
npm install
npm run dev
# open http://localhost:3000
```

## What works in mock mode

- Sidebar + 4 pages (Home, Pipeline, Finance, Growth)
- AuroraFab opens the dock
- Switch agent inside the dock (Solara · Marina · Nova)
- Multi / Unified toggle in topbar
- Chips on each page seed the chat
- Mock backend returns canned canvases for ~60 keyword patterns matching the eval cases
- All 4 canvas types render: `display` (stat_cards, lead_list, project_grid, bar_chart, donut_chart, attribution_table), `workflow` (stepper + diff + confirm), `interactive` (textarea / slider / toggle), `route` (Atlas hand-off)
- Destructive workflow renders the typing confirmation + cooldown

## Flip to live (Claude)

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local
echo "AURORA_MODE=live" >> .env.local
npm run dev
```

The live path skeleton is in `app/api/chat/route.ts` — uncomment the Anthropic fetch and add a `loadAgentPrompt(slug)` that reads `../agents/{slug}.md`.

## Type-check

```bash
npm run typecheck
```

## Project structure

```
frontend-next/
├── app/
│   ├── layout.tsx            ← shell + Sidebar + Fab
│   ├── page.tsx              ← Home
│   ├── pipeline/page.tsx     ← Solara default
│   ├── finance/page.tsx      ← Marina default
│   ├── growth/page.tsx       ← Nova default
│   ├── api/chat/route.ts     ← /api/chat (mock + live skeleton)
│   └── globals.css           ← design tokens + CSS vars + dock styles
├── components/
│   ├── Sidebar.tsx
│   ├── Topbar.tsx            ← multi / unified toggle
│   ├── AuroraFab.tsx         ← the floating button
│   ├── AuroraDock.tsx        ← chat dock with switcher + composer
│   └── Canvas.tsx            ← renders all 4 canvas types
└── lib/
    ├── tokens.ts             ← agent color tokens
    ├── agents.ts             ← agent registry + default-for-module
    └── mock-backend.ts       ← TS mirror of evals/mock_backend_py.py
```

## Design-tokens approach

Colors live in `lib/tokens.ts` and become CSS custom properties at runtime (`--accent`, `--accent-soft`, `--accent-text`). Components don't hardcode color. When the canvas's `agent` changes, the parent applies `cssVarsForAgent(slug)` inline and all children re-skin.

That's how a single `<StatCard>` looks magenta inside Solara and emerald inside Marina, without per-agent components.

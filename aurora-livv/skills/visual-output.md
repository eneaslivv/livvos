# Skill: visual-output (canvas v2.0)

> Shared. The agent never emits markdown lists or tables in the chat bubble.
> Structured data goes in `canvas`. Period.

## Canvas types

### `display` — pure info
Use when the user is asking "show me X". No CTAs, no confirmations.

```json
{
  "type": "display",
  "agent": "solara",
  "blocks": [
    { "kind": "stat_cards", "items": [
      { "label": "Pipeline value", "value": "$58,000", "sublabel": "last 30d", "trend": "+12%" },
      { "label": "Stale leads",   "value": "3",        "sublabel": "hot, >48h" }
    ]},
    { "kind": "lead_list", "items": [
      { "id": "uuid", "name": "Martín Gomez", "company": "Startup.io", "status": "qualified", "ai_score": 0.84 }
    ]}
  ]
}
```

### `workflow` — confirmation required (WRITE tier)
Use when the user is asking the agent to do something that changes state.

```json
{
  "type": "workflow",
  "agent": "marina",
  "idempotency_key": "uuid-from-client",
  "stepper": [
    { "name": "Read proposal", "status": "done" },
    { "name": "Create invoice draft", "status": "pending" },
    { "name": "Log activity",   "status": "pending" }
  ],
  "diff": [
    { "table": "proposals", "row_id": "uuid", "field": "invoice_data", "from": null, "to": "{...}" }
  ],
  "cta": { "confirm_label": "Crear borrador", "cancel_label": "Cancelar" }
}
```

### `interactive` — edit before commit
Use when the user wants to tune values before the agent acts.

```json
{
  "type": "interactive",
  "agent": "nova",
  "controls": [
    { "kind": "slider", "label": "stage:new → contacted prob", "min": 0, "max": 1, "step": 0.01, "value": 0.10, "id": "p_new_contacted" },
    { "kind": "toggle", "label": "include unattributed",       "value": true, "id": "incl_unattr" }
  ],
  "submit": { "label": "Recalcular forecast" }
}
```

### `route` — Atlas-only
Hand off to another agent.

```json
{
  "type": "route",
  "agent": "atlas",
  "target_agent": "marina",
  "reason": "intent matched: 'cashflow'",
  "user_message_passthrough": "..."
}
```

## Block kinds (used inside `display`)

| Kind | Shape |
|---|---|
| `stat_cards` | `items: [{label, value, sublabel?, trend?, tone?}]` (max 4) |
| `lead_list` | `items: [{id, name, company?, status, ai_score?, last_touch?}]` |
| `project_grid` | `items: [{id, title, client, health, profit_margin, …}]` |
| `donut_chart` | `data: [{label, value}], title` |
| `bar_chart` | `data: [{x, y}], title, x_label, y_label` |
| `line_chart` | `series: [{label, points: [{x,y}]}]`, title |
| `attribution_table` | `rows: [{source, leads_n, qualified_n, won_n, revenue}]` |
| `markdown_block` | `body: "..."` — *only* for narrative summaries (WBR), max 800 chars |

## Branding rule

The `agent` field in the canvas determines the color theme of the rendered widgets.
- `solara` → magenta accent
- `marina` → emerald accent
- `nova`   → blue accent
- `atlas`  → slate accent

Components are **not** duplicated per agent. One `<StatCard>` component reads `agent` from canvas and applies the right CSS var.

## Anti-patterns

- ❌ Markdown table in the `text` field
- ❌ More than 4 stat_cards in one display canvas
- ❌ `workflow` without `idempotency_key`
- ❌ `interactive` without a submit handler endpoint
- ❌ Mixing two agents' brand colors in one canvas

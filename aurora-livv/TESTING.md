# TESTING.md — How to validate level by level

> Five levels. Each level depends on the previous passing. Don't skip.

---

## Level 1 — Static lint of the prompts

```bash
# Check every agent .md has the 12 dimensions
node scripts/lint-agents.js   # (script lives in frontend-next/scripts)
```

What it checks:
- Frontmatter present and YAML-valid
- All 12 dimensions defined
- `tools_by_tier` references only tools that exist in the tool catalog
- `compensation_map` references only valid step indices

Pass criteria: zero errors.

---

## Level 2 — Auditor cross-check vs real schema

```bash
node scripts/audit-prompts-vs-schema.js
```

What it checks:
- Every SQL snippet inside skills-*/*.md parses (uses `node-sql-parser`)
- Every table referenced in skills exists in current Supabase schema
- Every column referenced exists with the expected type
- Every enum value referenced is in the CHECK constraint

Output: `audit-report.md` with line-numbered findings.

Pass criteria: all CRITICAL findings resolved. HIGH may be acknowledged in SCHEMA_GAPS.md.

---

## Level 3 — Mock eval pass

```bash
cd evals
python run_evals.py --all --mode mock --report report.html
open report.html
```

What it checks:
- Every case in `cases-{solara,marina,nova}.json` runs against the mock backend
- All assertions pass per case
- No regression vs last reported pass rate

Pass criteria: ≥95% pass rate. Document any failure with a ticket or eval-update rationale.

---

## Level 4 — Live eval pass (real Claude)

```bash
export ANTHROPIC_API_KEY=...
export AURORA_LIVV_API=http://localhost:3000

# Boot the Next app
cd frontend-next && npm run dev

# In another shell
cd evals
python run_evals.py --all --mode live --report report-live.html
```

What it checks:
- Same cases but the Next.js `/api/chat` actually calls Claude with the system prompt loaded from `agents/{name}.md`
- LLM tone/length/format compliance with the assertions
- Token cost stays within budget (`agents.v_token_cost`)

Pass criteria:
- ≥85% pass rate (LLM variance is real, mock 95% target is stricter)
- Average cost per case < $0.05
- p95 latency < 4s

When a case fails live but passes mock, the LLM is the source of variance. Two options: tighten the prompt, or relax the assertion if the agent's output is acceptable.

---

## Level 5 — End-to-end smoke (UI)

Run the Next app, open `http://localhost:3000/pipeline`, click the Solara FAB, type:

> "qué tengo stale esta semana"

Verify:
1. Dock slides in from the right (250ms cross-fade)
2. Solara responds in ≤3s with magenta theme
3. Canvas renders 1 stat_cards + 1 lead_list block
4. Numbers shown match the seed data
5. Atlas badge in topbar shows last-used agent

Repeat for Marina (visit `/finance`, ask "cómo va el mes") and Nova (`/growth`, ask "mostrame el funnel").

For destructive flow:
1. In Solara: "marcá como perdidos todos los leads en contacted hace más de 60 días"
2. Verify: typing input appears requiring "BORRAR", confirm button disabled until typed + 5s elapsed, and a notification fires when committed (check `agents.v_destructive_audit`).

---

## How to add a new test

1. Drop a new case object into `evals/cases-{agent}.json`:
   ```json
   { "id": "sol-019-...", "user_message": "...", "assertions": { ... } }
   ```
2. Add the matching keyword rule to `evals/mock_backend_py.py` and `frontend-next/lib/mock-backend.ts` (mirror them).
3. Re-run levels 3 and 4.

---

## Regression budget

Each PR may decrease pass rate by ≤1 case temporarily, tracked in `agents.evals_runs`. If a PR drops it more, it's blocked until the new case is added or the regression is fixed.

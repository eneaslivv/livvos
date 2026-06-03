# Skill: expense-categorization (Marina)

## When to use
- "Cuánto gasté en X este mes?"
- "Mové este gasto a imputado"
- "Por qué está tan alto el direct?"

## Model

Livv v1 stores expenses as **two aggregates per project**: `direct_expenses` and `imputed_expenses`. Standalone expense table is a v2 goal (see EXPANSION_PLAN).

Definitions (rendered to the user when asked):
- **Direct**: hard costs invoiced by 3rd parties (software licenses, contractor invoices, ad spend, stock photos).
- **Imputed**: opportunity cost of labor + overhead allocated to the project.

## SQL (read)

```sql
SELECT
  p.id, p.title,
  f.direct_expenses,
  f.imputed_expenses,
  f.direct_expenses + f.imputed_expenses AS total_expenses,
  CASE
    WHEN f.total_agreed > 0
      THEN ROUND((f.direct_expenses + f.imputed_expenses) / f.total_agreed * 100, 1)
    ELSE 0
  END AS expense_ratio_pct
FROM projects p
JOIN finances f ON f.project_id = p.id
WHERE p.tenant_id = :tenant_id
  AND p.id = :project_id;
```

## SQL (reclassify — WRITE)

```sql
UPDATE finances
SET
  direct_expenses = direct_expenses + :delta,
  imputed_expenses = imputed_expenses - :delta,
  updated_at = now()
WHERE project_id = :project_id
  AND tenant_id = :tenant_id;
```

`delta` can be negative (move imputed → direct) — sign convention is "delta added to direct, subtracted from imputed".

## Logic

When user says "move $400 from imputed to direct" → `delta = +400`.
When user says "this should be imputed not direct" → ask for the amount, then `delta = -amount`.

## Output

Canvas `workflow` for any reclassify:
- Before/after of `direct_expenses` and `imputed_expenses`
- Computed delta to `profit_margin`
- CTA: "Reclasificar"

## Prohibitions

- Never reclassify if the resulting `direct_expenses` < 0 or `imputed_expenses` < 0 (DB CHECK would reject anyway, but Marina catches it first).
- Never reclassify without showing the resulting `profit_margin` delta — that's the whole point of the move.

# Skill: invoice-from-won-lead (Marina)

## When to use
- After Solara marks a lead `won` → Marina triggers
- "Cobremos a {cliente}"

## Tier
**WRITE.** Always preview before commit.

## SQL (prepare)

```sql
-- Pull proposal data to seed invoice draft
SELECT
  p.id AS project_id, p.title, p.client,
  pr.id AS proposal_id, pr.amount, pr.line_items, pr.payment_terms_days,
  pr.accepted_at,
  tc.default_currency_code AS currency,
  tc.invoice_template_id   AS template_id
FROM proposals pr
JOIN projects p ON p.id = pr.project_id
JOIN tenant_config tc ON tc.tenant_id = pr.tenant_id
WHERE pr.id = :proposal_id
  AND pr.tenant_id = :tenant_id
  AND pr.status = 'accepted';
```

## Logic

1. Read accepted proposal.
2. Compose invoice draft:
   - `invoice_number` = next sequential per tenant
   - `amount` = `proposal.amount`
   - `line_items` = inherited
   - `issue_date` = today
   - `due_date` = today + `payment_terms_days`
   - `currency` = tenant default
3. Persist as `proposals.invoice_data` JSONB (until proper `invoices` table exists).
4. Append `activity_logs` row: action='invoice_drafted', target=proposal_id.

## Output

Canvas `workflow`:
- Stepper: `[Read proposal ✓, Compose invoice ⏳, Save draft ⏳, Notify Solara ⏳]`
- Diff: shows the invoice JSON that will be saved
- CTA: "Crear borrador de factura"

## Compensation (Saga)

If step 3 succeeds and step 4 fails:
- undo step 3 (null out `invoice_data`)
- return error to user with `audit_id`

## Prohibitions

- Never create an invoice for a proposal not in `accepted` status.
- Never set `due_date` < `issue_date`.
- Never send the invoice. User downloads PDF, sends manually.
- Never call this if `tenant_config.invoicing_enabled = false`.

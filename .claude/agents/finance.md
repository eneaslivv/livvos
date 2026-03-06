# Finance Agent — Financial Tracking

## Owned Files
- `context/FinanceContext.tsx` — Income, expenses, financial summaries
- `pages/Finance.tsx` — Financial dashboard
- `components/config/PaymentSettings.tsx` — Payment config UI

## Database Tables
- `finances` — Project financial tracking (agreed, collected, expenses)
- `payment_processors` — Payment gateway config

## Known Issues
- Payment processing not implemented (only configuration UI)
- Invoicing system doesn't exist
- Financial health calculation exists but needs validation

## Rules
- Financial records should be append-only
- Health must be one of: profitable, break-even, loss
- Expenses tracked as direct or imputed

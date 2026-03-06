# CRM Agent — Leads, Clients & Sales

## Owned Files
- `context/ClientsContext.tsx` — Client CRUD and communication
- `hooks/useLeadToProject.ts` — Lead conversion workflow
- `pages/Sales.tsx` — CRM dashboard with Kanban board
- `pages/Clients.tsx` — Client management (2287 lines — needs component extraction)
- `components/crm/CRMBoard.tsx` — Kanban board for leads
- `components/crm/LeadDetailPanel.tsx` — Lead detail view
- `components/crm/NewLeadModal.tsx` — New lead creation
- `components/portal/ClientPortalView.tsx` — Client portal
- `pages/ClientPortal.tsx` — Portal redirect
- `pages/TeamClients.tsx` — Team-shared clients

## Database Tables
- `leads` — Sales leads with AI analysis fields
- `clients` — Client entities
- `client_messages` — Communication history
- `client_tasks` — Client-specific tasks
- `client_history` — Interaction audit trail

## Edge Functions
- `supabase/functions/lead-ingest/` — Public lead ingestion endpoint

## Known Issues
- AI analysis fields exist but no real AI workflow connected
- Client portal nested in components/ is WIP
- Clients.tsx is 2287 lines — needs component extraction
- Lead status transition validation missing

## Rules
- Every lead must have status (new, contacted, following, closed, lost)
- Every lead must have temperature (cold, warm, hot)
- Lead conversion must preserve all metadata
- Communication history must be immutable

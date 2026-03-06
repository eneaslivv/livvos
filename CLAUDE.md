# eneas-os

Multi-tenant SaaS platform for project management, CRM, and business operations.

## Tech Stack
- React 19 + Vite 5 + TypeScript 5.8
- Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- Tailwind CSS + Framer Motion + Lucide Icons + Recharts
- 12 Context providers (global state management)
- Custom PageView routing in App.tsx (no router library)

## Project Structure
```
/pages/              → 21 page components
/components/         → UI components (calendar/, cluster/, config/, crm/, docs/, portal/, ui/)
/context/            → 12 providers (RBAC, Tenant, Security, Notifications, Team, Clients,
                       Calendar, Documents, Finance, Projects, Analytics, System)
/hooks/              → Custom hooks (useAuth, useSupabase, useCalendar, useClients, etc.)
/lib/                → Utilities (supabase, auth, encryption, errorLogger, credentialManager)
/types/              → TypeScript type definitions
/migrations/         → SQL migration files
/supabase/functions/ → Edge Functions (gemini, send-invite-email, google-calendar-auth,
                       google-calendar-sync, lead-ingest)
/config/             → whitelabel.ts (branding)
/skills/             → Agent skills system
```

## Coding Conventions
- Named exports only (no default exports from components)
- Single Supabase client: import from `lib/supabase.ts`, never create additional instances
- Tenant isolation: every DB query MUST filter by tenant_id
- Permission checks: use `useRBAC().hasPermission(module, action)` for UI gates
- Error logging: use `errorLogger` from `lib/errorLogger.ts`
- Credential encryption: use `credentialManager` from `lib/credentialManager.ts`
- Console.log: wrap in `import.meta.env.DEV` check for non-error logs

## Key Architecture Decisions
- SecurityContext handles ONLY credentials. Permission checks are in RBACContext (single source of truth)
- supabaseAdmin is deprecated — admin operations run in Edge Functions
- All pages are lazy-loaded via React.lazy() in App.tsx
- Each domain has an agent context file in `.claude/agents/`

## Common Commands
```bash
npm run dev            # Start dev server
npm run build          # Production build
npm test               # Run tests
npm run migration:dev  # Deploy migrations to dev
```

## Agent Domains
See `.claude/agents/` for per-domain context files with file ownership, DB tables, and known issues.

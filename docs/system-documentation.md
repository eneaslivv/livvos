# System Documentation – eneas-os

- This document provides a comprehensive overview of the system based on the current codebase and migrations observed in the repository.
- It is organized to support decision making for future autonomous agents and feature planning.

## 2. Architecture (Expanded)

- Frontend: React + Vite, with a layered Context/provider stack for cross-cutting concerns (RBAC, Tenant, Notifications, Team, Documents, Projects, Calendar, etc.).
- Backend: Supabase (PostgreSQL) as the data store and auth provider; uses REST RPC endpoints and storage for files.
- Data flow: UI -> Supabase client -> DB; realtime subscriptions feed UI updates; RPC functions encapsulate domain logic.
- Multi-tenant strategy: Implemented via tenants and tenant_config tables; branding and feature flags per tenant; tenant isolation relies on RBAC policies and Row-Level Security (RLS) where implemented; some gaps observed in policies.
- External integrations: Supabase suite (Auth, DB, Storage, Realtime). Firebase is imported but not used in current code.
- Deployment environment assumptions: env vars for Supabase URL and anon key present in client build; no explicit per-tenant instances observed in repo.

## 3. Data Model (Summary)

- Core layers: multi-tenant tables (tenants, tenant_config, profiles), RBAC (roles, permissions, user_roles, role_permissions), and domain modules (projects, CRM/leads, calendar, documents, finances, analytics).
- Ownership: owner_id, tenant_id, and user_id relationships govern ownership; tenant isolation is enforced in some areas via RLS but not uniformly across all tables.
- Source of truth: auth.users for authentication; profiles for user metadata; tenant_config for tenant-wide settings; domain tables for application data.
- Mutable vs immutable: audit logs (activity_logs, activities) are append-only; many domain tables are mutable (updates and inserts) but logs are intended to preserve history.
- Special notes: project_credentials stores credentials in plain text (security issue); there are duplicate finance tables (finances vs finance_records) and duplication in activity tracking tables (activities vs activity_logs).

## 4. Business Logic (Important rules)

- RBAC foundation: Roles/permissions with mappings; owner role has broad access; system roles flagged as is_system; permissions gate UI behavior and server checks.
- Invitations and onboarding: Invitations table referenced by flows; tokens must be unique and time-bound (needs confirmation in schema).
- Lead-to-project workflow: Leads have metadata including ai_analysis; on conversion, a new project is created and the lead is marked closed with cross-referenced metadata and optional notification.
- Branding and per-tenant configuration: Branding JSON in tenant_config; CSS variables applied at runtime and used to customize branding across the app; tenant_config flags toggle modules (sales, team, notifications, etc.).
- Data security: Password storage for project credentials is in clear text; RLS policies exist but cross-table enforcement is incomplete; UI gating relies on client-side checks supplemented by server policies.

## 5. Frontend Flows (User journeys)

- Authentication and Invite: Sign-in/up flows; accept invite tokens via AcceptInvite.tsx flow; profile and tenant assignment occur during onboarding.
- Dashboard: Branding and feature flags shape the visible UI; task lists and project cards reflect current data and permissions.
- Lead management: In Sales pages leads are listed; potential AI analysis fields exist for leads; conversion to projects is available via a dedicated hook and RPCs.
- Projects & Tasks: Creating projects, assigning tasks, tracking progress; real-time updates via Supabase channel subscriptions.
- Documents & Calendar: Document upload and storage management; calendar events with attendees and reminders, linked to projects/clients.
- Notifications & Activity: Notifications table drives user alerts; activity logs provide auditing feed.
- Administration: TenantSettings and ConfigurationModal enable per-tenant branding and module toggles; RBAC controls access to roles/users management.

## 6. Failure & Regression Risks (Key risk zones)

- Mock data fallbacks could mask real-data issues in production.
- RLS policies are not consistently enforcing tenant isolation across all domain tables.
- Plain-text credentials in project_credentials pose a critical security risk.
- Duplicated financial tables (finances vs finance_records) and duplicate activity systems (activities vs activity_logs) create potential data integrity issues.
- Real-time subscriptions, if not cleaned correctly, can leak memory or cause stale UI state on navigation.
- AI integration is not wired; leads contain ai_analysis data structure but no runtime AI calls.
- Incomplete or missing external services (email providers, webhook endpoints) may block onboarding/invitations.

## 7. Documentation Gaps

- Missing or unclear schema for invitations table and its triggers.
- No dedicated Finance UI context; Finance domain cross-cuts with ProjectsContext.
- No explicit API/endpoint documentation for RPCs like is_admin, create_notification, or get_tenant_branding.
- No data retention policy or data lifecycle management documented.
- Deployment and environment management not documented.

## 8. Agentization (Domain-to-Agent mapping)

Refer to AGENTS.md for the detailed mapping. In short:
- auth-agent: Identity, onboarding, invitations
- tenant-agent: Tenant branding & config, per-tenant feature flags
- security-agent: RBAC, permission checks, role assignments
- project-agent: Projects, tasks, milestones, finances linkage
- crm-agent: Leads, clients, lead-to-project conversion
- finance-agent: Financial data & health (phase 2+)
- calendar-agent: Calendar events and scheduling
- document-agent: Documents and storage
- team-agent: People, notifications, activity
- analytics-agent: Metrics and insights

## 9. Unknowns / Ambiguities

- Multi-tenant strategy: single DB with per-tenant isolation vs multi-instance per tenant
- AI integration approach: external service vs local; key management
- Email provider configuration for invitations/magic links
- Exact migration status and canonical finance table
- Whether mock fallbacks are intended for production
- Exact business rules for lead status transitions
- Whether Firebase references are legacy or planned

## 10. Appendices

- Migration catalog and schema references are under /migrations.
- Key files referenced: contexts, hooks, components, and pages (paths are listed in AGENTS.md).
- File references: AGENTS.md contains domain-to-agent mapping and responsibilities.

---

## Version & Change Log

- This document is auto-generated from project state and planning discussions. Update when architecture or major domain boundaries change.

- Product & Intent: multi-tenant SaaS for project mgmt + CRM with white-label branding
- Architecture: Frontend React + Supabase backend (Auth/DB/Storage/Realtime)
- Data Model: multi-tenant schema with tenants, tenant_config, profiles, RBAC (roles/permissions), and domain tables (projects, CRM, calendar, documents, etc.)
- Core Workflows: lead-to-project conversion, project lifecycle, branding, invites, notifications
- Security & Compliance: RBAC, minimal strict policies, but noted issues like plain-text credentials in project_credentials
- Risks: mock data fallbacks, RLs gaps, data duplication (finances/finance_records, activities/activity_logs)
- Agentization: mapping of domains to agents for autonomous evolution
- Unknowns: areas requiring decisions (multi-tenant strategy, AI integration, etc.)

# SYSTEM.md — eneas-os System Truth

## Product Overview

**eneas-os** is a multi-tenant SaaS platform for project management and CRM with white-label branding capabilities.

## Architecture

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React + Vite | UI with Context/Provider stack |
| Backend | Supabase | PostgreSQL, Auth, Storage, Realtime |
| Multi-tenant | RLS + tenant_id | Tenant isolation |
| Auth | Supabase Auth | User authentication |

## Data Model

### Core Tables
- `tenants` — Tenant registry
- `tenant_config` — Per-tenant settings, branding, feature flags
- `profiles` — User profiles linked to auth.users

### RBAC Tables
- `roles` — Role definitions
- `permissions` — Permission definitions
- `user_roles` — User-role assignments
- `role_permissions` — Role-permission mappings

### Domain Tables
- `projects`, `tasks`, `milestones` — Project management
- `leads`, `clients` — CRM
- `documents` — Document storage
- `calendar_events` — Calendar
- `finances`, `finance_records` — Financial data (DUPLICATE - needs resolution)
- `activities`, `activity_logs` — Activity tracking (DUPLICATE - needs resolution)
- `notifications` — User notifications
- `project_credentials` — Credentials (SECURITY ISSUE: plain text)
- `invitations` — User invitations

## Known Critical Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Plain-text credentials in project_credentials | CRITICAL | Open |
| RLS policies incomplete | HIGH | Open |
| Duplicate finance tables | MEDIUM | Open |
| Duplicate activity tables | MEDIUM | Open |

## Multi-tenant Strategy

Current: Single database with Row-Level Security (RLS) policies.
Status: RLS not consistently applied across all tables.

## External Integrations

- Supabase Auth
- Supabase Storage
- Supabase Realtime
- Firebase (imported but not used — legacy?)
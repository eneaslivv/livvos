# AGENTS.md — Agent Registry for eneas-os

## Overview

This system operates with 12 specialized agents plus 1 orchestrator.
Each agent has a defined domain, responsibilities, and constraints.

---

## Agent Status Matrix

| Agent | Status | Mode | Blocker |
|-------|--------|------|---------|
| core-guardian | ✅ Active | Orchestrate | None |
| auth-agent | ⚠️ Limited | Read-Only | Invitations schema unclear |
| tenant-agent | ✅ Active | Read-Validate | None |
| security-agent | 🚫 Blocked | Read-Only | Plain-text credentials |
| project-agent | ⚠️ Limited | Read-Validate | Credentials blocked |
| crm-agent | ⚠️ Limited | Read-Only | Status rules undefined |
| team-agent | ⚠️ Limited | Read-Only | Canonical table unclear |
| document-agent | ✅ Active | Read-Validate | None |
| calendar-agent | ✅ Active | Read-Validate | None |
| finance-agent | 🚫 Blocked | Read-Only | Duplicate tables |
| analytics-agent | ✅ Active | Read-Only | None (by design) |
| frontend-agent | ✅ Active | Validate | None |

---

## Domain Ownership Map

```
┌─────────────────────────────────────────────────────────────┐
│                    CORE GUARDIAN                            │
│              (Orchestration, Escalation)                    │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  auth-agent   │   │ tenant-agent  │   │security-agent │
│               │   │               │   │               │
│ • auth.users  │   │ • tenants     │   │ • roles       │
│ • profiles    │   │ • tenant_cfg  │   │ • permissions │
│ • invitations │   │ • branding    │   │ • user_roles  │
└───────────────┘   └───────────────┘   │ • RLS policies│
                                        └───────────────┘
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ project-agent │   │   crm-agent   │   │  team-agent   │
│               │   │               │   │               │
│ • projects    │◄──│ • leads       │   │ • notifications│
│ • tasks       │   │ • clients     │   │ • activities  │
│ • milestones  │   │               │   │ • activity_logs│
└───────────────┘   └───────────────┘   └───────────────┘
        │
        ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ finance-agent │   │document-agent │   │calendar-agent │
│               │   │               │   │               │
│ • finances    │   │ • documents   │   │ • calendar_evts│
│ • finance_recs│   │ • storage     │   │ • attendees   │
└───────────────┘   └───────────────┘   └───────────────┘

┌───────────────┐   ┌───────────────────────────────────┐
│analytics-agent│   │         frontend-agent            │
│               │   │                                   │
│ • READ-ONLY   │   │ • All UI components               │
│ • Aggregations│   │ • Contexts, hooks, routing        │
└───────────────┘   └───────────────────────────────────┘
```

---

## Cross-Domain Protocols

### Lead → Project Conversion
1. crm-agent: Analyzes lead readiness
2. crm-agent: Prepares conversion data
3. core-guardian: Validates cross-domain operation
4. project-agent: Creates project
5. crm-agent: Marks lead as converted
6. team-agent: Logs activity

### User Onboarding
1. auth-agent: Handles invitation acceptance
2. auth-agent: Creates profile
3. tenant-agent: Assigns tenant
4. security-agent: Assigns default role
5. team-agent: Creates welcome notification

### Document Upload
1. frontend-agent: Handles UI upload
2. document-agent: Validates and stores
3. team-agent: Logs activity
4. project-agent: Links to project (if applicable)

---

## Agent File Locations

Each agent is documented in: `cloud-code/agents/{agent-name}.md`
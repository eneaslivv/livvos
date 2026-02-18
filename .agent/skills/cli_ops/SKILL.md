---
name: cli_ops
description: Leverage the project's existing custom CLI for backend, security, and domain operations.
---

# CLI Operations Skill

This skill allows you to use the project's robust custom CLI system (`skills/`) to perform complex backend, security, and domain tasks.
ALWAYS prefer using this CLI over manual implementation for supported tasks.

## Usage

Run the CLI using the `npm run skill` command.

### 1. Discovery
To see available skills in the custom system:
```bash
npm run skill list
```

To get details about a specific skill:
```bash
npm run skill info <skill-name>
```

### 2. Execution
To execute a skill (e.g., `table-creation-with-rls`):
```bash
# Dry run first (recommended)
npm run skill load table-creation-with-rls --dry-run

# Execute
npm run skill load table-creation-with-rls
```

## Available Capabilities (Mapped to CLI)

Refer to `skills/registry.json` for the source of truth. Common capabilities include:

### Database & Security
- **Create Table with RLS**: `table-creation-with-rls`
- **Apply RLS Policies**: `rls-policy-implementation`
- **Migrate Data**: `data-migration-between-tables`

### Domain Logic
- **Project Finances**: `project-financial-calculation`
- **Lead Management**: `lead-status-transition-management`

## Workflow using this Skill

1. Identify the high-level intent (e.g., "I need to secure the projects table").
2. Run `npm run skill list` to find a matching CLI skill.
3. If a match is found, view its info with `npm run skill info <name>`.
4. Execute it using `npm run skill load <name>`.
5. If NO match is found, fall back to manual implementation (or other Antigravity skills).

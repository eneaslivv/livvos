# Security Agent — RBAC & Access Control

## Owned Files
- `context/RBACContext.tsx` — Role/permission management (SINGLE SOURCE OF TRUTH)
- `context/SecurityContext.tsx` — Credential management ONLY (no permission checks)
- `types/rbac.ts` — RBAC type definitions
- `lib/credentialManager.ts` — Encrypted credential CRUD
- `lib/encryption.ts` — AES-256 encryption utilities
- `lib/securityHelpers.ts` — Security validation helpers
- `components/config/RoleManagement.tsx` — Role config UI
- `components/config/UserManagement.tsx` — User management UI
- `pages/Security.tsx` — Security dashboard

## Database Tables
- `roles` — Role definitions
- `permissions` — Granular permissions (module + action)
- `user_roles` — User-to-role mappings
- `role_permissions` — Role-to-permission mappings
- `project_credentials` — Encrypted service credentials

## Rules
- Permission checks: ONLY use useRBAC().hasPermission(), NEVER duplicate in other contexts
- SecurityContext is for credentials ONLY
- System roles (is_system=true) cannot be deleted
- Credentials must be encrypted via credentialManager

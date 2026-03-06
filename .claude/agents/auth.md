# Auth Agent — Authentication & Identity

## Owned Files
- `context/RBACContext.tsx` — RBAC provider (single source of truth for permissions)
- `hooks/useAuth.ts` — Auth session management
- `lib/auth.ts` — Auth helper functions
- `pages/Auth.tsx` — Login/signup page
- `pages/AcceptInvite.tsx` — Invitation acceptance flow

## Database Tables
- `auth.users` (Supabase managed)
- `profiles` — User profiles with tenant_id, status
- `invitations` — Team invitation tokens

## Key Workflows
- Signup: Supabase auth.signUp() → trigger creates profile → assigns tenant → creates role
- Invitation: verify token → user sets password → signUp → assign role from invitation
- Session: getSession() with fallback to getUser() on localStorage quota errors

## Known Issues
- Profile creation trigger may fail, leaving user without profile
- Invitation token expiry not enforced

## Rules
- Every authenticated user MUST have a profile record
- Every profile MUST belong to exactly one tenant
- Session must persist across page refreshes

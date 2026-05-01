-- =============================================
-- TENANT ISOLATION FIX — PART 3
-- =============================================
-- Final cleanup applied after parts 1 and 2:
--   • Three more policies that called is_admin() (which reads user_roles
--     globally with no tenant filter) were still granting cross-tenant
--     access to profiles and projects. Drop them.
--   • Part 1 wiped every global owner/admin user_roles row to neutralize
--     the leak. That over-corrected: the frontend RBAC reads user_roles
--     to gate UI buttons, so legitimate tenant admins lost permission to
--     do admin actions in their own workspaces. Re-create user_roles
--     entries from tenant_members so each user gets a role matching their
--     membership. This is safe now because no remaining RLS policy uses
--     user_roles for cross-tenant authorization.
--   • Profiles ended up with only "see own" SELECT policies, hiding
--     teammates from each other inside the same tenant. Add a same-tenant
--     SELECT policy so the Team page works.

-- ─── Drop remaining is_admin() based cross-tenant policies ─────────

DROP POLICY IF EXISTS "Admins can manage profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can manage projects" ON projects;

-- ─── Restore user_roles for legitimate tenant members ──────────────

INSERT INTO user_roles (user_id, role_id)
SELECT tm.user_id, r.id
FROM tenant_members tm
JOIN roles r ON r.name = tm.role
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles ur
  WHERE ur.user_id = tm.user_id AND ur.role_id = r.id
);

-- ─── Same-tenant profile visibility ────────────────────────────────
-- Without this, the Team page renders blank because users can only see
-- their own profile.

DROP POLICY IF EXISTS "Users can see same-tenant profiles" ON profiles;
CREATE POLICY "Users can see same-tenant profiles" ON profiles FOR SELECT
  USING (tenant_id IS NOT NULL AND tenant_id = current_user_tenant());

NOTIFY pgrst, 'reload schema';

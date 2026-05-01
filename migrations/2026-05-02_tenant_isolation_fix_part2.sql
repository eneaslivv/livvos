-- =============================================
-- TENANT ISOLATION FIX — PART 2
-- =============================================
-- Part 1 cleared the live data leak by removing global admin user_roles and
-- patching the most-trafficked tables (projects/expenses/incomes/etc).
-- This part removes the same legacy patterns from the remaining sensitive
-- tables: leads, messages, milestones, passwords, project_credentials,
-- proposal_templates, tasks. The patterns were:
--   (a) `*_admin` policies that grant access whenever profiles.role = 'admin'
--       with no tenant filter.
--   (b) `OR (tenant_id IS NULL)` clauses that made null-tenant rows visible
--       to every signed-in user.
-- project_credentials is the most critical — it stores real secrets and any
-- profile with role='admin' could read all of them across tenants.

-- ─── Drop legacy *_admin policies ────────────────────────────────

DROP POLICY IF EXISTS leads_select_admin ON leads;
DROP POLICY IF EXISTS leads_update_admin ON leads;
DROP POLICY IF EXISTS leads_delete_admin ON leads;
DROP POLICY IF EXISTS messages_delete_admin ON messages;
DROP POLICY IF EXISTS milestones_select_admin ON milestones;
DROP POLICY IF EXISTS milestones_update_admin ON milestones;
DROP POLICY IF EXISTS milestones_delete_admin ON milestones;
DROP POLICY IF EXISTS credentials_select_admin ON project_credentials;
DROP POLICY IF EXISTS credentials_update_admin ON project_credentials;
DROP POLICY IF EXISTS credentials_delete_admin ON project_credentials;
DROP POLICY IF EXISTS projects_update_admin ON projects;
DROP POLICY IF EXISTS projects_delete_admin ON projects;
DROP POLICY IF EXISTS tasks_select_admin ON tasks;
DROP POLICY IF EXISTS tasks_update_admin ON tasks;
DROP POLICY IF EXISTS tasks_delete_admin ON tasks;

-- ─── Tighten policies that had OR (tenant_id IS NULL) ───────────

-- leads
DROP POLICY IF EXISTS leads_select_policy ON leads;
CREATE POLICY leads_select_policy ON leads FOR SELECT
  USING (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS leads_update_policy ON leads;
CREATE POLICY leads_update_policy ON leads FOR UPDATE
  USING (can_access_tenant(tenant_id));
DROP POLICY IF EXISTS leads_delete_policy ON leads;
CREATE POLICY leads_delete_policy ON leads FOR DELETE
  USING (can_access_tenant(tenant_id));

-- finances UPDATE (SELECT and DELETE were patched in part 1)
DROP POLICY IF EXISTS finances_update_policy ON finances;
CREATE POLICY finances_update_policy ON finances FOR UPDATE
  USING (can_access_tenant(tenant_id));

-- projects update/delete (SELECT was patched in part 1)
DROP POLICY IF EXISTS projects_update_policy ON projects;
CREATE POLICY projects_update_policy ON projects FOR UPDATE
  USING (can_access_tenant(tenant_id) OR (owner_id = auth.uid()));
DROP POLICY IF EXISTS projects_delete_policy ON projects;
CREATE POLICY projects_delete_policy ON projects FOR DELETE
  USING (can_access_tenant(tenant_id) OR (owner_id = auth.uid()));

-- tasks
DROP POLICY IF EXISTS tasks_select_policy ON tasks;
CREATE POLICY tasks_select_policy ON tasks FOR SELECT
  USING (
    can_access_tenant(tenant_id)
    OR (assignee_id = auth.uid())
    OR (owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = tasks.client_id AND c.auth_user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS tasks_update_policy ON tasks;
CREATE POLICY tasks_update_policy ON tasks FOR UPDATE
  USING (
    can_access_tenant(tenant_id)
    OR (assignee_id = auth.uid())
    OR (owner_id = auth.uid())
  );
DROP POLICY IF EXISTS tasks_delete_policy ON tasks;
CREATE POLICY tasks_delete_policy ON tasks FOR DELETE
  USING (
    can_access_tenant(tenant_id)
    OR (assignee_id = auth.uid())
    OR (owner_id = auth.uid())
  );

-- proposal_templates
DROP POLICY IF EXISTS proposal_templates_select ON proposal_templates;
CREATE POLICY proposal_templates_select ON proposal_templates FOR SELECT
  USING (can_access_tenant(tenant_id));

-- passwords — visibility-aware, but the OR (tenant_id IS NULL) clauses leaked.
-- Rebuild the policy strict on tenant scoping.
DROP POLICY IF EXISTS passwords_select_policy ON passwords;
CREATE POLICY passwords_select_policy ON passwords FOR SELECT
  USING (
    auth.uid() = created_by
    OR (visibility = 'team' AND can_access_tenant(tenant_id))
    OR (visibility = 'role' AND can_access_tenant(tenant_id))
  );

-- client_messages references clients.tenant_id IS NULL via subquery. Rebuild
-- without the null escape so a message attached to an orphan client cannot
-- leak across tenants.
DROP POLICY IF EXISTS client_messages_select_policy ON client_messages;
CREATE POLICY client_messages_select_policy ON client_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_messages.client_id
        AND (
          c.owner_id = auth.uid()
          OR (c.tenant_id IS NOT NULL AND can_access_tenant(c.tenant_id))
          OR c.auth_user_id = auth.uid()
        )
    )
  );

NOTIFY pgrst, 'reload schema';

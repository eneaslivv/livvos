-- =============================================================================
-- P0.3 — Policies para las 4 tablas con RLS habilitado pero 0 policies.
--
-- Aplicada en producción 2026-05-22 via MCP apply_migration:
-- migration name = rls_p0_policies_for_orphan_tables
--
-- Sin policies, RLS bloquea TODO desde clientes (anon + authenticated). Solo
-- service_role accede. Las features que dependen de estas tablas estaban
-- parcialmente rotas en frontend o usando service_role en edge fns.
--
-- Política especial para platform_admins:
--   - SELECT solo si is_platform_admin().
--   - NO INSERT/UPDATE/DELETE desde cliente. La tabla se gestiona solo desde
--     el dashboard de Supabase o via service_role en migrations. Esto preserva
--     la constraint de seguridad documentada en CLAUDE.md/MEMORY: lista locked
--     a eneasaldabe@gmail.com + hola@livv.systems.
-- =============================================================================

BEGIN;

-- ---------- platform_admins ---------------------------------------------------
CREATE POLICY platform_admins_select_self_check ON platform_admins
  FOR SELECT TO authenticated
  USING (is_platform_admin());

-- ---------- calendar_reminders ------------------------------------------------
CREATE POLICY calendar_reminders_tenant_select ON calendar_reminders
  FOR SELECT TO authenticated
  USING (
    (event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM calendar_events e
      WHERE e.id = calendar_reminders.event_id AND can_access_tenant(e.tenant_id)))
    OR
    (task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = calendar_reminders.task_id AND can_access_tenant(t.tenant_id)))
  );

CREATE POLICY calendar_reminders_tenant_insert ON calendar_reminders
  FOR INSERT TO authenticated
  WITH CHECK (
    (event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM calendar_events e
      WHERE e.id = calendar_reminders.event_id AND can_access_tenant(e.tenant_id)))
    OR
    (task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = calendar_reminders.task_id AND can_access_tenant(t.tenant_id)))
  );

CREATE POLICY calendar_reminders_tenant_update ON calendar_reminders
  FOR UPDATE TO authenticated
  USING (
    (event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM calendar_events e
      WHERE e.id = calendar_reminders.event_id AND can_access_tenant(e.tenant_id)))
    OR
    (task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = calendar_reminders.task_id AND can_access_tenant(t.tenant_id)))
  );

CREATE POLICY calendar_reminders_tenant_delete ON calendar_reminders
  FOR DELETE TO authenticated
  USING (
    (event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM calendar_events e
      WHERE e.id = calendar_reminders.event_id AND can_access_tenant(e.tenant_id)))
    OR
    (task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = calendar_reminders.task_id AND can_access_tenant(t.tenant_id)))
  );

-- ---------- event_labels ------------------------------------------------------
CREATE POLICY event_labels_tenant_select ON event_labels
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM calendar_events e
    WHERE e.id = event_labels.event_id AND can_access_tenant(e.tenant_id)));

CREATE POLICY event_labels_tenant_insert ON event_labels
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM calendar_events e
    WHERE e.id = event_labels.event_id AND can_access_tenant(e.tenant_id)));

CREATE POLICY event_labels_tenant_delete ON event_labels
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM calendar_events e
    WHERE e.id = event_labels.event_id AND can_access_tenant(e.tenant_id)));

-- ---------- project_members ---------------------------------------------------
CREATE POLICY project_members_select ON project_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_members.project_id AND can_access_tenant(p.tenant_id)
    )
  );

CREATE POLICY project_members_tenant_insert ON project_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_members.project_id AND can_access_tenant(p.tenant_id)));

CREATE POLICY project_members_tenant_update ON project_members
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_members.project_id AND can_access_tenant(p.tenant_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_members.project_id AND can_access_tenant(p.tenant_id)));

CREATE POLICY project_members_tenant_delete ON project_members
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_members.project_id AND can_access_tenant(p.tenant_id)));

COMMIT;

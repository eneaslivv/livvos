-- =============================================================================
-- P1 — Reemplazar WITH CHECK(true) por chequeo tenant-aware en 13 INSERT
-- policies. Defense-in-depth contra evasión/bypass del trigger BEFORE INSERT
-- que hoy es la única barrera (ej. set_task_tenant_id).
--
-- Continuación de 2026-05-22_rls_p0_drop_using_true_leaks.sql.
--
-- Tablas: activities, calendar_events, calendar_tasks, client_history,
-- client_messages, event_attendees, finances, notifications, profiles,
-- projects, proposal_signatures, task_comments, tasks.
--
-- Notas por tabla:
--   - notifications no tiene tenant_id → check por user_id.
--   - profiles → check por id (= auth.uid()).
--   - client_messages / event_attendees → tenant resuelto vía JOIN al padre.
--   - proposal_signatures → tenant scope. La firma pública anónima entra
--     vía submit_proposal_feedback() (SECURITY DEFINER), que bypassea RLS.
--   - Donde existe `owner_id` lo dejamos como branch alterna para no romper
--     inserts del primer evento/proyecto antes de que un trigger setee
--     tenant_id (caso documentado en 2026-03-18_fix_all_rls_tenant_isolation).
-- =============================================================================

BEGIN;

-- 1. activities -------------------------------------------------------------
DROP POLICY IF EXISTS activities_insert_policy ON activities;
DROP POLICY IF EXISTS activities_tenant_insert ON activities;
DROP POLICY IF EXISTS activities_insert ON activities;
CREATE POLICY activities_insert_policy ON activities
  FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id));

-- 2. calendar_events --------------------------------------------------------
DROP POLICY IF EXISTS calendar_events_insert_policy ON calendar_events;
DROP POLICY IF EXISTS calendar_events_insert ON calendar_events;
CREATE POLICY calendar_events_insert_policy ON calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id) OR owner_id = auth.uid());

-- 3. calendar_tasks ---------------------------------------------------------
DROP POLICY IF EXISTS calendar_tasks_insert_policy ON calendar_tasks;
DROP POLICY IF EXISTS calendar_tasks_insert ON calendar_tasks;
CREATE POLICY calendar_tasks_insert_policy ON calendar_tasks
  FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id) OR owner_id = auth.uid());

-- 4. client_history ---------------------------------------------------------
DROP POLICY IF EXISTS client_history_insert ON client_history;
DROP POLICY IF EXISTS client_history_insert_policy ON client_history;
DROP POLICY IF EXISTS client_history_modify ON client_history;
DROP POLICY IF EXISTS client_history_modify_policy ON client_history;
CREATE POLICY client_history_insert ON client_history
  FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id));

-- 5. client_messages --------------------------------------------------------
-- Team escribe a clientes de su tenant; cliente del portal escribe como sí
-- mismo. Mantenemos el branch de auth_user_id porque clients.tenant_id no
-- garantiza acceso al cliente del portal.
DROP POLICY IF EXISTS client_messages_insert_policy ON client_messages;
DROP POLICY IF EXISTS client_messages_insert ON client_messages;
DROP POLICY IF EXISTS client_messages_self_insert ON client_messages;
DROP POLICY IF EXISTS "Users can create messages for their clients" ON client_messages;
CREATE POLICY client_messages_insert_policy ON client_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_messages.client_id
        AND (
          can_access_tenant(c.tenant_id)
          OR c.owner_id = auth.uid()
          OR c.auth_user_id = auth.uid()
        )
    )
  );

-- 6. event_attendees --------------------------------------------------------
-- Tenant resuelto vía calendar_events; el attendee no es necesariamente el
-- caller (el dueño del evento sumando invitados).
DROP POLICY IF EXISTS event_attendees_insert_policy ON event_attendees;
DROP POLICY IF EXISTS event_attendees_modify_policy ON event_attendees;
DROP POLICY IF EXISTS "Users can manage attendees of their events" ON event_attendees;
CREATE POLICY event_attendees_insert_policy ON event_attendees
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = event_attendees.event_id
        AND (can_access_tenant(ce.tenant_id) OR ce.owner_id = auth.uid())
    )
  );

-- 7. finances ---------------------------------------------------------------
DROP POLICY IF EXISTS finances_insert_policy ON finances;
DROP POLICY IF EXISTS finances_modify_policy ON finances;
DROP POLICY IF EXISTS finances_insert ON finances;
CREATE POLICY finances_insert_policy ON finances
  FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id));

-- 8. notifications ----------------------------------------------------------
-- No tiene tenant_id; check por destinatario. create_notification() es
-- SECURITY DEFINER y bypassea RLS para inserts cross-user legítimos.
DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;
DROP POLICY IF EXISTS notifications_insert_policy ON notifications;
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert_policy ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 9. profiles ---------------------------------------------------------------
-- handle_new_user() es SECURITY DEFINER → bypassea RLS al crear el profile
-- de un signup. Inserts directos (upsert desde cliente) deben ser self-only.
DROP POLICY IF EXISTS profiles_insert ON profiles;
DROP POLICY IF EXISTS profiles_insert_policy ON profiles;
DROP POLICY IF EXISTS profiles_upsert_self ON profiles;
CREATE POLICY profiles_insert_policy ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- 10. projects --------------------------------------------------------------
DROP POLICY IF EXISTS projects_insert_policy ON projects;
DROP POLICY IF EXISTS projects_insert_own ON projects;
DROP POLICY IF EXISTS "Create Projects Policy" ON projects;
CREATE POLICY projects_insert_policy ON projects
  FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id) OR owner_id = auth.uid());

-- 11. proposal_signatures ---------------------------------------------------
-- Firma pública anónima va vía submit_proposal_feedback (SECURITY DEFINER),
-- así que es seguro restringir el path autenticado al tenant.
DROP POLICY IF EXISTS proposal_signatures_insert ON proposal_signatures;
DROP POLICY IF EXISTS proposal_signatures_insert_policy ON proposal_signatures;
CREATE POLICY proposal_signatures_insert ON proposal_signatures
  FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id));

-- 12. task_comments ---------------------------------------------------------
DROP POLICY IF EXISTS task_comments_insert_policy ON task_comments;
DROP POLICY IF EXISTS task_comments_insert ON task_comments;
DROP POLICY IF EXISTS task_comments_tenant ON task_comments;
CREATE POLICY task_comments_insert_policy ON task_comments
  FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id) OR user_id = auth.uid());

-- 13. tasks -----------------------------------------------------------------
-- set_task_tenant_id() BEFORE INSERT setea tenant_id desde profile/project,
-- así que can_access_tenant(tenant_id) pasa para inserts legítimos sin que
-- el cliente tenga que setearlo. owner_id branch cubre edge cases.
DROP POLICY IF EXISTS tasks_insert_policy ON tasks;
DROP POLICY IF EXISTS tasks_insert ON tasks;
CREATE POLICY tasks_insert_policy ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id) OR owner_id = auth.uid());

COMMIT;

NOTIFY pgrst, 'reload schema';

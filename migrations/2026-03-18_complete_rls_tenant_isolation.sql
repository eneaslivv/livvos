-- =============================================
-- COMPLETE RLS TENANT ISOLATION
-- Date: 2026-03-18
-- Purpose: Add missing tenant_id columns, backfill orphaned records,
--          and fix ALL remaining RLS policy gaps across 12 tables.
-- Follows: 2026-03-18_fix_all_rls_tenant_isolation.sql (6 tables)
-- =============================================

-- =============================================
-- SECTION 1: ADD MISSING tenant_id COLUMNS
-- =============================================

-- ideas (may not exist)
DO $$ BEGIN
  ALTER TABLE ideas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_ideas_tenant_id ON ideas(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- calendar_labels
ALTER TABLE calendar_labels ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_calendar_labels_tenant_id ON calendar_labels(tenant_id);

-- calendar_reminders
DO $$ BEGIN
  ALTER TABLE calendar_reminders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_calendar_reminders_tenant_id ON calendar_reminders(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- project_members
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_project_members_tenant_id ON project_members(tenant_id);

-- project_credentials
DO $$ BEGIN
  ALTER TABLE project_credentials ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_project_credentials_tenant_id ON project_credentials(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================
-- SECTION 2: BACKFILL ORPHANED RECORDS
-- =============================================

-- ideas: backfill from owner's profile (table may not exist)
DO $$ BEGIN
  UPDATE ideas i
  SET tenant_id = p.tenant_id
  FROM profiles p
  WHERE i.owner_id = p.id AND i.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN undefined_column THEN NULL;
END $$;

-- calendar_labels: backfill from owner's profile
UPDATE calendar_labels cl
SET tenant_id = p.tenant_id
FROM profiles p
WHERE cl.owner_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- calendar_reminders: backfill from parent calendar_events
DO $$ BEGIN
  UPDATE calendar_reminders cr
  SET tenant_id = ce.tenant_id
  FROM calendar_events ce
  WHERE cr.event_id = ce.id AND cr.tenant_id IS NULL AND ce.tenant_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- project_members: backfill from parent projects
UPDATE project_members pm
SET tenant_id = pr.tenant_id
FROM projects pr
WHERE pm.project_id = pr.id AND pm.tenant_id IS NULL AND pr.tenant_id IS NOT NULL;

-- project_credentials: backfill from parent projects
DO $$ BEGIN
  UPDATE project_credentials pc
  SET tenant_id = pr.tenant_id
  FROM projects pr
  WHERE pc.project_id = pr.id AND pc.tenant_id IS NULL AND pr.tenant_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- activity_logs: re-backfill any remaining NULL tenant_id (uses user_id, not owner_id)
UPDATE activity_logs al
SET tenant_id = p.tenant_id
FROM profiles p
WHERE al.tenant_id IS NULL AND al.user_id = p.id AND p.tenant_id IS NOT NULL;

-- passwords: backfill from creator's profile
UPDATE passwords pw
SET tenant_id = p.tenant_id
FROM profiles p
WHERE pw.created_by = p.id AND pw.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- messages: backfill from sender's profile
UPDATE messages m
SET tenant_id = p.tenant_id
FROM profiles p
WHERE m.sender_id = p.id AND m.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- quick_hits: backfill from creator's profile
UPDATE quick_hits qh
SET tenant_id = p.tenant_id
FROM profiles p
WHERE qh.created_by = p.id AND qh.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- =============================================
-- SECTION 3: GROUP 1 — New tenant_id column policies
-- =============================================

-- =============================================
-- IDEAS (table may not exist)
-- =============================================
DO $$ BEGIN
  ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "ideas_select_policy" ON ideas;
  DROP POLICY IF EXISTS "Users can view their own ideas" ON ideas;
  CREATE POLICY "ideas_select_policy" ON ideas
  FOR SELECT USING (
    can_access_tenant(tenant_id) OR owner_id = auth.uid()
  );

  DROP POLICY IF EXISTS "ideas_insert_policy" ON ideas;
  DROP POLICY IF EXISTS "Users can create their own ideas" ON ideas;
  CREATE POLICY "ideas_insert_policy" ON ideas
  FOR INSERT WITH CHECK (
    can_access_tenant(tenant_id) OR owner_id = auth.uid()
  );

  DROP POLICY IF EXISTS "ideas_update_policy" ON ideas;
  DROP POLICY IF EXISTS "Users can update their own ideas" ON ideas;
  CREATE POLICY "ideas_update_policy" ON ideas
  FOR UPDATE USING (
    can_access_tenant(tenant_id) OR owner_id = auth.uid()
  );

  DROP POLICY IF EXISTS "ideas_delete_policy" ON ideas;
  DROP POLICY IF EXISTS "Users can delete their own ideas" ON ideas;
  CREATE POLICY "ideas_delete_policy" ON ideas
  FOR DELETE USING (
    can_access_tenant(tenant_id) OR owner_id = auth.uid()
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================
-- CALENDAR_LABELS
-- =============================================
DROP POLICY IF EXISTS "calendar_labels_select_policy" ON calendar_labels;
DROP POLICY IF EXISTS "calendar_labels_insert_policy" ON calendar_labels;
DROP POLICY IF EXISTS "calendar_labels_update_policy" ON calendar_labels;
DROP POLICY IF EXISTS "calendar_labels_delete_policy" ON calendar_labels;
DROP POLICY IF EXISTS "Users can manage their own labels" ON calendar_labels;
DROP POLICY IF EXISTS "Users can manage labels" ON calendar_labels;

CREATE POLICY "calendar_labels_select_policy" ON calendar_labels
FOR SELECT USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

CREATE POLICY "calendar_labels_insert_policy" ON calendar_labels
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

CREATE POLICY "calendar_labels_update_policy" ON calendar_labels
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

CREATE POLICY "calendar_labels_delete_policy" ON calendar_labels
FOR DELETE USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

-- =============================================
-- CALENDAR_REMINDERS
-- =============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "calendar_reminders_select_policy" ON calendar_reminders;
  DROP POLICY IF EXISTS "calendar_reminders_insert_policy" ON calendar_reminders;
  DROP POLICY IF EXISTS "calendar_reminders_update_policy" ON calendar_reminders;
  DROP POLICY IF EXISTS "calendar_reminders_delete_policy" ON calendar_reminders;

  CREATE POLICY "calendar_reminders_select_policy" ON calendar_reminders
  FOR SELECT USING (
    can_access_tenant(tenant_id)
    OR EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = calendar_reminders.event_id AND ce.owner_id = auth.uid()
    )
  );

  CREATE POLICY "calendar_reminders_insert_policy" ON calendar_reminders
  FOR INSERT WITH CHECK (
    can_access_tenant(tenant_id)
  );

  CREATE POLICY "calendar_reminders_update_policy" ON calendar_reminders
  FOR UPDATE USING (
    can_access_tenant(tenant_id)
  );

  CREATE POLICY "calendar_reminders_delete_policy" ON calendar_reminders
  FOR DELETE USING (
    can_access_tenant(tenant_id)
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================
-- PROJECT_MEMBERS
-- =============================================
DROP POLICY IF EXISTS "project_members_select_policy" ON project_members;
DROP POLICY IF EXISTS "project_members_insert_policy" ON project_members;
DROP POLICY IF EXISTS "project_members_update_policy" ON project_members;
DROP POLICY IF EXISTS "project_members_delete_policy" ON project_members;
DROP POLICY IF EXISTS "project_members_manage_by_owner" ON project_members;
DROP POLICY IF EXISTS "Members can read their own membership" ON project_members;

CREATE POLICY "project_members_select_policy" ON project_members
FOR SELECT USING (
  can_access_tenant(tenant_id) OR member_id = auth.uid()
);

CREATE POLICY "project_members_insert_policy" ON project_members
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id)
);

CREATE POLICY "project_members_update_policy" ON project_members
FOR UPDATE USING (
  can_access_tenant(tenant_id)
);

CREATE POLICY "project_members_delete_policy" ON project_members
FOR DELETE USING (
  can_access_tenant(tenant_id)
);

-- =============================================
-- PROJECT_CREDENTIALS (sensitive — tenant-only, no personal fallback)
-- =============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_credentials_select_policy" ON project_credentials;
  DROP POLICY IF EXISTS "project_credentials_insert_policy" ON project_credentials;
  DROP POLICY IF EXISTS "project_credentials_update_policy" ON project_credentials;
  DROP POLICY IF EXISTS "project_credentials_delete_policy" ON project_credentials;

  CREATE POLICY "project_credentials_select_policy" ON project_credentials
  FOR SELECT USING (
    can_access_tenant(tenant_id)
  );

  CREATE POLICY "project_credentials_insert_policy" ON project_credentials
  FOR INSERT WITH CHECK (
    can_access_tenant(tenant_id)
  );

  CREATE POLICY "project_credentials_update_policy" ON project_credentials
  FOR UPDATE USING (
    can_access_tenant(tenant_id)
  );

  CREATE POLICY "project_credentials_delete_policy" ON project_credentials
  FOR DELETE USING (
    can_access_tenant(tenant_id)
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================
-- SECTION 4: GROUP 2 — Fix "tenant_id IS NULL" vulnerability
-- =============================================

-- =============================================
-- PASSWORDS: Remove "tenant_id IS NULL" from team/role visibility
-- =============================================
DROP POLICY IF EXISTS "passwords_select_policy" ON passwords;
DROP POLICY IF EXISTS "passwords_select_own" ON passwords;
CREATE POLICY "passwords_select_policy" ON passwords
FOR SELECT USING (
  auth.uid() = created_by
  OR (visibility = 'team' AND can_access_tenant(tenant_id))
  OR (visibility = 'role' AND can_access_tenant(tenant_id))
);

DROP POLICY IF EXISTS "passwords_insert_policy" ON passwords;
CREATE POLICY "passwords_insert_policy" ON passwords
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id)
);

-- UPDATE/DELETE: creator-only (already correct, just ensure clean state)
DROP POLICY IF EXISTS "passwords_update_policy" ON passwords;
CREATE POLICY "passwords_update_policy" ON passwords
FOR UPDATE USING (
  auth.uid() = created_by
);

DROP POLICY IF EXISTS "passwords_delete_policy" ON passwords;
CREATE POLICY "passwords_delete_policy" ON passwords
FOR DELETE USING (
  auth.uid() = created_by
);

-- =============================================
-- ACTIVITY_LOGS: Replace CASE WHEN with simple OR; make immutable
-- =============================================
DROP POLICY IF EXISTS "activity_logs_select_policy" ON activity_logs;
DROP POLICY IF EXISTS "Users can view logs" ON activity_logs;
DROP POLICY IF EXISTS "Allow All Activity" ON activity_logs;
DROP POLICY IF EXISTS "client_logs_select" ON activity_logs;
CREATE POLICY "activity_logs_select_policy" ON activity_logs
FOR SELECT USING (
  can_access_tenant(tenant_id) OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "activity_logs_insert_policy" ON activity_logs;
DROP POLICY IF EXISTS "Users can insert logs" ON activity_logs;
CREATE POLICY "activity_logs_insert_policy" ON activity_logs
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id) OR auth.uid() = user_id
);

-- Audit logs should be immutable: no updates or deletes
DROP POLICY IF EXISTS "activity_logs_update_policy" ON activity_logs;
DROP POLICY IF EXISTS "Users can update own logs" ON activity_logs;
CREATE POLICY "activity_logs_update_policy" ON activity_logs
FOR UPDATE USING (false);

DROP POLICY IF EXISTS "activity_logs_delete_policy" ON activity_logs;
DROP POLICY IF EXISTS "Users can delete own logs" ON activity_logs;
CREATE POLICY "activity_logs_delete_policy" ON activity_logs
FOR DELETE USING (false);

-- =============================================
-- SECTION 5: GROUP 3 — Fix broken column references
-- =============================================

-- =============================================
-- MESSAGES: Fix from_user_id/to_user_id → sender_id/recipient_id
-- =============================================
DROP POLICY IF EXISTS "messages_select_policy" ON messages;
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert_policy" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_update_policy" ON messages;
DROP POLICY IF EXISTS "messages_immutable_policy" ON messages;
DROP POLICY IF EXISTS "messages_delete_policy" ON messages;

CREATE POLICY "messages_select_policy" ON messages
FOR SELECT USING (
  sender_id = auth.uid() OR recipient_id = auth.uid() OR can_access_tenant(tenant_id)
);

CREATE POLICY "messages_insert_policy" ON messages
FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND can_access_tenant(tenant_id)
);

-- Messages are immutable once sent
CREATE POLICY "messages_update_policy" ON messages
FOR UPDATE USING (false);

CREATE POLICY "messages_delete_policy" ON messages
FOR DELETE USING (
  sender_id = auth.uid()
);

-- =============================================
-- QUICK_HITS: Fix assigned_to → created_by
-- =============================================
DROP POLICY IF EXISTS "quick_hits_select_policy" ON quick_hits;
DROP POLICY IF EXISTS "quick_hits_select" ON quick_hits;
DROP POLICY IF EXISTS "quick_hits_insert_policy" ON quick_hits;
DROP POLICY IF EXISTS "quick_hits_insert" ON quick_hits;
DROP POLICY IF EXISTS "quick_hits_update_policy" ON quick_hits;
DROP POLICY IF EXISTS "quick_hits_modify_policy" ON quick_hits;
DROP POLICY IF EXISTS "quick_hits_delete_policy" ON quick_hits;

CREATE POLICY "quick_hits_select_policy" ON quick_hits
FOR SELECT USING (
  can_access_tenant(tenant_id) OR created_by = auth.uid()
);

CREATE POLICY "quick_hits_insert_policy" ON quick_hits
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id)
);

CREATE POLICY "quick_hits_update_policy" ON quick_hits
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR created_by = auth.uid()
);

CREATE POLICY "quick_hits_delete_policy" ON quick_hits
FOR DELETE USING (
  can_access_tenant(tenant_id) OR created_by = auth.uid()
);

-- =============================================
-- SECTION 6: GROUP 4 — Missing policies
-- =============================================

-- =============================================
-- EVENT_LABELS: Junction table — derive access from parent event
-- =============================================
DROP POLICY IF EXISTS "event_labels_select_policy" ON event_labels;
DROP POLICY IF EXISTS "event_labels_insert_policy" ON event_labels;
DROP POLICY IF EXISTS "event_labels_update_policy" ON event_labels;
DROP POLICY IF EXISTS "event_labels_delete_policy" ON event_labels;

CREATE POLICY "event_labels_select_policy" ON event_labels
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM calendar_events ce
    WHERE ce.id = event_labels.event_id
    AND (can_access_tenant(ce.tenant_id) OR ce.owner_id = auth.uid())
  )
);

CREATE POLICY "event_labels_insert_policy" ON event_labels
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM calendar_events ce
    WHERE ce.id = event_labels.event_id
    AND (can_access_tenant(ce.tenant_id) OR ce.owner_id = auth.uid())
  )
);

CREATE POLICY "event_labels_delete_policy" ON event_labels
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM calendar_events ce
    WHERE ce.id = event_labels.event_id
    AND (can_access_tenant(ce.tenant_id) OR ce.owner_id = auth.uid())
  )
);

-- =============================================
-- SECTION 7: RELOAD
-- =============================================
NOTIFY pgrst, 'reload config';

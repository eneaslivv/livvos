-- ============================================================================
-- Migration: Fix Database Integrity Issues
-- Date: 2026-02-23
-- Description: Comprehensive fix for missing FKs, ON DELETE handlers,
--              CHECK constraints, indexes, and multi-tenant isolation gaps.
-- All operations are idempotent (safe to run multiple times).
-- ============================================================================

-- ============================================================================
-- SECTION A: Fix Missing Foreign Keys
-- ============================================================================

-- A1. project_members.member_id → auth.users(id) ON DELETE CASCADE
-- Currently has NO foreign key at all — any UUID can be inserted.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_members_member_id_fkey'
  ) THEN
    ALTER TABLE project_members
      ADD CONSTRAINT project_members_member_id_fkey
      FOREIGN KEY (member_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- A2. calendar_tasks.project_id → projects(id) ON DELETE SET NULL
-- Column was added via ALTER but no FK constraint was attached.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_tasks' AND column_name = 'project_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_tasks_project_id_fkey'
  ) THEN
    ALTER TABLE calendar_tasks
      ADD CONSTRAINT calendar_tasks_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- SECTION B: Fix Missing ON DELETE Handlers
-- ============================================================================

-- B1. client_tasks.owner_id: re-add with ON DELETE SET NULL
-- Original: REFERENCES auth.users(id) without cascade behavior.
-- Deleting a user should not delete client tasks, just null out the owner.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_tasks_owner_id_fkey'
  ) THEN
    ALTER TABLE client_tasks DROP CONSTRAINT client_tasks_owner_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_tasks' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE client_tasks
      ADD CONSTRAINT client_tasks_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- B2. client_tasks.assigned_to → auth.users(id) ON DELETE SET NULL
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_tasks' AND column_name = 'assigned_to'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_tasks_assigned_to_fkey'
  ) THEN
    ALTER TABLE client_tasks
      ADD CONSTRAINT client_tasks_assigned_to_fkey
      FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- B3. client_messages.created_by → auth.users(id) ON DELETE SET NULL
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_messages' AND column_name = 'created_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_messages_created_by_fkey'
  ) THEN
    ALTER TABLE client_messages
      ADD CONSTRAINT client_messages_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- B4. client_history.created_by → auth.users(id) ON DELETE SET NULL
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_history' AND column_name = 'created_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_history_created_by_fkey'
  ) THEN
    ALTER TABLE client_history
      ADD CONSTRAINT client_history_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- SECTION C: Multi-Tenant Isolation — Add tenant_id to project_members
-- ============================================================================

-- C1. Add tenant_id column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_members' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE project_members ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_project_members_tenant_id ON project_members(tenant_id);
  END IF;
END $$;

-- C2. Backfill tenant_id from the parent projects table
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_members' AND column_name = 'tenant_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'tenant_id'
  ) THEN
    EXECUTE 'UPDATE project_members pm SET tenant_id = p.tenant_id FROM projects p WHERE pm.tenant_id IS NULL AND pm.project_id = p.id';
  END IF;
END $$;

-- C3. RLS policy for project_members using tenant isolation
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_members' AND policyname = 'project_members_tenant_isolation'
  ) THEN
    EXECUTE 'CREATE POLICY project_members_tenant_isolation ON project_members FOR ALL USING (can_access_tenant(tenant_id))';
  END IF;
END $$;

-- ============================================================================
-- SECTION D: CHECK Constraints on Status/Enum Fields
-- ============================================================================

-- D1. proposals.status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_status_check'
  ) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
      CHECK (status IN ('draft', 'sent', 'approved', 'rejected'));
  END IF;
END $$;

-- D2. clients.status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_status_check'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_status_check
      CHECK (status IN ('active', 'inactive', 'prospect', 'archived'));
  END IF;
END $$;

-- D3. tasks.status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_status_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
      CHECK (status IN ('todo', 'in_progress', 'done', 'blocked'));
  END IF;
END $$;

-- D4. tasks.priority
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
      CHECK (priority IN ('low', 'medium', 'high'));
  END IF;
END $$;

-- D5. projects.status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_status_check
      CHECK (status IN ('Active', 'Pending', 'Review', 'Completed', 'Archived'));
  END IF;
END $$;

-- D6. client_tasks.priority
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_tasks_priority_check'
  ) THEN
    ALTER TABLE client_tasks ADD CONSTRAINT client_tasks_priority_check
      CHECK (priority IN ('low', 'medium', 'high'));
  END IF;
END $$;

-- ============================================================================
-- SECTION E: Missing Indexes on Foreign Key Columns
-- ============================================================================

-- Messages table
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);

-- Client CRM tables
CREATE INDEX IF NOT EXISTS idx_client_messages_created_by ON client_messages(created_by);
CREATE INDEX IF NOT EXISTS idx_client_tasks_assigned_to ON client_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_client_history_created_by ON client_history(created_by);

-- Project members
CREATE INDEX IF NOT EXISTS idx_project_members_member_id ON project_members(member_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);

-- Proposals
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_client_id ON proposals(client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created_by ON proposals(created_by);

-- Calendar
CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_id ON event_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by);

-- ============================================================================
-- SECTION F: Reload PostgREST Schema Cache
-- ============================================================================

NOTIFY pgrst, 'reload config';

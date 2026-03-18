-- =============================================
-- CRITICAL: Remove "tenant_id IS NULL" from ALL RLS policies
-- This clause caused cross-tenant data leakage
-- =============================================

-- First: backfill ALL orphaned records so nothing becomes invisible

-- Calendar events
UPDATE calendar_events ce
SET tenant_id = p.tenant_id
FROM profiles p
WHERE ce.tenant_id IS NULL AND ce.owner_id = p.id AND p.tenant_id IS NOT NULL;

-- Calendar tasks (if table exists)
DO $$ BEGIN
  UPDATE calendar_tasks ct
  SET tenant_id = p.tenant_id
  FROM profiles p
  WHERE ct.tenant_id IS NULL AND ct.owner_id = p.id AND p.tenant_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Tasks
UPDATE tasks t
SET tenant_id = p.tenant_id
FROM profiles p
WHERE t.tenant_id IS NULL AND t.owner_id = p.id AND p.tenant_id IS NOT NULL;

-- Projects
UPDATE projects pr
SET tenant_id = p.tenant_id
FROM profiles p
WHERE pr.tenant_id IS NULL AND pr.owner_id = p.id AND p.tenant_id IS NOT NULL;

-- Documents
DO $$ BEGIN
  UPDATE documents d
  SET tenant_id = p.tenant_id
  FROM profiles p
  WHERE d.tenant_id IS NULL AND d.owner_id = p.id AND p.tenant_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================
-- CALENDAR_EVENTS: fix RLS
-- =============================================
DROP POLICY IF EXISTS "calendar_events_select_policy" ON calendar_events;
CREATE POLICY "calendar_events_select_policy" ON calendar_events
FOR SELECT USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "calendar_events_insert_policy" ON calendar_events;
CREATE POLICY "calendar_events_insert_policy" ON calendar_events
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "calendar_events_update_policy" ON calendar_events;
CREATE POLICY "calendar_events_update_policy" ON calendar_events
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "calendar_events_delete_policy" ON calendar_events;
CREATE POLICY "calendar_events_delete_policy" ON calendar_events
FOR DELETE USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

-- =============================================
-- CALENDAR_TASKS: fix RLS
-- =============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "calendar_tasks_select_policy" ON calendar_tasks;
  CREATE POLICY "calendar_tasks_select_policy" ON calendar_tasks
  FOR SELECT USING (
    can_access_tenant(tenant_id) OR owner_id = auth.uid() OR assignee_id = auth.uid()
  );

  DROP POLICY IF EXISTS "calendar_tasks_insert_policy" ON calendar_tasks;
  CREATE POLICY "calendar_tasks_insert_policy" ON calendar_tasks
  FOR INSERT WITH CHECK (
    can_access_tenant(tenant_id) OR owner_id = auth.uid()
  );

  DROP POLICY IF EXISTS "calendar_tasks_update_policy" ON calendar_tasks;
  CREATE POLICY "calendar_tasks_update_policy" ON calendar_tasks
  FOR UPDATE USING (
    can_access_tenant(tenant_id) OR owner_id = auth.uid() OR assignee_id = auth.uid()
  );

  DROP POLICY IF EXISTS "calendar_tasks_delete_policy" ON calendar_tasks;
  CREATE POLICY "calendar_tasks_delete_policy" ON calendar_tasks
  FOR DELETE USING (
    can_access_tenant(tenant_id) OR owner_id = auth.uid()
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================
-- TASKS: fix RLS
-- =============================================
DROP POLICY IF EXISTS "tasks_select_policy" ON tasks;
CREATE POLICY "tasks_select_policy" ON tasks
FOR SELECT USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "tasks_insert_policy" ON tasks;
CREATE POLICY "tasks_insert_policy" ON tasks
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "tasks_update_policy" ON tasks;
CREATE POLICY "tasks_update_policy" ON tasks
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "tasks_delete_policy" ON tasks;
CREATE POLICY "tasks_delete_policy" ON tasks
FOR DELETE USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

-- =============================================
-- PROJECTS: fix RLS
-- =============================================
DROP POLICY IF EXISTS "projects_select_policy" ON projects;
CREATE POLICY "projects_select_policy" ON projects
FOR SELECT USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "projects_insert_policy" ON projects;
CREATE POLICY "projects_insert_policy" ON projects
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "projects_update_policy" ON projects;
CREATE POLICY "projects_update_policy" ON projects
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "projects_delete_policy" ON projects;
CREATE POLICY "projects_delete_policy" ON projects
FOR DELETE USING (
  can_access_tenant(tenant_id) OR owner_id = auth.uid()
);

-- =============================================
-- TASK_COMMENTS: fix RLS (if exists)
-- =============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "task_comments_select_policy" ON task_comments;
  DROP POLICY IF EXISTS "task_comments_tenant" ON task_comments;
  CREATE POLICY "task_comments_select_policy" ON task_comments
  FOR SELECT USING (
    can_access_tenant(tenant_id) OR user_id = auth.uid()
  );

  DROP POLICY IF EXISTS "task_comments_insert_policy" ON task_comments;
  CREATE POLICY "task_comments_insert_policy" ON task_comments
  FOR INSERT WITH CHECK (TRUE);

  DROP POLICY IF EXISTS "task_comments_update_policy" ON task_comments;
  CREATE POLICY "task_comments_update_policy" ON task_comments
  FOR UPDATE USING (
    can_access_tenant(tenant_id) OR user_id = auth.uid()
  );

  DROP POLICY IF EXISTS "task_comments_delete_policy" ON task_comments;
  CREATE POLICY "task_comments_delete_policy" ON task_comments
  FOR DELETE USING (
    can_access_tenant(tenant_id) OR user_id = auth.uid()
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload config';

-- =============================================
-- Task mirroring across connected agencies
--
-- A task created in tenant A can be "shared" with a connected tenant B.
-- A twin task is created in B and the two stay in sync (title, status,
-- description, dates, priority, completion).
--
-- Sharing requires an ACCEPTED row in tenant_connections between A and B
-- (parent->child or child->parent). RLS on tasks already isolates by
-- tenant_id, so each side only sees its own row.
-- =============================================

-- 1. Schema additions on tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS mirror_pair_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS mirror_origin_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_mirror_pair_id ON tasks(mirror_pair_id) WHERE mirror_pair_id IS NOT NULL;

-- 2. Helper: list tenants the current user can share with (parent + accepted children)
CREATE OR REPLACE FUNCTION get_connected_agencies()
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  logo_url TEXT,
  relationship TEXT  -- 'parent' | 'child'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_tenant UUID;
BEGIN
  SELECT p.tenant_id INTO v_active_tenant FROM profiles p WHERE p.id = auth.uid();
  IF v_active_tenant IS NULL THEN
    RETURN;
  END IF;

  -- Children: tenants where current is the parent (super-agency case)
  RETURN QUERY
    SELECT t.id, t.name, t.logo_url, 'child'::TEXT
    FROM tenant_connections tc
    JOIN tenants t ON t.id = tc.child_tenant_id
    WHERE tc.parent_tenant_id = v_active_tenant
      AND tc.status = 'accepted'
      AND tc.child_tenant_id IS NOT NULL;

  -- Parent: the tenant that connected to ours (child-agency case)
  RETURN QUERY
    SELECT t.id, t.name, t.logo_url, 'parent'::TEXT
    FROM tenant_connections tc
    JOIN tenants t ON t.id = tc.parent_tenant_id
    WHERE tc.child_tenant_id = v_active_tenant
      AND tc.status = 'accepted';
END;
$$;

GRANT EXECUTE ON FUNCTION get_connected_agencies() TO authenticated;

-- 3. RPC: share an existing task with a connected tenant (creates the mirror twin)
CREATE OR REPLACE FUNCTION share_task_with_tenant(p_task_id UUID, p_target_tenant_id UUID)
RETURNS UUID  -- returns the mirror task id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_tenant UUID;
  v_task tasks%ROWTYPE;
  v_pair_id UUID;
  v_mirror_id UUID;
  v_is_connected BOOLEAN;
BEGIN
  SELECT p.tenant_id INTO v_active_tenant FROM profiles p WHERE p.id = auth.uid();
  IF v_active_tenant IS NULL THEN
    RAISE EXCEPTION 'No active tenant';
  END IF;

  -- Load source task & verify caller's tenant owns it
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  IF v_task.tenant_id IS DISTINCT FROM v_active_tenant THEN
    RAISE EXCEPTION 'Cannot share a task from a different tenant';
  END IF;

  -- Verify there is an accepted connection between the two tenants
  SELECT EXISTS (
    SELECT 1 FROM tenant_connections
    WHERE status = 'accepted'
      AND (
        (parent_tenant_id = v_active_tenant AND child_tenant_id = p_target_tenant_id)
        OR (parent_tenant_id = p_target_tenant_id AND child_tenant_id = v_active_tenant)
      )
  ) INTO v_is_connected;

  IF NOT v_is_connected THEN
    RAISE EXCEPTION 'Tenants are not connected';
  END IF;

  -- Already shared? return the existing mirror id, idempotent
  IF v_task.mirror_pair_id IS NOT NULL THEN
    SELECT id INTO v_mirror_id FROM tasks
    WHERE mirror_pair_id = v_task.mirror_pair_id
      AND id <> p_task_id
      AND tenant_id = p_target_tenant_id
    LIMIT 1;
    IF v_mirror_id IS NOT NULL THEN
      RETURN v_mirror_id;
    END IF;
    v_pair_id := v_task.mirror_pair_id;
  ELSE
    v_pair_id := gen_random_uuid();
    UPDATE tasks SET mirror_pair_id = v_pair_id, mirror_origin_tenant_id = v_active_tenant
    WHERE id = p_task_id;
  END IF;

  -- Insert mirror twin under target tenant (set session var so trigger doesn't loop)
  PERFORM set_config('app.mirror_skip_trigger', 'true', true);
  INSERT INTO tasks (
    title, description, completed, priority, status,
    project_id, client_id, due_date, start_date, end_date,
    start_time, duration, parent_task_id, tenant_id,
    mirror_pair_id, mirror_origin_tenant_id, owner_id
  ) VALUES (
    v_task.title, v_task.description, COALESCE(v_task.completed, FALSE),
    v_task.priority, v_task.status,
    NULL, NULL, v_task.due_date, v_task.start_date, v_task.end_date,
    v_task.start_time, v_task.duration, NULL, p_target_tenant_id,
    v_pair_id, v_active_tenant, auth.uid()
  ) RETURNING id INTO v_mirror_id;
  PERFORM set_config('app.mirror_skip_trigger', '', true);

  RETURN v_mirror_id;
END;
$$;

GRANT EXECUTE ON FUNCTION share_task_with_tenant(UUID, UUID) TO authenticated;

-- 4. RPC: stop sharing — deletes the mirror twin and clears pair_id on origin
CREATE OR REPLACE FUNCTION unshare_task(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_tenant UUID;
  v_task tasks%ROWTYPE;
BEGIN
  SELECT p.tenant_id INTO v_active_tenant FROM profiles p WHERE p.id = auth.uid();
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  IF v_task.tenant_id IS DISTINCT FROM v_active_tenant THEN
    RAISE EXCEPTION 'Cannot unshare from a different tenant';
  END IF;
  IF v_task.mirror_pair_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.mirror_skip_trigger', 'true', true);
  DELETE FROM tasks WHERE mirror_pair_id = v_task.mirror_pair_id AND id <> p_task_id;
  UPDATE tasks SET mirror_pair_id = NULL, mirror_origin_tenant_id = NULL WHERE id = p_task_id;
  PERFORM set_config('app.mirror_skip_trigger', '', true);
END;
$$;

GRANT EXECUTE ON FUNCTION unshare_task(UUID) TO authenticated;

-- 5. Trigger: on UPDATE, propagate field changes to the mirror twin
CREATE OR REPLACE FUNCTION sync_mirror_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip if we're inside a mirror operation already
  IF current_setting('app.mirror_skip_trigger', true) = 'true' THEN
    RETURN NEW;
  END IF;
  IF NEW.mirror_pair_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only sync if a mirror-relevant field actually changed
  IF (TG_OP = 'UPDATE') AND (
       NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.completed IS DISTINCT FROM OLD.completed
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.start_time IS DISTINCT FROM OLD.start_time
    OR NEW.duration IS DISTINCT FROM OLD.duration
  ) THEN
    PERFORM set_config('app.mirror_skip_trigger', 'true', true);
    UPDATE tasks SET
      title = NEW.title,
      description = NEW.description,
      completed = NEW.completed,
      priority = NEW.priority,
      status = NEW.status,
      due_date = NEW.due_date,
      start_date = NEW.start_date,
      end_date = NEW.end_date,
      start_time = NEW.start_time,
      duration = NEW.duration,
      updated_at = NOW()
    WHERE mirror_pair_id = NEW.mirror_pair_id AND id <> NEW.id;
    PERFORM set_config('app.mirror_skip_trigger', '', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mirror_task ON tasks;
CREATE TRIGGER trg_sync_mirror_task
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION sync_mirror_task();

-- 6. Trigger: on DELETE of one half, delete the other half
CREATE OR REPLACE FUNCTION delete_mirror_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.mirror_skip_trigger', true) = 'true' THEN
    RETURN OLD;
  END IF;
  IF OLD.mirror_pair_id IS NULL THEN
    RETURN OLD;
  END IF;

  PERFORM set_config('app.mirror_skip_trigger', 'true', true);
  DELETE FROM tasks WHERE mirror_pair_id = OLD.mirror_pair_id AND id <> OLD.id;
  PERFORM set_config('app.mirror_skip_trigger', '', true);

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_mirror_task ON tasks;
CREATE TRIGGER trg_delete_mirror_task
AFTER DELETE ON tasks
FOR EACH ROW
EXECUTE FUNCTION delete_mirror_task();

-- 7. Realtime: tasks already in publication, no change needed
NOTIFY pgrst, 'reload schema';

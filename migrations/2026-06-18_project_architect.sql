-- ============================================================
-- Project Architect: blueprints, generated projects, stages,
-- tasks, and the manual-edit training log.
-- Date: 2026-06-18
-- Description: An agent classifies a new project, applies a
--   canonical blueprint, and proposes well-divided delivery
--   stages and tasks. The model decides structure; the code
--   decides dates and persists. These tables are namespaced
--   (architect_*) so they do not collide with the existing
--   live `projects` / `tasks` tables, which have a different
--   shape and real data. `architect_projects.linked_project_id`
--   is the hook to later promote an approved plan into the
--   live Projects page.
-- ============================================================

-- 1. PROJECT_BLUEPRINTS
-- Canonical definition of how a project type is structured.
-- Editing a blueprint changes all future projects of that type.
-- tenant_id NULL = a shared starter template seeded by the
-- platform; a non-null row is a tenant's own calibrated version.
-- ============================================================
CREATE TABLE IF NOT EXISTS project_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'web_webflow', 'web_framer', 'app_react_native',
    'app_flutter', 'ai_integration', 'own_product'
  )),
  name TEXT NOT NULL,
  -- Ordered array of stages. Each stage:
  --   { name, order, effort_weight, default_tasks: [ { title, estimate_hours, depends_on } ] }
  -- effort_weight is 0..1 and weights across stages sum to ~1.
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_blueprints_tenant_id ON project_blueprints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_blueprints_type ON project_blueprints(type);

ALTER TABLE project_blueprints ENABLE ROW LEVEL SECURITY;

-- Read: shared templates (NULL tenant) OR your own tenant's rows.
DROP POLICY IF EXISTS "project_blueprints_select_policy" ON project_blueprints;
CREATE POLICY "project_blueprints_select_policy" ON project_blueprints
FOR SELECT USING (
  tenant_id IS NULL OR can_access_tenant(tenant_id)
);

-- Write: only your own tenant's rows. Shared templates are managed
-- through migrations with the service role, never edited by a tenant.
DROP POLICY IF EXISTS "project_blueprints_insert_policy" ON project_blueprints;
CREATE POLICY "project_blueprints_insert_policy" ON project_blueprints
FOR INSERT WITH CHECK (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "project_blueprints_update_policy" ON project_blueprints;
CREATE POLICY "project_blueprints_update_policy" ON project_blueprints
FOR UPDATE USING (
  can_access_tenant(tenant_id)
);

DROP POLICY IF EXISTS "project_blueprints_delete_policy" ON project_blueprints;
CREATE POLICY "project_blueprints_delete_policy" ON project_blueprints
FOR DELETE USING (
  can_access_tenant(tenant_id)
);

GRANT ALL ON project_blueprints TO authenticated;

-- 2. ARCHITECT_PROJECTS
-- A concrete project produced by the architect. Rich operating
-- state lives here. `linked_project_id` is null until (and if)
-- the plan is promoted into the live `projects` table.
-- ============================================================
CREATE TABLE IF NOT EXISTS architect_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'web_webflow', 'web_framer', 'app_react_native',
    'app_flutter', 'ai_integration', 'own_product'
  )),
  status TEXT NOT NULL DEFAULT 'discovery' CHECK (status IN (
    'discovery', 'in_progress', 'in_review', 'blocked', 'delivered', 'on_hold'
  )),
  start_date DATE,
  hard_deadline DATE,
  target_deadline DATE,
  stack JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- e.g. { "webflow": "...", "framer": "...", "repo": "...", "figma": "..." }
  links JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  single_threaded BOOLEAN NOT NULL DEFAULT FALSE,
  waiting_on_client BOOLEAN NOT NULL DEFAULT FALSE,
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  -- Hooks (not wired in this build): link to a real client + promote
  -- the plan into the live Projects page later.
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  linked_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_architect_projects_tenant_id ON architect_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_architect_projects_type ON architect_projects(type);
CREATE INDEX IF NOT EXISTS idx_architect_projects_status ON architect_projects(status);

ALTER TABLE architect_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "architect_projects_select_policy" ON architect_projects;
CREATE POLICY "architect_projects_select_policy" ON architect_projects
FOR SELECT USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "architect_projects_insert_policy" ON architect_projects;
CREATE POLICY "architect_projects_insert_policy" ON architect_projects
FOR INSERT WITH CHECK (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "architect_projects_update_policy" ON architect_projects;
CREATE POLICY "architect_projects_update_policy" ON architect_projects
FOR UPDATE USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "architect_projects_delete_policy" ON architect_projects;
CREATE POLICY "architect_projects_delete_policy" ON architect_projects
FOR DELETE USING (can_access_tenant(tenant_id));

GRANT ALL ON architect_projects TO authenticated;

-- 3. ARCHITECT_STAGES
-- Ordered delivery stages. planned_start / planned_end are
-- computed by code (the date planner), never by the model.
-- Access inherits from the parent project's tenant.
-- ============================================================
CREATE TABLE IF NOT EXISTS architect_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES architect_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- `order` is a reserved word, so this maps the spec's stage order.
  stage_order INTEGER NOT NULL DEFAULT 0,
  effort_weight NUMERIC NOT NULL DEFAULT 0 CHECK (effort_weight >= 0),
  planned_start DATE,
  planned_end DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'done', 'blocked'
  )),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_architect_stages_project_id ON architect_stages(project_id);

ALTER TABLE architect_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "architect_stages_select_policy" ON architect_stages;
CREATE POLICY "architect_stages_select_policy" ON architect_stages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM architect_projects p
    WHERE p.id = architect_stages.project_id
    AND can_access_tenant(p.tenant_id)
  )
);

DROP POLICY IF EXISTS "architect_stages_insert_policy" ON architect_stages;
CREATE POLICY "architect_stages_insert_policy" ON architect_stages
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM architect_projects p
    WHERE p.id = architect_stages.project_id
    AND can_access_tenant(p.tenant_id)
  )
);

DROP POLICY IF EXISTS "architect_stages_update_policy" ON architect_stages;
CREATE POLICY "architect_stages_update_policy" ON architect_stages
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM architect_projects p
    WHERE p.id = architect_stages.project_id
    AND can_access_tenant(p.tenant_id)
  )
);

DROP POLICY IF EXISTS "architect_stages_delete_policy" ON architect_stages;
CREATE POLICY "architect_stages_delete_policy" ON architect_stages
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM architect_projects p
    WHERE p.id = architect_stages.project_id
    AND can_access_tenant(p.tenant_id)
  )
);

GRANT ALL ON architect_stages TO authenticated;

-- 4. ARCHITECT_TASKS
-- Tasks within a stage. estimate_hours come from the model.
-- depends_on points to another task in the same project.
-- ============================================================
CREATE TABLE IF NOT EXISTS architect_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES architect_stages(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES architect_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  estimate_hours NUMERIC NOT NULL DEFAULT 0 CHECK (estimate_hours >= 0),
  depends_on UUID REFERENCES architect_tasks(id) ON DELETE SET NULL,
  task_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN (
    'todo', 'in_progress', 'done', 'blocked', 'cancelled'
  )),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_architect_tasks_stage_id ON architect_tasks(stage_id);
CREATE INDEX IF NOT EXISTS idx_architect_tasks_project_id ON architect_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_architect_tasks_depends_on ON architect_tasks(depends_on);

ALTER TABLE architect_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "architect_tasks_select_policy" ON architect_tasks;
CREATE POLICY "architect_tasks_select_policy" ON architect_tasks
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM architect_projects p
    WHERE p.id = architect_tasks.project_id
    AND can_access_tenant(p.tenant_id)
  )
);

DROP POLICY IF EXISTS "architect_tasks_insert_policy" ON architect_tasks;
CREATE POLICY "architect_tasks_insert_policy" ON architect_tasks
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM architect_projects p
    WHERE p.id = architect_tasks.project_id
    AND can_access_tenant(p.tenant_id)
  )
);

DROP POLICY IF EXISTS "architect_tasks_update_policy" ON architect_tasks;
CREATE POLICY "architect_tasks_update_policy" ON architect_tasks
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM architect_projects p
    WHERE p.id = architect_tasks.project_id
    AND can_access_tenant(p.tenant_id)
  )
);

DROP POLICY IF EXISTS "architect_tasks_delete_policy" ON architect_tasks;
CREATE POLICY "architect_tasks_delete_policy" ON architect_tasks
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM architect_projects p
    WHERE p.id = architect_tasks.project_id
    AND can_access_tenant(p.tenant_id)
  )
);

GRANT ALL ON architect_tasks TO authenticated;

-- 5. PROJECT_EDITS_LOG
-- Append-only record of every manual edit the user makes to a
-- generated project. Not consumed yet. This becomes the training
-- dataset for estimation tuning and fine-tuning later, so it is
-- created from day one.
-- ============================================================
CREATE TABLE IF NOT EXISTS project_edits_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES architect_projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'stage_added', 'stage_removed', 'task_added', 'task_removed',
    'task_renamed', 'estimate_changed', 'date_changed', 'stage_reordered'
  )),
  before JSONB,
  after JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_edits_log_tenant_id ON project_edits_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_edits_log_project_id ON project_edits_log(project_id);
CREATE INDEX IF NOT EXISTS idx_project_edits_log_event_type ON project_edits_log(event_type);

ALTER TABLE project_edits_log ENABLE ROW LEVEL SECURITY;

-- Append-only: read + insert your own tenant's rows. No update / delete
-- policy, so the training log stays immutable.
DROP POLICY IF EXISTS "project_edits_log_select_policy" ON project_edits_log;
CREATE POLICY "project_edits_log_select_policy" ON project_edits_log
FOR SELECT USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "project_edits_log_insert_policy" ON project_edits_log;
CREATE POLICY "project_edits_log_insert_policy" ON project_edits_log
FOR INSERT WITH CHECK (can_access_tenant(tenant_id));

GRANT SELECT, INSERT ON project_edits_log TO authenticated;

-- 6. AUTO-UPDATE TIMESTAMPS
-- ============================================================
CREATE OR REPLACE FUNCTION update_architect_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_blueprints_updated_at ON project_blueprints;
CREATE TRIGGER project_blueprints_updated_at
  BEFORE UPDATE ON project_blueprints
  FOR EACH ROW EXECUTE FUNCTION update_architect_timestamps();

DROP TRIGGER IF EXISTS architect_projects_updated_at ON architect_projects;
CREATE TRIGGER architect_projects_updated_at
  BEFORE UPDATE ON architect_projects
  FOR EACH ROW EXECUTE FUNCTION update_architect_timestamps();

DROP TRIGGER IF EXISTS architect_stages_updated_at ON architect_stages;
CREATE TRIGGER architect_stages_updated_at
  BEFORE UPDATE ON architect_stages
  FOR EACH ROW EXECUTE FUNCTION update_architect_timestamps();

DROP TRIGGER IF EXISTS architect_tasks_updated_at ON architect_tasks;
CREATE TRIGGER architect_tasks_updated_at
  BEFORE UPDATE ON architect_tasks
  FOR EACH ROW EXECUTE FUNCTION update_architect_timestamps();

-- 7. ATOMIC PERSISTENCE
-- Writes the project, its stages, and their tasks in one
-- transaction. tenant_id is taken from the caller, never from
-- the payload, so a client cannot write into another tenant.
-- depends_on arrives as a task title and is resolved to the new
-- task id in a second pass within the same project.
-- ============================================================
CREATE OR REPLACE FUNCTION create_architect_project(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_user uuid;
  v_project_id uuid;
  v_proj jsonb := p_payload->'project';
  v_stage jsonb;
  v_task jsonb;
  v_stage_id uuid;
  v_task_id uuid;
  v_title_to_id jsonb := '{}'::jsonb;
  v_dep_links jsonb := '[]'::jsonb;
  v_link jsonb;
  v_dep_id uuid;
  v_stage_idx integer := 0;
  v_task_idx integer := 0;
BEGIN
  v_user := auth.uid();
  v_tenant := current_user_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context';
  END IF;
  IF v_proj IS NULL THEN
    RAISE EXCEPTION 'project_payload_required';
  END IF;

  INSERT INTO architect_projects (
    tenant_id, name, client, type, status,
    start_date, hard_deadline, target_deadline,
    stack, links, priority, risk_level,
    single_threaded, waiting_on_client, client_id, created_by
  ) VALUES (
    v_tenant,
    COALESCE(NULLIF(v_proj->>'name', ''), 'Untitled project'),
    NULLIF(v_proj->>'client', ''),
    COALESCE(NULLIF(v_proj->>'type', ''), 'own_product'),
    COALESCE(NULLIF(v_proj->>'status', ''), 'discovery'),
    NULLIF(v_proj->>'start_date', '')::date,
    NULLIF(v_proj->>'hard_deadline', '')::date,
    NULLIF(v_proj->>'target_deadline', '')::date,
    COALESCE(v_proj->'stack', '{}'::jsonb),
    COALESCE(v_proj->'links', '{}'::jsonb),
    COALESCE(NULLIF(v_proj->>'priority', ''), 'medium'),
    COALESCE(NULLIF(v_proj->>'risk_level', ''), 'low'),
    COALESCE((v_proj->>'single_threaded')::boolean, FALSE),
    COALESCE((v_proj->>'waiting_on_client')::boolean, FALSE),
    NULLIF(v_proj->>'client_id', '')::uuid,
    v_user
  )
  RETURNING id INTO v_project_id;

  FOR v_stage IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'stages', '[]'::jsonb))
  LOOP
    INSERT INTO architect_stages (
      project_id, name, stage_order, effort_weight,
      planned_start, planned_end, status
    ) VALUES (
      v_project_id,
      COALESCE(NULLIF(v_stage->>'name', ''), 'Stage'),
      COALESCE((v_stage->>'order')::int, (v_stage->>'stage_order')::int, v_stage_idx),
      COALESCE((v_stage->>'effort_weight')::numeric, 0),
      NULLIF(v_stage->>'planned_start', '')::date,
      NULLIF(v_stage->>'planned_end', '')::date,
      COALESCE(NULLIF(v_stage->>'status', ''), 'pending')
    )
    RETURNING id INTO v_stage_id;

    v_task_idx := 0;
    FOR v_task IN SELECT * FROM jsonb_array_elements(COALESCE(v_stage->'tasks', '[]'::jsonb))
    LOOP
      INSERT INTO architect_tasks (
        stage_id, project_id, title, estimate_hours, task_order, status
      ) VALUES (
        v_stage_id,
        v_project_id,
        COALESCE(NULLIF(v_task->>'title', ''), 'Task'),
        COALESCE((v_task->>'estimate_hours')::numeric, 0),
        COALESCE((v_task->>'task_order')::int, v_task_idx),
        COALESCE(NULLIF(v_task->>'status', ''), 'todo')
      )
      RETURNING id INTO v_task_id;

      -- Last writer wins on duplicate titles; good enough for dep resolution.
      v_title_to_id := v_title_to_id || jsonb_build_object(COALESCE(v_task->>'title', ''), v_task_id::text);
      IF COALESCE(v_task->>'depends_on', '') <> '' THEN
        v_dep_links := v_dep_links || jsonb_build_array(
          jsonb_build_object('id', v_task_id::text, 'dep', v_task->>'depends_on')
        );
      END IF;

      v_task_idx := v_task_idx + 1;
    END LOOP;

    v_stage_idx := v_stage_idx + 1;
  END LOOP;

  -- Second pass: resolve depends_on titles to ids within this project.
  FOR v_link IN SELECT * FROM jsonb_array_elements(v_dep_links)
  LOOP
    v_dep_id := NULLIF(v_title_to_id->>(v_link->>'dep'), '')::uuid;
    IF v_dep_id IS NOT NULL AND v_dep_id <> (v_link->>'id')::uuid THEN
      UPDATE architect_tasks
        SET depends_on = v_dep_id
        WHERE id = (v_link->>'id')::uuid;
    END IF;
  END LOOP;

  RETURN v_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_architect_project(jsonb) TO authenticated;

-- 8. Notify PostgREST to reload schema cache
-- ============================================================
NOTIFY pgrst, 'reload config';

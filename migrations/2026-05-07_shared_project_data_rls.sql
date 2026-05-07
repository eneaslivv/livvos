-- ============================================================================
-- Phase 2 of project-agency sharing — widen RLS so the receiving tenant
-- can read (and edit, when access_level='edit') the *contents* of a
-- shared project: files, documents, expenses, incomes, task comments,
-- and document comments.
--
-- Phase 1 (commit 6da2d73) widened only `projects` + `tasks`, which
-- got the kanban + drawer working cross-tenant. Without this Phase 2,
-- a shared "Mobilita" project showed its tasks but the receiving
-- agency couldn't see uploaded files, project docs, the budget, or
-- comments — the user explicitly asked for both sides to see "tasks,
-- prices, internal/client" so this finishes that picture.
--
-- Each table gets a pair of additive policies:
--   - `<table>_shared_project_select` for SELECT
--   - `<table>_shared_project_write`  for INSERT/UPDATE/DELETE
-- The write policy gates on access_level='edit'. Original
-- tenant-scoped policies stay untouched, so non-shared rows behave
-- exactly as before.
-- ============================================================================

-- ── Helper: rebuild policy idempotently ────────────────────────────────────

CREATE OR REPLACE FUNCTION _replace_policy(p_table text, p_name text, p_kind text, p_using text, p_check text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE v_sql text;
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_name, p_table);
  IF p_kind = 'SELECT' THEN
    v_sql := format('CREATE POLICY %I ON %I FOR SELECT USING (%s)', p_name, p_table, p_using);
  ELSIF p_kind = 'INSERT' THEN
    v_sql := format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (%s)', p_name, p_table, p_check);
  ELSIF p_kind = 'UPDATE' THEN
    v_sql := format('CREATE POLICY %I ON %I FOR UPDATE USING (%s)', p_name, p_table, p_using);
  ELSE
    RAISE EXCEPTION 'unknown kind %', p_kind;
  END IF;
  EXECUTE v_sql;
END;
$$;

-- ── files ─────────────────────────────────────────────────────────────────

SELECT _replace_policy('files', 'files_shared_project_select', 'SELECT',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = files.project_id
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

SELECT _replace_policy('files', 'files_shared_project_insert', 'INSERT', '',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = files.project_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$
);

SELECT _replace_policy('files', 'files_shared_project_update', 'UPDATE',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = files.project_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

-- ── documents ─────────────────────────────────────────────────────────────

SELECT _replace_policy('documents', 'documents_shared_project_select', 'SELECT',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = documents.project_id
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

SELECT _replace_policy('documents', 'documents_shared_project_update', 'UPDATE',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = documents.project_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

SELECT _replace_policy('documents', 'documents_shared_project_insert', 'INSERT', '',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = documents.project_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$
);

-- ── expenses ──────────────────────────────────────────────────────────────

SELECT _replace_policy('expenses', 'expenses_shared_project_select', 'SELECT',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = expenses.project_id
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

SELECT _replace_policy('expenses', 'expenses_shared_project_update', 'UPDATE',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = expenses.project_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

SELECT _replace_policy('expenses', 'expenses_shared_project_insert', 'INSERT', '',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = expenses.project_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$
);

-- ── incomes ───────────────────────────────────────────────────────────────

SELECT _replace_policy('incomes', 'incomes_shared_project_select', 'SELECT',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = incomes.project_id
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

SELECT _replace_policy('incomes', 'incomes_shared_project_update', 'UPDATE',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = incomes.project_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

SELECT _replace_policy('incomes', 'incomes_shared_project_insert', 'INSERT', '',
  $$
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id = incomes.project_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$
);

-- ── task_comments — shared via the task's project_id ──────────────────────

SELECT _replace_policy('task_comments', 'task_comments_shared_project_select', 'SELECT',
  $$
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN project_agency_shares pas ON pas.project_id = t.project_id
      WHERE t.id = task_comments.task_id
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

SELECT _replace_policy('task_comments', 'task_comments_shared_project_insert', 'INSERT', '',
  $$
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN project_agency_shares pas ON pas.project_id = t.project_id
      WHERE t.id = task_comments.task_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$
);

-- Note: task_comments has an `is_internal` flag. The receiving agency
-- WILL see is_internal=true rows when the project is shared — that's
-- a deliberate trade-off for now since both agencies are full
-- collaborators on the project. Hiding internal-only would require a
-- separate "is_internal_to_owning_tenant" flag, which is Phase 3.

-- ── document_comments — shared via the document's project_id ──────────────

SELECT _replace_policy('document_comments', 'document_comments_shared_project_select', 'SELECT',
  $$
    EXISTS (
      SELECT 1 FROM documents d
      JOIN project_agency_shares pas ON pas.project_id = d.project_id
      WHERE d.id = document_comments.document_id
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

SELECT _replace_policy('document_comments', 'document_comments_shared_project_insert', 'INSERT', '',
  $$
    EXISTS (
      SELECT 1 FROM documents d
      JOIN project_agency_shares pas ON pas.project_id = d.project_id
      WHERE d.id = document_comments.document_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$
);

-- ── activity_logs — best-effort via metadata->>'project_id' ───────────────
-- Activity logs don't carry a project_id column directly, but most rows
-- that relate to a shared project store the id under metadata.project_id.
-- This widening is read-only — receiving agencies see the activity but
-- can't write to the partner's log.

SELECT _replace_policy('activity_logs', 'activity_logs_shared_project_select', 'SELECT',
  $$
    metadata ? 'project_id' AND EXISTS (
      SELECT 1 FROM project_agency_shares pas
      WHERE pas.project_id::text = (metadata ->> 'project_id')
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  $$, ''
);

-- Cleanup — drop the helper now that all policies are installed.
DROP FUNCTION IF EXISTS _replace_policy(text, text, text, text, text);

NOTIFY pgrst, 'reload schema';

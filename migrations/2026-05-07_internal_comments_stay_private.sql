-- ============================================================================
-- Internal task comments stay private even on shared projects
-- ============================================================================
-- The Phase 2 RLS widening (2026-05-07_shared_project_data_rls.sql) made
-- ALL task_comments visible to partner agencies on shared projects,
-- including ones flagged is_internal=true. The user explicitly asked
-- for an "Internal" channel that the partner agency does NOT see —
-- same semantic the client portal already uses: is_internal=false →
-- shareable, is_internal=true → owner team only.
--
-- This migration replaces the cross-tenant policies on task_comments
-- with versions that exclude is_internal=true rows. The owning
-- tenant's existing tenant_members-scoped policy still lets them see
-- and post their own internal comments freely.
-- ============================================================================

DROP POLICY IF EXISTS task_comments_shared_project_select ON task_comments;
CREATE POLICY task_comments_shared_project_select ON task_comments
  FOR SELECT USING (
    NOT COALESCE(is_internal, FALSE)
    AND EXISTS (
      SELECT 1 FROM tasks t
      JOIN project_agency_shares pas ON pas.project_id = t.project_id
      WHERE t.id = task_comments.task_id
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS task_comments_shared_project_insert ON task_comments;
CREATE POLICY task_comments_shared_project_insert ON task_comments
  FOR INSERT WITH CHECK (
    NOT COALESCE(is_internal, FALSE)
    AND EXISTS (
      SELECT 1 FROM tasks t
      JOIN project_agency_shares pas ON pas.project_id = t.project_id
      WHERE t.id = task_comments.task_id
        AND pas.access_level = 'edit'
        AND pas.shared_with_tenant_id IN (
          SELECT tm.tenant_id FROM tenant_members tm WHERE tm.user_id = auth.uid()
        )
    )
  );

NOTIFY pgrst, 'reload schema';

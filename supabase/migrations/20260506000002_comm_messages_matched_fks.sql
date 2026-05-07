-- ============================================================================
-- Add matched_client_id + matched_project_id to communication_messages
-- ============================================================================
-- The classifier now looks at the message + the tenant's CRM (clients +
-- projects) and returns matched_client_id / matched_project_id when it can
-- confidently link the message back. Storing those as proper FK columns
-- (vs only inside the ai_classification jsonb blob) lets the inbox:
--   1. Filter by client without parsing jsonb on every row
--   2. Build relations: SELECT messages WHERE matched_client_id = X
--   3. Cascade clean up if a client/project gets deleted
-- ============================================================================

ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS matched_client_id  uuid REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matched_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comm_messages_matched_client
  ON communication_messages(tenant_id, matched_client_id) WHERE matched_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_messages_matched_project
  ON communication_messages(tenant_id, matched_project_id) WHERE matched_project_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

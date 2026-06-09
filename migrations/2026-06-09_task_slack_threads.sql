-- ============================================================================
-- task_slack_threads — one Slack thread per task per channel
-- ============================================================================
-- When a task comment is mirrored into the project's connected Slack channel,
-- the first comment posts a root message and we remember its `ts`. Every later
-- comment on that task replies in the same thread (thread_ts = root ts), so the
-- channel shows one tidy thread per task instead of a flat stream.
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_slack_threads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id              uuid NOT NULL REFERENCES tasks(id)   ON DELETE CASCADE,
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id           text NOT NULL,
  integration_token_id uuid,
  thread_ts            text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_task_slack_threads_task ON task_slack_threads(task_id);

ALTER TABLE task_slack_threads ENABLE ROW LEVEL SECURITY;

-- Agency staff (members of the task's tenant) can read/write the thread map.
DROP POLICY IF EXISTS task_slack_threads_member ON task_slack_threads;
CREATE POLICY task_slack_threads_member ON task_slack_threads FOR ALL
  USING (
    EXISTS (SELECT 1 FROM tenant_members tm
            WHERE tm.tenant_id = task_slack_threads.tenant_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members tm
            WHERE tm.tenant_id = task_slack_threads.tenant_id AND tm.user_id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';

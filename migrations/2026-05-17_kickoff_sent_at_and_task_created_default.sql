-- Two changes for the Slack kickoff/task-feed UX:
--
-- 1. projects.kickoff_sent_at — tracks the last time the kickoff digest
--    was posted to Slack, so the UI can show "Sent X ago" on the
--    Kickoff button and the user doesn't blindly re-click.
--
-- 2. slack_monitored_channels.notify_events default flipped — task_created
--    is now ON by default. The user explicitly wanted task creations
--    (with due dates) streaming into the linked Slack channel as they
--    happen, building a live project timeline in chat.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS kickoff_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN projects.kickoff_sent_at IS
  'When the most recent project_started kickoff digest was posted to Slack.';

ALTER TABLE slack_monitored_channels
  ALTER COLUMN notify_events SET DEFAULT
    '["task_created","task_completed","milestone_paid","project_completed","project_started"]'::jsonb;

UPDATE slack_monitored_channels
SET notify_events = notify_events || '["task_created"]'::jsonb
WHERE notify_events IS NOT NULL
  AND NOT (notify_events @> '["task_created"]'::jsonb);

COMMENT ON COLUMN slack_monitored_channels.notify_events IS
  'JSONB array of slack project events this channel subscribes to. '
  'Default: task_created, task_completed, milestone_paid, project_completed, project_started.';

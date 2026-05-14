-- Adds 'task_started' to the default Slack notify_events set, so the bot
-- pings the channel when a task moves into in-progress (not just on
-- completion). Existing channels backfilled.
ALTER TABLE slack_monitored_channels
  ALTER COLUMN notify_events SET DEFAULT
    '["task_created","task_started","task_completed","milestone_paid","project_completed","project_started"]'::jsonb;

UPDATE slack_monitored_channels
SET notify_events = notify_events || '["task_started"]'::jsonb
WHERE notify_events IS NOT NULL
  AND NOT (notify_events @> '["task_started"]'::jsonb);

COMMENT ON COLUMN slack_monitored_channels.notify_events IS
  'JSONB array of slack project events this channel subscribes to. '
  'Default: task_created, task_started, task_completed, milestone_paid, '
  'project_completed, project_started.';

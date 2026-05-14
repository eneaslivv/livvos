-- Adds 'project_started' to the default Slack notify_events set on
-- monitored channels. New channels default to the full set
-- (task_completed, milestone_paid, project_completed, project_started).
-- Existing channels are backfilled so the kickoff message fires for
-- them without manual toggle.

ALTER TABLE slack_monitored_channels
  ALTER COLUMN notify_events SET DEFAULT
    '["task_completed","milestone_paid","project_completed","project_started"]'::jsonb;

UPDATE slack_monitored_channels
SET notify_events = notify_events || '["project_started"]'::jsonb
WHERE notify_events IS NOT NULL
  AND NOT (notify_events @> '["project_started"]'::jsonb);

COMMENT ON COLUMN slack_monitored_channels.notify_events IS
  'JSONB array of slack project events this channel subscribes to. '
  'Default: task_completed, milestone_paid, project_completed, project_started. '
  'task_created is OFF by default — too noisy for most teams.';

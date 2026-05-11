-- Per-channel event subscription. Defaults to the high-signal events
-- (task_completed, milestone_paid, project_completed). task_created is
-- intentionally OFF by default to avoid notification fatigue when the
-- team creates dozens of tasks per day. Users can toggle each event
-- per channel from the Settings UI.
ALTER TABLE slack_monitored_channels
  ADD COLUMN IF NOT EXISTS notify_events jsonb
    DEFAULT '["task_completed","milestone_paid","project_completed"]'::jsonb;

-- Backfill any existing rows to the same default (jsonb DEFAULT only
-- applies to new inserts).
UPDATE slack_monitored_channels
SET notify_events = '["task_completed","milestone_paid","project_completed"]'::jsonb
WHERE notify_events IS NULL;

-- Default channel where slack-notify posts when the caller doesn't specify
-- one. Set per workspace in Settings → Slack. Used for automatic
-- notifications (new lead, approved proposal, etc.).
ALTER TABLE integration_tokens
  ADD COLUMN IF NOT EXISTS slack_notify_channel_id text;

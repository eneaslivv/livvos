-- Link each monitored Slack channel to a project. When set, every
-- inbound message from that channel auto-populates matched_project_id
-- on communication_messages — overrides the AI matcher and gives the
-- inbox a stable, predictable association ('#mobilita' → Mobilita).
ALTER TABLE slack_monitored_channels
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_slack_monitored_channels_project
  ON slack_monitored_channels(project_id)
  WHERE project_id IS NOT NULL;

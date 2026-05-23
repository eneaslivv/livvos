-- ============================================================================
-- Communication Messages — reply-in-platform tracking
-- ============================================================================
-- Tracks whether the user already replied to a message directly from
-- Slack/Gmail (outside of LivvOS). The slack-sync edge function populates
-- this by checking conversations.replies for threads where a tenant member
-- has posted a reply.
--
-- Also adds reply_count for quick thread activity assessment.
-- ============================================================================

-- New columns on communication_messages
ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS replied_in_platform boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_count         integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reply_at       timestamptz;

-- Index for filtering "needs attention" (not replied anywhere)
CREATE INDEX IF NOT EXISTS idx_comm_messages_not_replied
  ON communication_messages(tenant_id, status)
  WHERE replied_in_platform = false AND status = 'pending';

COMMENT ON COLUMN communication_messages.replied_in_platform IS
  'True when the user (or any tenant member) already replied to this thread directly in Slack/Gmail, outside of LivvOS';
COMMENT ON COLUMN communication_messages.reply_count IS
  'Number of replies in the thread (from Slack reply_count or Gmail thread count)';
COMMENT ON COLUMN communication_messages.last_reply_at IS
  'Timestamp of the most recent reply in the thread';

NOTIFY pgrst, 'reload schema';

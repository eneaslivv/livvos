-- ============================================================================
-- Communication Messages — outbound (gmail-send) column + status alignment
-- ============================================================================
-- gmail-send and comm-classify/slack-actions write columns and status values
-- the base table never had, so EVERY gmail-send inbox insert was silently
-- failing (missing direction/to_email/sent_at, received_at NOT NULL, and a
-- status CHECK that rejected 'sent'/'auto_resolved'). Result: sent mail never
-- appeared in the Inbox → broken tracking/audit. This aligns the schema with
-- what the edge functions actually write. Idempotent.
--
-- Root cause of the drift: the comm column ALTERs live in this `migrations/`
-- dir (what deploy-migrations.sh ships) but supabase/migrations/ only had the
-- base table — so anyone reading supabase/migrations/ saw a stale schema.
-- ============================================================================

ALTER TABLE public.communication_messages
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS to_email  text,
  ADD COLUMN IF NOT EXISTS sent_at   timestamptz;

-- Outbound rows (gmail-send) don't carry a received_at; relax the constraint so
-- the insert succeeds. gmail-send also backfills received_at = now() for sort.
ALTER TABLE public.communication_messages ALTER COLUMN received_at DROP NOT NULL;

ALTER TABLE public.communication_messages
  DROP CONSTRAINT IF EXISTS communication_messages_direction_check;
ALTER TABLE public.communication_messages
  ADD CONSTRAINT communication_messages_direction_check
  CHECK (direction IN ('inbound', 'outbound'));

-- Expand status domain to the values the edge functions actually write:
--   'sent'          → gmail-send (outbound)
--   'auto_resolved' → comm-classify, slack-actions
ALTER TABLE public.communication_messages
  DROP CONSTRAINT IF EXISTS communication_messages_status_check;
ALTER TABLE public.communication_messages
  ADD CONSTRAINT communication_messages_status_check
  CHECK (status IN (
    'pending', 'task_created', 'replied', 'snoozed', 'ignored', 'archived',
    'sent', 'auto_resolved'
  ));

CREATE INDEX IF NOT EXISTS idx_comm_messages_direction
  ON public.communication_messages(tenant_id, direction);

NOTIFY pgrst, 'reload schema';

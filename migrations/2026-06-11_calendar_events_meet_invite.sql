-- =============================================================================
-- Meet auto-invite — añade campos para soportar generación automática de
-- Google Meet links + invitación por email al cliente cuando se crea una
-- reunión desde el calendario.
--
-- Flow:
--   1. Usuario crea evento con type='meeting' + invitee_email + invitee_client_id.
--   2. Frontend invoca edge fn `event-meet-invite`.
--   3. Edge fn lee OAuth tokens de Google del owner, crea evento en
--      calendars/primary con conferenceData.createRequest (Google genera el
--      Meet link), guarda hangoutLink + external_event_id en calendar_events.
--   4. Llama send-email con template 'meeting_invite' al invitee_email con
--      el link de Meet, CTA "Unirme al Meet" + detalle del meeting.
--   5. Marca invite_sent_at con timestamp. Si falla, guarda invite_error.
-- =============================================================================

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS meet_link TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS external_event_id TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invitee_email TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invitee_name TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invitee_client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_error TEXT;

CREATE INDEX IF NOT EXISTS calendar_events_pending_invite_idx
  ON calendar_events(start_date, start_time)
  WHERE invitee_email IS NOT NULL AND invite_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS calendar_events_meet_idx
  ON calendar_events(tenant_id, start_date)
  WHERE meet_link IS NOT NULL;

-- Per-client email context — free-form notes the user maintains about
-- how to communicate with this client. Fed into the AI prompt every
-- time we draft an email to them, so the tone/CC list/preferred
-- phrasing carry over without having to re-paste the brief each time.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email_context_notes TEXT;

COMMENT ON COLUMN clients.email_context_notes IS
  'Free-form notes about how to communicate with this client over email. '
  'Fed as system context to the AI when drafting emails — covers tone '
  '(formal/casual), preferred phrasing, recurring CC list, history of '
  'past discussions, etc. NOT shown to the recipient.';

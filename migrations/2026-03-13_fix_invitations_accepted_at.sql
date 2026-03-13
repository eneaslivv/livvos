-- =============================================
-- Add missing accepted_at column to invitations
-- AcceptInvite.tsx tries to SET accepted_at but the column never existed
-- =============================================

-- 1. Add column
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- 2. Backfill already-accepted invitations
UPDATE invitations SET accepted_at = updated_at
WHERE status = 'accepted' AND accepted_at IS NULL AND updated_at IS NOT NULL;

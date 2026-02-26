-- ============================================================
-- Team Agents: Add agent designation fields to profiles
-- Date: 2026-02-25
-- Description: Allows team members to be designated as agents
--              with type, description, and connection status
-- ============================================================

-- 1. Add agent columns to profiles
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_agent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_description TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_connected BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Index for quick agent lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_is_agent ON profiles(is_agent) WHERE is_agent = TRUE;

-- 3. Notify PostgREST to reload schema cache
-- ============================================================
NOTIFY pgrst, 'reload config';

-- =============================================
-- Planning preferences for AI task planner
-- One row per user per tenant, free-text preferences
-- =============================================

CREATE TABLE IF NOT EXISTS planning_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  preferences TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

ALTER TABLE planning_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own preferences
DROP POLICY IF EXISTS "planning_prefs_select" ON planning_preferences;
CREATE POLICY "planning_prefs_select" ON planning_preferences
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "planning_prefs_insert" ON planning_preferences;
CREATE POLICY "planning_prefs_insert" ON planning_preferences
FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "planning_prefs_update" ON planning_preferences;
CREATE POLICY "planning_prefs_update" ON planning_preferences
FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "planning_prefs_delete" ON planning_preferences;
CREATE POLICY "planning_prefs_delete" ON planning_preferences
FOR DELETE USING (user_id = auth.uid());

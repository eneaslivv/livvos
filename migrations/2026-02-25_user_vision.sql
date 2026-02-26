-- Migration to create user_vision table for storing annual goals and thoughts
CREATE TABLE IF NOT EXISTS user_vision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

-- Enable RLS
ALTER TABLE user_vision ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view their own vision" ON user_vision;
CREATE POLICY "Users can view their own vision"
  ON user_vision FOR SELECT
  USING (auth.uid() = user_id AND can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "Users can insert their own vision" ON user_vision;
CREATE POLICY "Users can insert their own vision"
  ON user_vision FOR INSERT
  WITH CHECK (auth.uid() = user_id AND can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "Users can update their own vision" ON user_vision;
CREATE POLICY "Users can update their own vision"
  ON user_vision FOR UPDATE
  USING (auth.uid() = user_id AND can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "Users can delete their own vision" ON user_vision;
CREATE POLICY "Users can delete their own vision"
  ON user_vision FOR DELETE
  USING (auth.uid() = user_id AND can_access_tenant(tenant_id));

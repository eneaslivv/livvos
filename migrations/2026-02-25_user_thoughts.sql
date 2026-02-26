-- Migration: user_thoughts table
-- Description: Stores platform thoughts, customizations and intelligence objectives for each user

CREATE TABLE IF NOT EXISTS user_thoughts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    content TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, tenant_id)
);

-- Enable RLS
ALTER TABLE user_thoughts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "user_thoughts_select" ON user_thoughts
    FOR SELECT USING (auth.uid() = user_id AND can_access_tenant(tenant_id));

CREATE POLICY "user_thoughts_insert" ON user_thoughts
    FOR INSERT WITH CHECK (auth.uid() = user_id AND can_access_tenant(tenant_id));

CREATE POLICY "user_thoughts_update" ON user_thoughts
    FOR UPDATE USING (auth.uid() = user_id AND can_access_tenant(tenant_id));

-- Trigger for updated_at
CREATE TRIGGER set_updated_at_user_thoughts
    BEFORE UPDATE ON user_thoughts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

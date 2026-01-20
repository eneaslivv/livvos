-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name TEXT DEFAULT 'System',
    user_avatar TEXT DEFAULT 'SYS',
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    project_title TEXT,
    type TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    owner_id UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy for reading (users can read only their own logs or logs where they are owner - assuming logs are personal or team based)
-- For now, let's assume team-wide visibility or owner-based. Given the context (Projects/Team), maybe shared?
-- But secure default: owner only.
DROP POLICY IF EXISTS "Users can view logs" ON activity_logs;
CREATE POLICY "Users can view logs" ON activity_logs
    FOR SELECT USING (auth.uid() = owner_id);

-- Policy for inserting (anyone can insert, usually the system on behalf of user)
DROP POLICY IF EXISTS "Users can insert logs" ON activity_logs;
CREATE POLICY "Users can insert logs" ON activity_logs
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Reload schema
NOTIFY pgrst, 'reload config';


-- Final permissive fix
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Activity Logs: Open completely to authenticated
DROP POLICY IF EXISTS "Users can insert activity" ON activity_logs;
DROP POLICY IF EXISTS "Users can see activity" ON activity_logs;
DROP POLICY IF EXISTS "Users can view logs" ON activity_logs;
DROP POLICY IF EXISTS "Users can insert logs" ON activity_logs;

CREATE POLICY "Allow All Activity" ON activity_logs
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- Ensure RLS is enabled (but policy allows all)
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

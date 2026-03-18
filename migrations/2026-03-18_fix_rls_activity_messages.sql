-- =============================================
-- FIX: activity_logs UPDATE/DELETE + messages UPDATE policies
-- The complete_rls_tenant_isolation migration set these to USING(false)
-- which breaks: likes on activity posts, deleting own posts, mark-as-read
-- =============================================

-- ACTIVITY_LOGS: allow UPDATE (likes, edits) by tenant members or post owner
DROP POLICY IF EXISTS "activity_logs_update_policy" ON activity_logs;
CREATE POLICY "activity_logs_update_policy" ON activity_logs
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR user_id = auth.uid()
);

-- ACTIVITY_LOGS: allow DELETE by post owner only
DROP POLICY IF EXISTS "activity_logs_delete_policy" ON activity_logs;
CREATE POLICY "activity_logs_delete_policy" ON activity_logs
FOR DELETE USING (
  user_id = auth.uid()
);

-- MESSAGES: allow UPDATE by recipient (mark as read)
DROP POLICY IF EXISTS "messages_update_policy" ON messages;
CREATE POLICY "messages_update_policy" ON messages
FOR UPDATE USING (
  recipient_id = auth.uid()
);

NOTIFY pgrst, 'reload config';

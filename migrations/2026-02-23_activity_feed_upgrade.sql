-- =============================================================================
-- Activity Feed Upgrade: add missing columns for full functionality
-- =============================================================================

-- 1. Add missing columns (including tenant_id which is required by the app)
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_name TEXT DEFAULT 'System';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_avatar TEXT DEFAULT 'SYS';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS target TEXT NOT NULL DEFAULT 'General';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'comment';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'status';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES activity_logs(id) ON DELETE CASCADE;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS likes UUID[] DEFAULT '{}';
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant ON activity_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_parent_id ON activity_logs(parent_id);

-- 3. Backfill user_id from owner_id where missing
UPDATE activity_logs SET user_id = owner_id WHERE user_id IS NULL AND owner_id IS NOT NULL;

-- 4. Backfill tenant_id from owner's profile where missing
UPDATE activity_logs al
SET tenant_id = p.tenant_id
FROM profiles p
WHERE al.user_id = p.id
  AND al.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

-- Also backfill from owner_id if user_id is null
UPDATE activity_logs al
SET tenant_id = p.tenant_id
FROM profiles p
WHERE al.owner_id = p.id
  AND al.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

-- 5. Fix RLS policies: allow tenant-wide SELECT, not just owner-only
DROP POLICY IF EXISTS "Users can view logs" ON activity_logs;
DROP POLICY IF EXISTS "Allow All Activity" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_policy" ON activity_logs;
CREATE POLICY "activity_logs_select_policy" ON activity_logs
  FOR SELECT USING (
    CASE
      WHEN tenant_id IS NOT NULL THEN can_access_tenant(tenant_id)
      ELSE (auth.uid() = user_id OR auth.uid() = owner_id)
    END
  );

-- INSERT: anyone authenticated can insert to their tenant
DROP POLICY IF EXISTS "Users can insert logs" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert_policy" ON activity_logs;
CREATE POLICY "activity_logs_insert_policy" ON activity_logs
  FOR INSERT WITH CHECK (
    CASE
      WHEN tenant_id IS NOT NULL THEN can_access_tenant(tenant_id)
      ELSE (auth.uid() = user_id OR auth.uid() = owner_id)
    END
  );

-- UPDATE: own posts or tenant access
DROP POLICY IF EXISTS "Users can update own logs" ON activity_logs;
CREATE POLICY "Users can update own logs" ON activity_logs
  FOR UPDATE USING (
    auth.uid() = user_id
    OR auth.uid() = owner_id
    OR (tenant_id IS NOT NULL AND can_access_tenant(tenant_id))
  );

-- DELETE: own posts only
DROP POLICY IF EXISTS "Users can delete own logs" ON activity_logs;
CREATE POLICY "Users can delete own logs" ON activity_logs
  FOR DELETE USING (
    auth.uid() = user_id
    OR auth.uid() = owner_id
  );

-- Grant access
GRANT ALL ON activity_logs TO authenticated;

-- 6. Updated_at trigger
CREATE OR REPLACE FUNCTION update_activity_logs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_activity_logs_updated_at ON activity_logs;
CREATE TRIGGER trigger_activity_logs_updated_at
  BEFORE UPDATE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION update_activity_logs_updated_at();

-- 7. Notification trigger for replies
CREATE OR REPLACE FUNCTION notify_on_activity_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_owner_id UUID;
  v_parent_details JSONB;
  v_preview TEXT;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id, details INTO v_parent_owner_id, v_parent_details
    FROM activity_logs
    WHERE id = NEW.parent_id;

    v_preview := COALESCE(v_parent_details->>'content', 'your activity');

    IF v_parent_owner_id IS NOT NULL AND v_parent_owner_id != NEW.user_id THEN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_notification') THEN
        PERFORM create_notification(
          v_parent_owner_id,
          'activity',
          COALESCE(NEW.user_name, 'Someone') || ' replied to you',
          'Replying to: ' || LEFT(v_preview, 50) || (CASE WHEN LENGTH(v_preview) > 50 THEN '...' ELSE '' END),
          '/activity',
          jsonb_build_object('activity_id', NEW.parent_id, 'comment_id', NEW.id)
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_activity_comment ON activity_logs;
CREATE TRIGGER trigger_notify_activity_comment
  AFTER INSERT ON activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_activity_comment();

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload config';

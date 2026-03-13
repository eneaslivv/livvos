-- Fix: Drop the OLD 6-param create_notification() overload
-- that conflicts with the new 7-param version (added in 2026-03-06).
-- PostgreSQL treats them as separate overloads because the signatures differ,
-- causing "function create_notification(...) is not unique" when triggers call it.

DROP FUNCTION IF EXISTS create_notification(UUID, TEXT, TEXT, TEXT, TEXT, JSONB);

-- Ensure the 7-param version exists (idempotent)
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
  v_tenant UUID;
BEGIN
  v_tenant := p_tenant_id;
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM profiles WHERE id = p_user_id LIMIT 1;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, link, metadata, tenant_id, priority)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_metadata, v_tenant, 'medium')
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

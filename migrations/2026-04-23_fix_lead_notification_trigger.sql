-- =============================================
-- Fix notify_on_new_lead trigger
-- =============================================
-- The previous version (2026-01-16) picked `profiles WHERE status = 'active' LIMIT 1`
-- globally, which in a multi-tenant setup could send the lead notification
-- to the wrong tenant, and always marked priority='medium' with no tenant_id.
--
-- New behavior:
--   * Scope by NEW.tenant_id
--   * Notify the lead's owner_id (from lead-ingest) + every active user in
--     that tenant (capped at 20) — that way sales reps see the toast live.
--   * Priority 'high' so the toaster shows the pulsing accent.
--   * Title includes company when present.

CREATE OR REPLACE FUNCTION notify_on_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipient RECORD;
  v_title TEXT;
  v_message TEXT;
  v_metadata JSONB;
BEGIN
  -- Short title; include company if provided
  v_title := 'Nuevo lead: ' || COALESCE(NEW.name, 'Sin nombre')
             || CASE WHEN NEW.company IS NOT NULL AND NEW.company <> ''
                     THEN ' (' || NEW.company || ')'
                     ELSE '' END;

  -- Snippet of the message / origin for context
  v_message := COALESCE(NULLIF(LEFT(NEW.message, 140), ''), 'Nuevo lead recibido')
               || CASE WHEN NEW.origin IS NOT NULL AND NEW.origin <> ''
                       THEN ' · ' || NEW.origin
                       ELSE '' END;

  v_metadata := jsonb_build_object(
    'lead_id', NEW.id,
    'lead_email', NEW.email,
    'lead_name', NEW.name,
    'company', NEW.company,
    'origin', NEW.origin,
    'source', NEW.source
  );

  -- Notify the owner first (always, even if profile row not yet materialized)
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO notifications
      (user_id, tenant_id, type, title, message, link, metadata, priority, read, action_required, category)
    VALUES
      (NEW.owner_id, NEW.tenant_id, 'lead', v_title, v_message, '/sales_leads',
       v_metadata, 'high', FALSE, FALSE, 'sales')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Fan out to every active user in the tenant (skip owner to avoid duplicate)
  IF NEW.tenant_id IS NOT NULL THEN
    FOR v_recipient IN
      SELECT p.id
      FROM profiles p
      WHERE p.tenant_id = NEW.tenant_id
        AND p.status = 'active'
        AND p.id <> COALESCE(NEW.owner_id, '00000000-0000-0000-0000-000000000000'::uuid)
      LIMIT 20
    LOOP
      INSERT INTO notifications
        (user_id, tenant_id, type, title, message, link, metadata, priority, read, action_required, category)
      VALUES
        (v_recipient.id, NEW.tenant_id, 'lead', v_title, v_message, '/sales_leads',
         v_metadata, 'high', FALSE, FALSE, 'sales')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Rebind trigger (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    DROP TRIGGER IF EXISTS trigger_notify_new_lead ON leads;
    CREATE TRIGGER trigger_notify_new_lead
      AFTER INSERT ON leads
      FOR EACH ROW
      EXECUTE FUNCTION notify_on_new_lead();
  END IF;
END $$;

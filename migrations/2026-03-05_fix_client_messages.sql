-- =============================================
-- Fix client_messages: ensure all columns exist + RLS
-- =============================================

-- Add missing columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_messages' AND column_name = 'sender_id') THEN
    ALTER TABLE client_messages ADD COLUMN sender_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_messages' AND column_name = 'message_type') THEN
    ALTER TABLE client_messages ADD COLUMN message_type TEXT DEFAULT 'text';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_messages' AND column_name = 'file_url') THEN
    ALTER TABLE client_messages ADD COLUMN file_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_messages' AND column_name = 'file_name') THEN
    ALTER TABLE client_messages ADD COLUMN file_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_messages' AND column_name = 'read_at') THEN
    ALTER TABLE client_messages ADD COLUMN read_at TIMESTAMPTZ;
  END IF;
END $$;

-- =============================================
-- RLS: allow team + client portal access
-- =============================================
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view messages of their clients" ON client_messages;
DROP POLICY IF EXISTS "Users can create messages for their clients" ON client_messages;
DROP POLICY IF EXISTS "client_messages_self_select" ON client_messages;
DROP POLICY IF EXISTS "client_messages_self_insert" ON client_messages;
DROP POLICY IF EXISTS "client_messages_select_policy" ON client_messages;
DROP POLICY IF EXISTS "client_messages_insert_policy" ON client_messages;

-- SELECT: team (via tenant or owner) + client (via auth_user_id)
CREATE POLICY "client_messages_select_policy" ON client_messages
FOR SELECT USING (
  -- Team access: tenant match or direct ownership
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_messages.client_id
    AND (c.owner_id = auth.uid() OR c.tenant_id IS NULL OR (c.tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.tenant_id = c.tenant_id
    )))
  )
  OR
  -- Client portal access: client's own messages
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_messages.client_id
    AND c.auth_user_id = auth.uid()
  )
);

-- INSERT: any authenticated user can send messages
CREATE POLICY "client_messages_insert_policy" ON client_messages
FOR INSERT WITH CHECK (TRUE);

GRANT ALL ON client_messages TO authenticated;

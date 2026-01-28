CREATE TABLE IF NOT EXISTS payment_processors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  api_key TEXT,
  secret_key TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payment_processors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_processors_select" ON payment_processors;
CREATE POLICY "payment_processors_select" ON payment_processors
FOR SELECT
USING (true);

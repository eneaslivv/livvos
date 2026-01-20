-- Fix CRM Schema Issues

-- 1. Create web_analytics table
CREATE TABLE IF NOT EXISTS web_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_visits INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  bounce_rate NUMERIC DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  top_pages JSONB DEFAULT '[]'::jsonb,
  daily_visits JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE web_analytics ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow read access to authenticated users" ON web_analytics
  FOR SELECT TO authenticated USING (true);

-- Initialize default analytics data if empty
INSERT INTO web_analytics (total_visits, unique_visitors, bounce_rate, conversions, top_pages, daily_visits)
SELECT 
  12543, 
  8432, 
  42.5, 
  356,
  '[{"path": "/home", "views": 5432}, {"path": "/pricing", "views": 2100}, {"path": "/blog", "views": 1500}]'::jsonb,
  '[{"date": "2024-01-01", "value": 120}, {"date": "2024-01-02", "value": 132}, {"date": "2024-01-03", "value": 101}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM web_analytics);

-- 2. Add 'name' to profiles if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN name TEXT;
  END IF;
END $$;

-- 3. Ensure leads table has correct columns for CRM
-- Make sure ai_analysis exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'ai_analysis'
  ) THEN
    ALTER TABLE leads ADD COLUMN ai_analysis JSONB;
  END IF;
END $$;

-- 4. Create proper RLS for leads if not valid
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON leads;
CREATE POLICY "Enable read access for authenticated users" ON leads
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON leads;
CREATE POLICY "Enable insert access for authenticated users" ON leads
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update access for authenticated users" ON leads;
CREATE POLICY "Enable update access for authenticated users" ON leads
  FOR UPDATE TO authenticated USING (true);

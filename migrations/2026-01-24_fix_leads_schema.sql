-- FIX: Ensure leads table has ai_analysis column
-- This script is idempotent (safe to run multiple times)

-- 1. Ensure columns exist with correct types
DO $$
BEGIN
    -- Check and add ai_analysis as JSONB
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'ai_analysis') THEN
        ALTER TABLE leads ADD COLUMN ai_analysis JSONB DEFAULT '{}'::jsonb;
    END IF;

    -- Check other required columns from Sales.tsx
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'company') THEN
        ALTER TABLE leads ADD COLUMN company TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'origin') THEN
        ALTER TABLE leads ADD COLUMN origin TEXT DEFAULT 'Manual';
    END IF;
    
    -- Ensure status column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'status') THEN
        ALTER TABLE leads ADD COLUMN status TEXT DEFAULT 'new';
    END IF;

END $$;

-- 2. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload config';

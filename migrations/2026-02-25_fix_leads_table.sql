-- ============================================================
-- Fix Leads Table: Add missing columns for CRM functionality
-- Date: 2026-02-25
-- Description: Adds company, source, tenant_id, owner_id columns
--              and simplified RLS policies for leads
-- ============================================================

-- 1. Add missing columns
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- 2. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_owner_id ON leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- 3. Simplified RLS Policies (drop overly strict ones, use simple tenant check)
-- ============================================================
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to replace them
DROP POLICY IF EXISTS "leads_select_policy" ON leads;
DROP POLICY IF EXISTS "leads_insert_policy" ON leads;
DROP POLICY IF EXISTS "leads_update_policy" ON leads;
DROP POLICY IF EXISTS "leads_delete_policy" ON leads;
-- Also drop any legacy policies
DROP POLICY IF EXISTS "leads_read" ON leads;
DROP POLICY IF EXISTS "leads_write" ON leads;
DROP POLICY IF EXISTS "leads_modify" ON leads;

-- Simple policies: tenant isolation via can_access_tenant
CREATE POLICY "leads_select_policy" ON leads
FOR SELECT USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL
);

CREATE POLICY "leads_insert_policy" ON leads
FOR INSERT WITH CHECK (
  tenant_id IS NOT NULL AND (can_access_tenant(tenant_id) OR tenant_id IS NULL)
);

CREATE POLICY "leads_update_policy" ON leads
FOR UPDATE USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL
);

CREATE POLICY "leads_delete_policy" ON leads
FOR DELETE USING (
  can_access_tenant(tenant_id) OR tenant_id IS NULL
);

GRANT ALL ON leads TO authenticated;

-- 4. Backfill tenant_id for existing leads (assign to first tenant)
-- ============================================================
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  IF v_tenant_id IS NOT NULL THEN
    UPDATE leads SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  END IF;
END $$;

-- 5. Notify PostgREST to reload schema cache
-- ============================================================
NOTIFY pgrst, 'reload config';

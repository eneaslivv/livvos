-- =============================================
-- TENANT AI PROFILE
-- =============================================
-- Per-tenant context that is injected into every AI system prompt.
-- This is what lets "advisor", "blog", "proposal", etc. respond grounded in
-- the user's actual goals, tone, audience, and custom instructions instead of
-- generic templates. One row per tenant.

CREATE TABLE IF NOT EXISTS tenant_ai_profile (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

    -- Free-text fields the user fills in via Settings → AI Preferences
    business_description TEXT,            -- "Boutique branding studio for restaurants in CABA"
    industry TEXT,                        -- "Creative agency", "SaaS", "E-commerce", etc.
    target_audience TEXT,                 -- "Mid-market restaurants ($500k-$5M revenue)"
    brand_voice TEXT,                     -- "Confident, direct, slightly playful. Avoids jargon."
    tone TEXT DEFAULT 'professional',     -- one of: professional | casual | formal | playful | technical

    -- Operational context
    primary_language TEXT DEFAULT 'es',   -- 'es' | 'en' | 'pt' — preferred response language
    goals TEXT[],                          -- e.g. ['close 2 new clients/month', 'launch CRM module Q3']
    constraints TEXT,                      -- e.g. "We can't take projects under $5k. Avoid retail clients."
    custom_instructions TEXT,              -- catch-all freeform: "Always mention sustainability angle in proposals"

    -- Auto-collected derived fields (updated by background jobs / triggers later)
    last_active_projects_summary TEXT,    -- updated periodically: "3 active projects, 2 due this month"
    last_finance_summary TEXT,            -- "MRR $4500, AR $2300, 1 invoice overdue"

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_profile_tenant ON tenant_ai_profile(tenant_id);

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION update_tenant_ai_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_ai_profile_updated_at ON tenant_ai_profile;
CREATE TRIGGER trg_tenant_ai_profile_updated_at
    BEFORE UPDATE ON tenant_ai_profile
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_ai_profile_updated_at();

-- =============================================
-- RLS: tenant members can read + update their own profile.
-- =============================================
ALTER TABLE tenant_ai_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view AI profile" ON tenant_ai_profile;
CREATE POLICY "Tenant members can view AI profile"
    ON tenant_ai_profile FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Tenant members can upsert AI profile" ON tenant_ai_profile;
CREATE POLICY "Tenant members can upsert AI profile"
    ON tenant_ai_profile FOR INSERT
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Tenant members can update AI profile" ON tenant_ai_profile;
CREATE POLICY "Tenant members can update AI profile"
    ON tenant_ai_profile FOR UPDATE
    USING (
        tenant_id IN (
            SELECT tenant_id FROM profiles WHERE id = auth.uid()
        )
    );

-- =============================================
-- Seed empty profile for existing tenants
-- =============================================
INSERT INTO tenant_ai_profile (tenant_id, primary_language, tone)
SELECT id, 'es', 'professional'
FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM tenant_ai_profile);

-- Sanity log
DO $$
DECLARE profile_count INT;
BEGIN
    SELECT COUNT(*) INTO profile_count FROM tenant_ai_profile;
    RAISE NOTICE 'tenant_ai_profile rows: %', profile_count;
END $$;

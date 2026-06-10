-- Partners — referral / widget partners (NOT employees / collaborators).
-- ──────────────────────────────────────────────────────────────────
-- The spec defines `partners` as external people/orgs that send leads
-- with a referral code and earn a commission. Distinct from team
-- members. Scoped to tenant_id (consistent with rest of codebase).
--
-- Note: `partner_payouts` already exists from a prior migration
-- (2026-05-10_partner_payouts.sql) but referenced an external concept
-- of "partner". This migration adds the MASTER table the FK should
-- have always pointed at, plus the widget catalog.

CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  type TEXT NOT NULL DEFAULT 'referrer' CHECK (type IN ('referrer', 'affiliate', 'agency', 'reseller', 'creator')),
  referral_code TEXT NOT NULL,
  referral_link TEXT,
  commission_model JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { kind: 'flat'|'percent'|'recurring', amount: 200, currency: 'USD',
  --   applies_to: 'first_payment'|'lifetime'|'first_12mo', notes: '...' }
  attribution_days INT NOT NULL DEFAULT 30,
  min_payout NUMERIC NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'paused', 'archived')),
  portal_access BOOLEAN NOT NULL DEFAULT true,
  -- Optional avatar / brand color for the portal + cards.
  avatar_url TEXT,
  brand_color TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, referral_code)
);

CREATE INDEX IF NOT EXISTS idx_partners_tenant_id     ON public.partners(tenant_id);
CREATE INDEX IF NOT EXISTS idx_partners_status        ON public.partners(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_partners_referral_code ON public.partners(referral_code);

-- Embeddable widgets — each partner can spin up multiple widget
-- variants (lead form, banner, calc, etc.) each with their own
-- config + embed snippet.
CREATE TABLE IF NOT EXISTS public.partner_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('form', 'banner', 'calc', 'cta', 'card', 'modal')),
  name TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { theme, headline, sub, cta_text, fields[], colors, position }
  embed_code TEXT,
  views INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_widgets_partner_id ON public.partner_widgets(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_widgets_tenant_id  ON public.partner_widgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_partner_widgets_status     ON public.partner_widgets(tenant_id, status);

-- Touch updated_at on partner + widget updates.
CREATE OR REPLACE FUNCTION public.touch_partners_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_partners_updated_at ON public.partners;
CREATE TRIGGER trg_partners_updated_at BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.touch_partners_updated_at();
DROP TRIGGER IF EXISTS trg_partner_widgets_updated_at ON public.partner_widgets;
CREATE TRIGGER trg_partner_widgets_updated_at BEFORE UPDATE ON public.partner_widgets
  FOR EACH ROW EXECUTE FUNCTION public.touch_partners_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.partners        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_widgets ENABLE ROW LEVEL SECURITY;

-- Live tenant_members has no status column — plain membership check,
-- same as the rest of the live policies. (Applied 2026-06-09.)
DROP POLICY IF EXISTS "partners_tenant_access" ON public.partners;
CREATE POLICY "partners_tenant_access" ON public.partners FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS "partner_widgets_tenant_access" ON public.partner_widgets;
CREATE POLICY "partner_widgets_tenant_access" ON public.partner_widgets FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

-- Public-portal read access — looking up a partner by referral_code
-- from the /portal/[code] route should NOT require auth. Allow
-- anonymous SELECT of the basic display fields by referral_code.
DROP POLICY IF EXISTS "partners_public_portal_lookup" ON public.partners;
CREATE POLICY "partners_public_portal_lookup" ON public.partners FOR SELECT
  TO anon, authenticated
  USING (status = 'active' AND portal_access = true);

-- Same for widgets — the embed snippet on a partner's site needs to
-- pull config without an auth token.
DROP POLICY IF EXISTS "partner_widgets_public_lookup" ON public.partner_widgets;
CREATE POLICY "partner_widgets_public_lookup" ON public.partner_widgets FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

-- ── Realtime ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.partners;        EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_widgets; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END$$;

-- ── Forward link from sales_leads.partner_id ─────────────────────
-- Already exists from 2026-05-29 — but make sure the FK is correct
-- now that the `partners` table exists. This is best-effort: if the
-- column doesn't exist or already has a constraint, skip.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='sales_leads' AND column_name='partner_id') THEN
    -- Drop the constraint if it points at a different table, then add
    -- the right one. Wrapped in a sub-block so a missing constraint
    -- doesn't error.
    BEGIN
      ALTER TABLE public.sales_leads
        ADD CONSTRAINT sales_leads_partner_id_fkey
        FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END;
  END IF;
END$$;

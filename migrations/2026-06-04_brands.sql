-- Brand Kit System
-- ──────────────────────────────────────────────────────────────────
-- Drop-in for the spec's `brands` + `brand_moodboard` + `brand_references`.
-- All tables scoped to tenant_id (consistent with the rest of the
-- codebase — `workspace_id` in the spec maps to `tenant_id` here).
-- RLS lets any active tenant member read/write the brand kits of their
-- workspace; cross-tenant access blocked.

CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  logo_url TEXT,
  logo_secondary_url TEXT,
  logo_icon_url TEXT,
  tagline TEXT,
  industry TEXT,
  website_url TEXT,
  description TEXT,

  -- Visual palette
  color_primary    TEXT,
  color_secondary  TEXT,
  color_accent     TEXT,
  color_background TEXT,
  color_text       TEXT,
  font_heading     TEXT,
  font_body        TEXT,
  photo_style_tags TEXT[] DEFAULT '{}',

  -- Voice & tone — 4 sliders 0-100
  tone_formal_casual         INT DEFAULT 50 CHECK (tone_formal_casual         BETWEEN 0 AND 100),
  tone_technical_accessible  INT DEFAULT 50 CHECK (tone_technical_accessible  BETWEEN 0 AND 100),
  tone_serious_playful       INT DEFAULT 50 CHECK (tone_serious_playful       BETWEEN 0 AND 100),
  tone_direct_storytelling   INT DEFAULT 50 CHECK (tone_direct_storytelling   BETWEEN 0 AND 100),
  words_include  TEXT[] DEFAULT '{}',
  words_exclude  TEXT[] DEFAULT '{}',
  voice_examples TEXT[] DEFAULT '{}',
  personality    TEXT,

  -- Audience / content rules
  audience_description TEXT,
  hashtags JSONB DEFAULT '{}'::jsonb,  -- { platform: ['#tag', '#tag'] }
  ctas TEXT[] DEFAULT '{}',
  content_rules JSONB DEFAULT '{}'::jsonb,

  -- The compiled "brand prompt" the AI uses to generate on-brand
  -- content. Populated by train_brand_style.
  brand_prompt TEXT,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brands_tenant_id ON public.brands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_brands_status    ON public.brands(tenant_id, status);

-- Moodboard — visual references for the brand's photography / vibe.
CREATE TABLE IF NOT EXISTS public.brand_moodboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  source TEXT,
  source_url TEXT,
  notes TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_moodboard_brand_id  ON public.brand_moodboard(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_moodboard_tenant_id ON public.brand_moodboard(tenant_id);

-- References — competitor posts, ad copy, etc. that train the AI on
-- "we want THIS energy, not THAT". Each ref carries metrics so the
-- AI can prefer winners.
CREATE TABLE IF NOT EXISTS public.brand_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id  UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('post', 'ad', 'video', 'website', 'email', 'other')),
  platform TEXT,
  content_text TEXT,
  image_url TEXT,
  source_url TEXT,
  metrics JSONB DEFAULT '{}'::jsonb,   -- { views, likes, ctr, conversions }
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_references_brand_id  ON public.brand_references(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_references_tenant_id ON public.brand_references(tenant_id);

-- Keep updated_at fresh on brands.
CREATE OR REPLACE FUNCTION public.touch_brands_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brands_updated_at ON public.brands;
CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.touch_brands_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.brands           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_moodboard  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_references ENABLE ROW LEVEL SECURITY;

-- Policy template: any active member of the tenant can SELECT / INSERT
-- / UPDATE / DELETE the brand kits scoped to that tenant.
-- Mirrors the pattern used elsewhere (strategy_icps, content_pieces, ...).

DROP POLICY IF EXISTS "brands_tenant_access" ON public.brands;
CREATE POLICY "brands_tenant_access" ON public.brands
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "brand_moodboard_tenant_access" ON public.brand_moodboard;
CREATE POLICY "brand_moodboard_tenant_access" ON public.brand_moodboard
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "brand_references_tenant_access" ON public.brand_references;
CREATE POLICY "brand_references_tenant_access" ON public.brand_references
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  );

-- ── Realtime ──────────────────────────────────────────────────────
-- Brand changes should propagate to other open tabs (e.g. moodboard
-- uploads, brand_prompt updates after training). Add to publication
-- defensively — DROP IF EXISTS first so re-running this migration
-- doesn't error.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.brands;            EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.brand_moodboard;   EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.brand_references;  EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END$$;

-- ── Forward link from content_pieces.brand_id ─────────────────────
-- The spec wants content pieces to optionally point at a brand. Add
-- the column if it doesn't exist + index it. NULL = brand-agnostic.
ALTER TABLE public.content_pieces
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_pieces_brand_id
  ON public.content_pieces(brand_id) WHERE brand_id IS NOT NULL;

-- Also: content_templates.brand_id (spec mentions it).
ALTER TABLE public.content_templates
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_templates_brand_id
  ON public.content_templates(brand_id) WHERE brand_id IS NOT NULL;

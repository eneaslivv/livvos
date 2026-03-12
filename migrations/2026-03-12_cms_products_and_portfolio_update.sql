-- =============================================
-- CMS: Extend portfolio_items + create products & client_logos
-- =============================================

-- 1. Extend portfolio_items with new CMS columns
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS services TEXT;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS year TEXT;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS tech_tags TEXT[] DEFAULT '{}';
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT TRUE;
ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_items_slug_tenant
  ON portfolio_items(tenant_id, slug);

-- 2. Products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  target TEXT,
  headline TEXT,
  subheadline TEXT,
  solution TEXT,
  accent_color TEXT,
  gradient TEXT,
  dark_gradient TEXT,
  hero_image TEXT,
  gallery JSONB DEFAULT '[]'::jsonb,
  published BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  portfolio_item_id UUID REFERENCES portfolio_items(id) ON DELETE SET NULL,
  stats JSONB DEFAULT '[]'::jsonb,
  problems JSONB DEFAULT '[]'::jsonb,
  features JSONB DEFAULT '[]'::jsonb,
  workflow JSONB DEFAULT '[]'::jsonb,
  pricing JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug_tenant ON products(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_portfolio ON products(portfolio_item_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select" ON products;
CREATE POLICY "products_select" ON products
FOR SELECT USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "products_modify" ON products;
CREATE POLICY "products_modify" ON products
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

-- 3. Client logos table
CREATE TABLE IF NOT EXISTS client_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  website_url TEXT,
  is_visible BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_logos_tenant_id ON client_logos(tenant_id);

ALTER TABLE client_logos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_logos_select" ON client_logos;
CREATE POLICY "client_logos_select" ON client_logos
FOR SELECT USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "client_logos_modify" ON client_logos;
CREATE POLICY "client_logos_modify" ON client_logos
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

-- 4. Add website_url to tenants for preview iframe
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website_url TEXT;

-- 5. Public RPC functions for external site consumption

CREATE OR REPLACE FUNCTION public.get_public_products(p_tenant_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(p.*) ORDER BY p.display_order ASC, p.created_at DESC), '[]'::jsonb)
    FROM products p
    WHERE p.tenant_id = v_tenant_id AND p.published = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_client_logos(p_tenant_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(l.*) ORDER BY l.sort_order ASC), '[]'::jsonb)
    FROM client_logos l
    WHERE l.tenant_id = v_tenant_id AND l.is_visible = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_products(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_client_logos(TEXT) TO anon, authenticated;

-- Update existing portfolio public function to filter by published and order by display_order
CREATE OR REPLACE FUNCTION public.get_public_portfolio_items(p_tenant_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(p.*) ORDER BY p.display_order ASC, p.created_at DESC), '[]'::jsonb)
    FROM portfolio_items p
    WHERE p.tenant_id = v_tenant_id AND p.published = true
  );
END;
$$;

NOTIFY pgrst, 'reload config';

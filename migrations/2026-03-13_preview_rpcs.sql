-- =============================================
-- Preview RPCs (return ALL items including drafts)
-- + preview_url column on tenants
-- =============================================

-- 1. Add preview_url to tenants (Vercel/staging URL)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- 2. Preview RPCs — return everything (published + drafts) for CMS preview iframe
-- These are SECURITY DEFINER so anon can call them, but they're meant for preview only

CREATE OR REPLACE FUNCTION public.get_preview_portfolio_items(p_tenant_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(
      to_jsonb(p.*) || jsonb_build_object('_is_draft', NOT COALESCE(p.published, true))
      ORDER BY p.display_order ASC, p.created_at DESC
    ), '[]'::jsonb)
    FROM portfolio_items p
    WHERE p.tenant_id = v_tenant_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_preview_products(p_tenant_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(
      to_jsonb(p.*) || jsonb_build_object('_is_draft', NOT COALESCE(p.published, true))
      ORDER BY p.display_order ASC, p.created_at DESC
    ), '[]'::jsonb)
    FROM products p
    WHERE p.tenant_id = v_tenant_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_preview_client_logos(p_tenant_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(
      to_jsonb(l.*) || jsonb_build_object('_is_draft', NOT COALESCE(l.is_visible, true))
      ORDER BY l.sort_order ASC
    ), '[]'::jsonb)
    FROM client_logos l
    WHERE l.tenant_id = v_tenant_id
  );
END;
$$;

-- 3. Grant execute to anon + authenticated
GRANT EXECUTE ON FUNCTION public.get_preview_portfolio_items(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_preview_products(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_preview_client_logos(TEXT) TO anon, authenticated;

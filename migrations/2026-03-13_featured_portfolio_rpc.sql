-- =============================================
-- Featured Portfolio RPC — returns max 6 featured items for homepage
-- + Updated public RPC to include featured flag info
-- =============================================

-- 1. Featured items only (for homepage section, max 6)
CREATE OR REPLACE FUNCTION public.get_featured_portfolio_items(p_tenant_slug TEXT)
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
      to_jsonb(p.*)
      ORDER BY p.display_order ASC, p.created_at DESC
    ), '[]'::jsonb)
    FROM portfolio_items p
    WHERE p.tenant_id = v_tenant_id
      AND p.published = true
      AND p.featured = true
    LIMIT 6
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_featured_portfolio_items(TEXT) TO anon, authenticated;

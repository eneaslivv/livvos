-- =============================================
-- FIX: Work section should show ALL published projects, not just featured
-- The get_public_portfolio_items() RPC had AND p.featured = true
-- which made it identical to get_featured_portfolio_items().
-- Featured projects appear on homepage; Work page shows everything published.
-- =============================================

CREATE OR REPLACE FUNCTION public.get_public_portfolio_items(p_tenant_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_result JSONB;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(sub.*)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT *
    FROM portfolio_items p
    WHERE p.tenant_id = v_tenant_id
      AND p.published = true
    ORDER BY p.display_order ASC, p.created_at DESC
  ) sub;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_portfolio_items(TEXT) TO anon, authenticated;
NOTIFY pgrst, 'reload config';

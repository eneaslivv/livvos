-- =============================================
-- Add category column to client_logos
-- =============================================

ALTER TABLE client_logos
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'client';

-- Update public function to include category in response
CREATE OR REPLACE FUNCTION public.get_public_client_logos(p_tenant_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug;
  IF v_tenant_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(l.*) ORDER BY l.sort_order ASC), '[]'::jsonb)
    FROM client_logos l
    WHERE l.tenant_id = v_tenant_id AND l.is_visible = true
  );
END;
$$;

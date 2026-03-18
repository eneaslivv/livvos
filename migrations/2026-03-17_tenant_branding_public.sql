-- Public tenant branding RPC (no auth required)
-- Returns logo_url, logo_url_dark, name for the active tenant
-- Used on login/signup pages before user is authenticated

DROP FUNCTION IF EXISTS get_tenant_branding();

CREATE OR REPLACE FUNCTION get_tenant_branding()
RETURNS TABLE(logo_url TEXT, logo_url_dark TEXT, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.logo_url, t.logo_url_dark, t.name
  FROM tenants t
  WHERE t.status = 'active'
  ORDER BY (t.logo_url IS NOT NULL AND t.logo_url <> '') DESC
  LIMIT 1;
END;
$$;

-- Allow anon and authenticated roles to call this
GRANT EXECUTE ON FUNCTION get_tenant_branding() TO anon;
GRANT EXECUTE ON FUNCTION get_tenant_branding() TO authenticated;

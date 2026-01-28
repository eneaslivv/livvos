CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  excerpt TEXT,
  content TEXT,
  language TEXT DEFAULT 'en',
  cover_url TEXT,
  tags TEXT[] DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_slug_tenant ON blog_posts(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_tenant_id ON blog_posts(tenant_id);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blog_posts_select" ON blog_posts;
CREATE POLICY "blog_posts_select" ON blog_posts
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "blog_posts_modify" ON blog_posts;
CREATE POLICY "blog_posts_modify" ON blog_posts
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

CREATE OR REPLACE FUNCTION public.get_public_portfolio_items(p_tenant_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(p.*) ORDER BY p.created_at DESC), '[]'::jsonb)
    FROM portfolio_items p
    WHERE p.tenant_id = v_tenant_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_blog_posts(p_tenant_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(b.*) ORDER BY b.published_at DESC NULLS LAST), '[]'::jsonb)
    FROM blog_posts b
    WHERE b.tenant_id = v_tenant_id AND b.status = 'published'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_blog_post(p_tenant_slug TEXT, p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = p_tenant_slug LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT to_jsonb(b.*)
    FROM blog_posts b
    WHERE b.tenant_id = v_tenant_id AND b.status = 'published' AND b.slug = p_slug
    LIMIT 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_portfolio_items(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_blog_posts(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_blog_post(TEXT, TEXT) TO anon, authenticated;

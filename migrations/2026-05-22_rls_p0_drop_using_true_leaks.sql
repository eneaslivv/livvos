-- =============================================================================
-- P0.1 — Drop policies USING(true) que dejan acceso cross-tenant.
--
-- Aplicada en producción 2026-05-22 via MCP apply_migration:
-- migration name = rls_p0_drop_using_true_leaks
--
-- Cada tabla afectada YA tenía policies tenant-scoped correctas. Como RLS
-- combina policies con OR, mientras existiera UNA USING(true) la protección
-- era nula. Dropearlas activa las que ya estaban.
--
-- Tablas: events, leads, portfolio_items, products, project_shares,
-- analytics_metrics.
-- =============================================================================

BEGIN;

-- events: tabla legacy con 0 rows, sin tenant_id. Queda events_insert_admin.
DROP POLICY IF EXISTS events_tenant_select ON events;
DROP POLICY IF EXISTS events_tenant_insert ON events;
DROP POLICY IF EXISTS events_tenant_update ON events;
DROP POLICY IF EXISTS events_tenant_delete ON events;

-- leads: drop las 4 permisivas. Quedan las tenant-scoped existentes.
DROP POLICY IF EXISTS "Enable all for authenticated" ON leads;
DROP POLICY IF EXISTS "Enable insert for everyone" ON leads;
DROP POLICY IF EXISTS "Enable read for authenticated" ON leads;
DROP POLICY IF EXISTS "leads_insert" ON leads;

-- portfolio_items: drop las 3 permisivas. Quedan portfolio_items_select,
-- portfolio_items_modify (ambas can_access_tenant) y portfolio_items_public_read
-- (published=true, para la web pública).
DROP POLICY IF EXISTS "Admin all" ON portfolio_items;
DROP POLICY IF EXISTS "Public read" ON portfolio_items;
DROP POLICY IF EXISTS portfolio_items_auth_all ON portfolio_items;

-- products: drop la permisiva + agregar tenant-scoped CRUD (no existía).
-- products_public_read (published=true) se mantiene para anon.
DROP POLICY IF EXISTS products_auth_all ON products;
CREATE POLICY products_tenant_select ON products FOR SELECT TO authenticated
  USING (can_access_tenant(tenant_id));
CREATE POLICY products_tenant_insert ON products FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id));
CREATE POLICY products_tenant_update ON products FOR UPDATE TO authenticated
  USING (can_access_tenant(tenant_id))
  WITH CHECK (can_access_tenant(tenant_id));
CREATE POLICY products_tenant_delete ON products FOR DELETE TO authenticated
  USING (can_access_tenant(tenant_id));

-- analytics_metrics: agregar tenant_id + drop la permisiva.
ALTER TABLE analytics_metrics ADD COLUMN IF NOT EXISTS tenant_id UUID
  REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS analytics_metrics_tenant_idx ON analytics_metrics(tenant_id);

DROP POLICY IF EXISTS analytics_authenticated_access ON analytics_metrics;
CREATE POLICY analytics_tenant_select ON analytics_metrics FOR SELECT TO authenticated
  USING (can_access_tenant(tenant_id));
CREATE POLICY analytics_tenant_insert ON analytics_metrics FOR INSERT TO authenticated
  WITH CHECK (can_access_tenant(tenant_id));
CREATE POLICY analytics_tenant_update ON analytics_metrics FOR UPDATE TO authenticated
  USING (can_access_tenant(tenant_id))
  WITH CHECK (can_access_tenant(tenant_id));
CREATE POLICY analytics_tenant_delete ON analytics_metrics FOR DELETE TO authenticated
  USING (can_access_tenant(tenant_id));

-- project_shares: drop USING(true) + RPC para lookup por token.
DROP POLICY IF EXISTS project_shares_token_select ON project_shares;

CREATE OR REPLACE FUNCTION public.lookup_project_share_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  email text,
  status text,
  project_id uuid,
  project_title text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT ps.id, ps.email, ps.status, ps.project_id, p.title
  FROM project_shares ps
  LEFT JOIN projects p ON p.id = ps.project_id
  WHERE ps.token = p_token
    AND ps.token IS NOT NULL
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_project_share_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_project_share_by_token(text) TO anon, authenticated;

COMMIT;

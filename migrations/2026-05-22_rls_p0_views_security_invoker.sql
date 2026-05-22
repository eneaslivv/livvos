-- =============================================================================
-- P0.2 — Recrear vistas content_calendar + sales_pipeline_metrics con
--         SECURITY INVOKER en lugar del DEFINER default de PG17.
--
-- Aplicada en producción 2026-05-22 via MCP apply_migration:
-- migration name = rls_p0_views_security_invoker
--
-- Sin security_invoker=on, las views ejecutan con privilegios del owner
-- (postgres), bypaseando RLS de las tablas subyacentes (content_pieces,
-- sales_leads). Eso significa que cualquier user authenticated que pueda
-- hacer SELECT del view ve data de TODOS los tenants.
--
-- Con security_invoker=on, las queries internas corren con permisos del
-- caller, así que las RLS policies de las tablas se aplican correctamente.
-- =============================================================================

BEGIN;

DROP VIEW IF EXISTS public.content_calendar;
CREATE VIEW public.content_calendar
  WITH (security_invoker = on)
AS
  SELECT cp.id,
    cp.tenant_id,
    cp.title,
    cp.status,
    cp.scheduled_date,
    cp.published_date,
    cp.content_type,
    cp.target_icp_id,
    cp.channel_id,
    cp.engagement_metrics,
    cc.name AS channel_name,
    cc.platform,
    si.name AS target_audience_name
  FROM content_pieces cp
    LEFT JOIN content_channels cc ON cp.channel_id = cc.id
    LEFT JOIN strategy_icps si    ON cp.target_icp_id = si.id;

DROP VIEW IF EXISTS public.sales_pipeline_metrics;
CREATE VIEW public.sales_pipeline_metrics
  WITH (security_invoker = on)
AS
  SELECT tenant_id,
    status,
    count(*) AS count,
    COALESCE(sum(deal_value_implementation), 0::numeric) AS total_implementation_value,
    COALESCE(sum(deal_value_monthly), 0::numeric)        AS total_mrr_potential,
    COALESCE(avg(EXTRACT(epoch FROM updated_at - created_at) / 86400::numeric)::integer, 0) AS avg_days_in_stage
  FROM sales_leads
  WHERE status <> 'lost'::text
  GROUP BY tenant_id, status;

GRANT SELECT ON public.content_calendar       TO authenticated;
GRANT SELECT ON public.sales_pipeline_metrics TO authenticated;

COMMIT;

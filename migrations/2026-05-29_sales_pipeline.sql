-- Sales Pipeline: leads (the funnel) + outreach log (every touchpoint).
-- Separate from the existing `clients` table (which is the post-close
-- CRM): a sales_lead is a prospect we're TRYING to close.
-- Per-tenant via RLS using tenant_members membership check.

CREATE TABLE IF NOT EXISTS public.sales_leads (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_name                TEXT NOT NULL,
  contact_name                TEXT,
  contact_email               TEXT,
  contact_phone               TEXT,
  source                      TEXT,
  icp_id                      UUID REFERENCES public.strategy_icps(id) ON DELETE SET NULL,
  status                      TEXT NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new', 'contacted', 'call_scheduled', 'call_done',
                                                 'proposal_sent', 'negotiating', 'won', 'lost', 'nurturing')),
  assigned_to                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  package_id                  UUID REFERENCES public.strategy_packages(id) ON DELETE SET NULL,
  deal_value_implementation   NUMERIC,
  deal_value_monthly          NUMERIC,
  lost_reason                 TEXT,
  notes                       TEXT,
  next_action                 TEXT,
  next_action_date            DATE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_leads_tenant_idx        ON public.sales_leads (tenant_id);
CREATE INDEX IF NOT EXISTS sales_leads_status_idx        ON public.sales_leads (tenant_id, status);
CREATE INDEX IF NOT EXISTS sales_leads_next_action_idx   ON public.sales_leads (tenant_id, next_action_date)
                                                          WHERE next_action_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sales_outreach (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id             UUID NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL,
  message_type        TEXT,
  content             TEXT,
  loom_url            TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_received   BOOLEAN NOT NULL DEFAULT FALSE,
  response_at         TIMESTAMPTZ,
  response_summary    TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_outreach_lead_idx       ON public.sales_outreach (lead_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS sales_outreach_tenant_idx     ON public.sales_outreach (tenant_id);

CREATE OR REPLACE VIEW public.sales_pipeline_metrics AS
SELECT
  tenant_id,
  status,
  COUNT(*)                                                            AS count,
  COALESCE(SUM(deal_value_implementation), 0)                         AS total_implementation_value,
  COALESCE(SUM(deal_value_monthly), 0)                                AS total_mrr_potential,
  COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)::INT, 0) AS avg_days_in_stage
FROM public.sales_leads
WHERE status NOT IN ('lost')
GROUP BY tenant_id, status;

ALTER TABLE public.sales_leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_outreach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_leads_tenant ON public.sales_leads;
CREATE POLICY sales_leads_tenant ON public.sales_leads
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS sales_outreach_tenant ON public.sales_outreach;
CREATE POLICY sales_outreach_tenant ON public.sales_outreach
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_sales_leads_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_leads_touch_updated_at ON public.sales_leads;
CREATE TRIGGER sales_leads_touch_updated_at
  BEFORE UPDATE ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_sales_leads_updated_at();

-- Strategy Hub: ICPs (target audiences), service packages, positioning
-- principles. Per-tenant via RLS. Foundation for the growth-engine
-- layer of LIVV OS.

CREATE TABLE IF NOT EXISTS public.strategy_icps (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                       TEXT NOT NULL,
  description                TEXT,
  pain_points                TEXT[] NOT NULL DEFAULT '{}',
  entry_module               TEXT,
  expansion_path             TEXT[] NOT NULL DEFAULT '{}',
  market_geo                 TEXT[] NOT NULL DEFAULT '{}',
  ticket_implementation      NUMERIC,
  ticket_retainer_monthly    NUMERIC,
  status                     TEXT NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'testing', 'deprecated')),
  vertical_playbook          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strategy_icps_tenant_idx ON public.strategy_icps (tenant_id);
CREATE INDEX IF NOT EXISTS strategy_icps_status_idx ON public.strategy_icps (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.strategy_packages (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  target_icp_id            UUID REFERENCES public.strategy_icps(id) ON DELETE SET NULL,
  modules_included         TEXT[] NOT NULL DEFAULT '{}',
  implementation_weeks     INT,
  price_implementation     NUMERIC,
  price_monthly            NUMERIC,
  deliverables             TEXT[] NOT NULL DEFAULT '{}',
  status                   TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'active', 'deprecated')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strategy_packages_tenant_idx ON public.strategy_packages (tenant_id);
CREATE INDEX IF NOT EXISTS strategy_packages_icp_idx   ON public.strategy_packages (target_icp_id);

CREATE TABLE IF NOT EXISTS public.strategy_positioning (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  principle   TEXT NOT NULL,
  description TEXT,
  examples    TEXT[] NOT NULL DEFAULT '{}',
  applies_to  TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strategy_positioning_tenant_idx ON public.strategy_positioning (tenant_id);

ALTER TABLE public.strategy_icps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_packages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_positioning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS strategy_icps_tenant ON public.strategy_icps;
CREATE POLICY strategy_icps_tenant ON public.strategy_icps
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS strategy_packages_tenant ON public.strategy_packages;
CREATE POLICY strategy_packages_tenant ON public.strategy_packages
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS strategy_positioning_tenant ON public.strategy_positioning;
CREATE POLICY strategy_positioning_tenant ON public.strategy_positioning
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_strategy_icps_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS strategy_icps_touch_updated_at ON public.strategy_icps;
CREATE TRIGGER strategy_icps_touch_updated_at
  BEFORE UPDATE ON public.strategy_icps
  FOR EACH ROW EXECUTE FUNCTION public.touch_strategy_icps_updated_at();

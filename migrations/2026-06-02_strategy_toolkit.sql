-- Strategy-as-a-Service: the agency's internal strategy frameworks
-- turned into productized client deliverables. Two tables:
--   strategy_frameworks — reusable library
--   client_strategy_projects — instances delivered for clients

CREATE TABLE IF NOT EXISTS public.strategy_frameworks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  category            TEXT,
  description         TEXT,
  template            JSONB NOT NULL DEFAULT '{}'::jsonb,
  deliverable_type    TEXT,
  estimated_hours     NUMERIC,
  price               NUMERIC,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','draft','archived')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategy_frameworks_tenant_idx ON public.strategy_frameworks (tenant_id);

CREATE TABLE IF NOT EXISTS public.client_strategy_projects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_project_id       UUID,
  client_name             TEXT NOT NULL,
  framework_id            UUID REFERENCES public.strategy_frameworks(id) ON DELETE SET NULL,
  icps_defined            JSONB NOT NULL DEFAULT '[]'::jsonb,
  channels_recommended    JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_plan            JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes                   TEXT,
  status                  TEXT NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress','delivered','archived')),
  delivered_at            DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_strategy_projects_tenant_idx ON public.client_strategy_projects (tenant_id);

ALTER TABLE public.strategy_frameworks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_strategy_projects  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS strategy_frameworks_tenant ON public.strategy_frameworks;
CREATE POLICY strategy_frameworks_tenant ON public.strategy_frameworks
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS client_strategy_projects_tenant ON public.client_strategy_projects;
CREATE POLICY client_strategy_projects_tenant ON public.client_strategy_projects
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_client_strategy_projects_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_strategy_projects_touch_updated_at ON public.client_strategy_projects;
CREATE TRIGGER client_strategy_projects_touch_updated_at
  BEFORE UPDATE ON public.client_strategy_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_strategy_projects_updated_at();

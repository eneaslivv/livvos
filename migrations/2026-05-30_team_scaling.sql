-- Team & Scaling: positions we WANT to hire + contractor/employee
-- profiles + KPI tracking. Per-tenant via RLS. Distinct from
-- tenant_members (auth/RLS) and from app-wide RBAC roles.

CREATE TABLE IF NOT EXISTS public.team_role_definitions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title                    TEXT NOT NULL,
  department               TEXT,
  type                     TEXT NOT NULL DEFAULT 'contractor'
                             CHECK (type IN ('contractor', 'part_time', 'full_time')),
  hire_phase               TEXT,
  hire_priority            INT,
  rationale                TEXT,
  tasks                    TEXT[] NOT NULL DEFAULT '{}',
  skills_required          TEXT[] NOT NULL DEFAULT '{}',
  kpis                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_cost_monthly   NUMERIC,
  status                   TEXT NOT NULL DEFAULT 'planned'
                             CHECK (status IN ('planned', 'hiring', 'filled', 'paused')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_role_definitions_tenant_idx ON public.team_role_definitions (tenant_id);

CREATE TABLE IF NOT EXISTS public.team_member_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role_id       UUID REFERENCES public.team_role_definitions(id) ON DELETE SET NULL,
  type          TEXT NOT NULL DEFAULT 'contractor'
                  CHECK (type IN ('contractor', 'part_time', 'full_time')),
  start_date    DATE,
  rate_monthly  NUMERIC,
  rate_type     TEXT
                  CHECK (rate_type IN ('monthly', 'hourly', 'commission', 'project') OR rate_type IS NULL),
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'trial', 'offboarded')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_member_profiles_tenant_idx ON public.team_member_profiles (tenant_id);
CREATE INDEX IF NOT EXISTS team_member_profiles_role_idx   ON public.team_member_profiles (role_id);

CREATE TABLE IF NOT EXISTS public.team_kpi_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  member_id     UUID REFERENCES public.team_member_profiles(id) ON DELETE CASCADE,
  role_id       UUID REFERENCES public.team_role_definitions(id) ON DELETE SET NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  metric_name   TEXT NOT NULL,
  target_value  NUMERIC,
  actual_value  NUMERIC,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_kpi_logs_tenant_idx  ON public.team_kpi_logs (tenant_id);
CREATE INDEX IF NOT EXISTS team_kpi_logs_member_idx  ON public.team_kpi_logs (member_id, period_start DESC);

ALTER TABLE public.team_role_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_member_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_kpi_logs         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_role_definitions_tenant ON public.team_role_definitions;
CREATE POLICY team_role_definitions_tenant ON public.team_role_definitions
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS team_member_profiles_tenant ON public.team_member_profiles;
CREATE POLICY team_member_profiles_tenant ON public.team_member_profiles
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS team_kpi_logs_tenant ON public.team_kpi_logs;
CREATE POLICY team_kpi_logs_tenant ON public.team_kpi_logs
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

-- Growth Dashboard: phases, KPIs, weekly snapshots + compute RPC.
-- The snapshot RPC pulls cross-module data (Finance, Sales, Content)
-- via tenant-scoped queries and UPSERTs the result so re-runs for
-- the same week overwrite, never duplicate. pg_cron can call this
-- weekly via the snapshot Edge Function.
-- (Full SQL applied to project; see 2026-05-31 migration content.)

CREATE TABLE IF NOT EXISTS public.growth_phases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phase_number  INT NOT NULL,
  title         TEXT NOT NULL,
  timeline      TEXT,
  status        TEXT NOT NULL DEFAULT 'upcoming'
                  CHECK (status IN ('active', 'completed', 'upcoming')),
  milestones    JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at    DATE,
  completed_at  DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_phases_tenant_idx ON public.growth_phases (tenant_id, phase_number);

CREATE TABLE IF NOT EXISTS public.growth_kpis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_name   TEXT NOT NULL,
  target_value  NUMERIC,
  target_unit   TEXT,
  current_value NUMERIC,
  last_updated  TIMESTAMPTZ,
  trend         TEXT CHECK (trend IN ('up','down','flat') OR trend IS NULL),
  category      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_kpis_tenant_idx ON public.growth_kpis (tenant_id);

CREATE TABLE IF NOT EXISTS public.growth_weekly_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  week_start               DATE NOT NULL,
  metrics                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  highlights               TEXT,
  blockers                 TEXT,
  next_week_priorities     TEXT[] NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS growth_weekly_snapshots_unique
  ON public.growth_weekly_snapshots (tenant_id, week_start);

ALTER TABLE public.growth_phases            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_kpis              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_weekly_snapshots  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS growth_phases_tenant ON public.growth_phases;
CREATE POLICY growth_phases_tenant ON public.growth_phases
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS growth_kpis_tenant ON public.growth_kpis;
CREATE POLICY growth_kpis_tenant ON public.growth_kpis
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS growth_weekly_snapshots_tenant ON public.growth_weekly_snapshots;
CREATE POLICY growth_weekly_snapshots_tenant ON public.growth_weekly_snapshots
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

-- compute_growth_snapshot RPC body lives in the applied migration only
-- (see Supabase project). 250 lines of SQL — when you need to edit it
-- locally, dump it from the live DB. Keeping a copy here would just
-- drift from production.

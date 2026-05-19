-- Automations — user-managed cross-module rules.
-- ──────────────────────────────────────────────────────────────────
-- The 4 hard-coded triggers from 2026-06-01_cross_module_automations.sql
-- (lead won → project, project done → case study, outreach → status,
-- content publish → metric placeholder) keep running unchanged.
--
-- This table is for ADDITIONAL automations the user defines through
-- the UI — "when X event happens in module A, run Y action in
-- module B". The execution runtime is intentionally NOT in this
-- migration — that lands when the matching Edge Function ships.
-- For now we just persist the definitions + an execution log so the
-- UI can render history.

CREATE TABLE IF NOT EXISTS public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Trigger
  trigger_module TEXT NOT NULL,
  -- 'tasks' | 'projects' | 'leads' | 'content' | 'finance' | 'calendar' | 'partners' | 'team' | 'time'
  trigger_event TEXT NOT NULL,
  -- e.g. 'task.completed' | 'lead.status_changed' | 'project.deadline_approaching' | 'content.published'
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { filter: { project_id?, priority?, status_to? }, debounce_minutes? }

  -- Action
  action_module TEXT NOT NULL,
  -- 'tasks' | 'projects' | ... | 'notifications' | 'ai'
  action_type TEXT NOT NULL,
  -- e.g. 'create_task' | 'send_slack' | 'send_email' | 'generate_content' | 'mark_status'
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { project_id?, template?, recipient?, payload? }

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'draft', 'archived')),
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  run_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automations_tenant_id      ON public.automations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automations_status         ON public.automations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_automations_trigger_module ON public.automations(tenant_id, trigger_module);

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id)     ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_data JSONB,
  action_result JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_automation_id ON public.automation_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_tenant_id     ON public.automation_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_triggered_at  ON public.automation_logs(tenant_id, triggered_at DESC);

CREATE OR REPLACE FUNCTION public.touch_automations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_automations_updated_at ON public.automations;
CREATE TRIGGER trg_automations_updated_at BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.touch_automations_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.automations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automations_tenant_access" ON public.automations;
CREATE POLICY "automations_tenant_access" ON public.automations FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));

DROP POLICY IF EXISTS "automation_logs_tenant_access" ON public.automation_logs;
CREATE POLICY "automation_logs_tenant_access" ON public.automation_logs FOR ALL
  USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));

-- ── Realtime ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.automations;     EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END$$;

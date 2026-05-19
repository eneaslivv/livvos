-- =============================================
-- agent_overrides — per-tenant, per-agent prompt + routing tweaks.
--
-- The TypeScript files in lib/agents/agents/*-agent.ts are DEFAULTS.
-- Overrides layer on top at runtime so the system can self-tune
-- without code changes.
--
-- A row's lifecycle:
--   proposed  → prompt-tuner just generated it; not yet active
--   active    → admin approved; orchestrator picks it up (one per
--               tenant+agent — enforced by unique partial index)
--   rejected  → admin dismissed it; kept for audit / future training
--   superseded → was active, then replaced by a newer active one
--
-- Routing hints come in two flavors:
--   routing_hints_add    — keywords ADDED to the agent's default
--                          routingHints array
--   routing_hints_remove — keywords REMOVED (mistaken matches)
--
-- prompt_suffix appends to the agent's default systemPrompt. We never
-- replace the base prompt — additive only. That keeps non-invention
-- rules + action protocol intact even if the override is buggy.
-- =============================================

CREATE TABLE IF NOT EXISTS public.agent_overrides (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'proposed'
                          CHECK (status IN ('proposed', 'active', 'rejected', 'superseded')),
  routing_hints_add     JSONB NOT NULL DEFAULT '[]'::jsonb,
  routing_hints_remove  JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_suffix         TEXT,
  rationale             TEXT,
  -- Evidence: structured pointers back to the rows that motivated
  -- this proposal. Shape:
  --   { conversations: [{id, query, reply, agent_id}],
  --     stats: {turns, thumbs_down, re_asks, no_data_rate, approve_rate} }
  -- Used by the review modal so the admin sees WHY the tuner proposed
  -- this — not just an opaque diff.
  evidence              JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at            TIMESTAMPTZ,
  applied_by            UUID REFERENCES auth.users(id),
  rejected_at           TIMESTAMPTZ,
  rejected_by           UUID REFERENCES auth.users(id),
  superseded_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_overrides_tenant_agent_idx
  ON public.agent_overrides (tenant_id, agent_id, proposed_at DESC);

CREATE INDEX IF NOT EXISTS agent_overrides_status_idx
  ON public.agent_overrides (status);

-- Only ONE active row per (tenant, agent). Approving a new override
-- must first supersede the previous one (handled in the approval RPC).
CREATE UNIQUE INDEX IF NOT EXISTS agent_overrides_one_active
  ON public.agent_overrides (tenant_id, agent_id) WHERE status = 'active';

-- RLS — tenant members can read; only admins (role check at app level)
-- can write. For now: any tenant member can read/write; tighten later
-- if we add a permissions matrix for AI tuning.
ALTER TABLE public.agent_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_overrides_tenant_read ON public.agent_overrides;
CREATE POLICY agent_overrides_tenant_read ON public.agent_overrides
  FOR SELECT USING (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS agent_overrides_tenant_write ON public.agent_overrides;
CREATE POLICY agent_overrides_tenant_write ON public.agent_overrides
  FOR ALL USING (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
  )) WITH CHECK (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
  ));

-- approve_agent_override(p_override_id) — flips an override from
-- 'proposed' to 'active' AND supersedes any prior active row for the
-- same (tenant, agent) in one transaction. Returns the activated row.
CREATE OR REPLACE FUNCTION public.approve_agent_override(p_override_id UUID)
RETURNS public.agent_overrides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.agent_overrides;
BEGIN
  -- Lock the candidate row first; refuse if it isn't in 'proposed'.
  SELECT * INTO v_row FROM public.agent_overrides
    WHERE id = p_override_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Override % not found', p_override_id;
  END IF;
  IF v_row.status <> 'proposed' THEN
    RAISE EXCEPTION 'Override % is %, not proposed', p_override_id, v_row.status;
  END IF;

  -- Supersede any currently-active override for this (tenant, agent).
  UPDATE public.agent_overrides
    SET status = 'superseded', superseded_at = NOW()
    WHERE tenant_id = v_row.tenant_id
      AND agent_id = v_row.agent_id
      AND status = 'active';

  -- Promote the candidate.
  UPDATE public.agent_overrides
    SET status = 'active',
        applied_at = NOW(),
        applied_by = auth.uid()
    WHERE id = p_override_id
    RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_agent_override(UUID) FROM public;
GRANT  EXECUTE ON FUNCTION public.approve_agent_override(UUID) TO authenticated;

-- reject_agent_override(p_override_id) — marks a proposed override as
-- rejected. Kept for audit so future tuners can learn from rejections.
CREATE OR REPLACE FUNCTION public.reject_agent_override(p_override_id UUID)
RETURNS public.agent_overrides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.agent_overrides;
BEGIN
  UPDATE public.agent_overrides
    SET status = 'rejected', rejected_at = NOW(), rejected_by = auth.uid()
    WHERE id = p_override_id AND status = 'proposed'
    RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Override % not found or not in proposed state', p_override_id;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_agent_override(UUID) FROM public;
GRANT  EXECUTE ON FUNCTION public.reject_agent_override(UUID) TO authenticated;

COMMENT ON TABLE public.agent_overrides IS
  'Per-tenant overrides for agent routing hints + system prompts. '
  'Layers on top of the TypeScript defaults in lib/agents/agents/*-agent.ts. '
  'Populated by the prompt-tuner (lib/agents/critique/prompt-tuner.ts); '
  'admin reviews via System → AI Metrics → Suggest improvements.';

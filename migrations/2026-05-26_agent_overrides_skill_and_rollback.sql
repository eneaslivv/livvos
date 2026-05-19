-- Extension of agent_overrides:
--   • skill_overrides: per-skill description tweaks. Shape:
--       { "tasks.list_open_for_me": "new description ≤200 chars", ... }
--     Applied by the orchestrator when building the agent's prompt:
--     swaps the TS-default skill.description with the override.
--   • auto_applied: TRUE when the tuner decided the proposal was
--     low-risk enough to skip the admin review modal and activate
--     immediately. The UI badge differentiates these from
--     human-approved ones so trust + audit stay clear.
--   • confidence: meta-model's own confidence ('low'|'medium'|'high').
--     Already passed back in the tuner JSON; persisting it makes the
--     "View active" panel useful — admin can see why something was
--     auto-applied (or wasn't).
--   • rollback_agent_override RPC: lets the admin revert an active
--     override to 'superseded' without proposing a replacement first.
--     Useful when an auto-applied tweak turns out to be wrong and the
--     admin wants to fall back to the TS defaults immediately.

ALTER TABLE public.agent_overrides
  ADD COLUMN IF NOT EXISTS skill_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confidence TEXT;

CREATE OR REPLACE FUNCTION public.rollback_agent_override(p_override_id UUID)
RETURNS public.agent_overrides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.agent_overrides;
BEGIN
  UPDATE public.agent_overrides
    SET status = 'superseded', superseded_at = NOW()
    WHERE id = p_override_id AND status = 'active'
    RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Override % not found or not active', p_override_id;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rollback_agent_override(UUID) FROM public;
GRANT  EXECUTE ON FUNCTION public.rollback_agent_override(UUID) TO authenticated;

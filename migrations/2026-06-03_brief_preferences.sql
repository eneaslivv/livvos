-- Per-user preferences for the Daily Brief on the Brief page.
-- Drives which categories appear, in what order, plus AI synthesis
-- on/off + tone. Default config = everything on, default order.

CREATE TABLE IF NOT EXISTS public.brief_preferences (
  user_id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id              UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled_categories     TEXT[] NOT NULL DEFAULT ARRAY[
    'today_load','cashflow','pipeline','content',
    'inbox','team_kpis','strategy','upcoming'
  ],
  ai_synthesis_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  synthesis_tone         TEXT NOT NULL DEFAULT 'concise'
                           CHECK (synthesis_tone IN ('concise','warm','direct','coaching')),
  show_top_recommendation BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.brief_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brief_preferences_own ON public.brief_preferences;
CREATE POLICY brief_preferences_own ON public.brief_preferences
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_brief_preferences_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brief_preferences_touch_updated_at ON public.brief_preferences;
CREATE TRIGGER brief_preferences_touch_updated_at
  BEFORE UPDATE ON public.brief_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_brief_preferences_updated_at();

-- Content Engine: channels (LinkedIn, IG, YT, etc), individual content
-- pieces with full lifecycle (idea→drafted→review→scheduled→published),
-- reusable templates. Per-tenant via RLS. Joins back to strategy_icps
-- for audience targeting + projects (loose, by id only, not FK) for
-- case study sourcing.

CREATE TABLE IF NOT EXISTS public.content_channels (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  platform                  TEXT NOT NULL,
  priority                  TEXT NOT NULL DEFAULT 'secondary'
                              CHECK (priority IN ('principal', 'secondary', 'long-term', 'passive')),
  target_audience           TEXT,
  tone                      TEXT,
  format_types              TEXT[] NOT NULL DEFAULT '{}',
  frequency_target          TEXT,
  frequency_posts_per_week  INT,
  status                    TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'paused', 'archived')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_channels_tenant_idx ON public.content_channels (tenant_id);

CREATE TABLE IF NOT EXISTS public.content_pieces (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  channel_id           UUID REFERENCES public.content_channels(id) ON DELETE SET NULL,
  content_type         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'idea'
                         CHECK (status IN ('idea', 'drafted', 'review', 'scheduled', 'published', 'repurposed')),
  target_icp_id        UUID REFERENCES public.strategy_icps(id) ON DELETE SET NULL,
  body                 TEXT,
  media_urls           TEXT[] NOT NULL DEFAULT '{}',
  scheduled_date       DATE,
  published_date       DATE,
  published_url        TEXT,
  source_project_id    UUID,
  repurposed_from      UUID REFERENCES public.content_pieces(id) ON DELETE SET NULL,
  engagement_metrics   JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                TEXT,
  assigned_to          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_pieces_tenant_idx              ON public.content_pieces (tenant_id);
CREATE INDEX IF NOT EXISTS content_pieces_tenant_status_idx       ON public.content_pieces (tenant_id, status);
CREATE INDEX IF NOT EXISTS content_pieces_tenant_scheduled_idx    ON public.content_pieces (tenant_id, scheduled_date);
CREATE INDEX IF NOT EXISTS content_pieces_channel_idx             ON public.content_pieces (channel_id);
CREATE INDEX IF NOT EXISTS content_pieces_icp_idx                 ON public.content_pieces (target_icp_id);

CREATE TABLE IF NOT EXISTS public.content_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  channel_id    UUID REFERENCES public.content_channels(id) ON DELETE SET NULL,
  content_type  TEXT,
  structure     TEXT,
  example       TEXT,
  tone_notes    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_templates_tenant_idx ON public.content_templates (tenant_id);

CREATE OR REPLACE VIEW public.content_calendar AS
SELECT
  cp.id,
  cp.tenant_id,
  cp.title,
  cp.status,
  cp.scheduled_date,
  cp.published_date,
  cp.content_type,
  cp.target_icp_id,
  cp.channel_id,
  cp.engagement_metrics,
  cc.name      AS channel_name,
  cc.platform  AS platform,
  si.name      AS target_audience_name
FROM public.content_pieces cp
LEFT JOIN public.content_channels cc ON cp.channel_id     = cc.id
LEFT JOIN public.strategy_icps    si ON cp.target_icp_id  = si.id;

ALTER TABLE public.content_channels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_pieces    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_channels_tenant ON public.content_channels;
CREATE POLICY content_channels_tenant ON public.content_channels
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS content_pieces_tenant ON public.content_pieces;
CREATE POLICY content_pieces_tenant ON public.content_pieces
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

DROP POLICY IF EXISTS content_templates_tenant ON public.content_templates;
CREATE POLICY content_templates_tenant ON public.content_templates
  FOR ALL USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_content_pieces_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_pieces_touch_updated_at ON public.content_pieces;
CREATE TRIGGER content_pieces_touch_updated_at
  BEFORE UPDATE ON public.content_pieces
  FOR EACH ROW EXECUTE FUNCTION public.touch_content_pieces_updated_at();

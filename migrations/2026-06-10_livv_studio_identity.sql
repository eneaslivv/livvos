-- =============================================================================
-- livv_studio_identity — Sprint 0 del LIVV OS MASTER SPEC
-- =============================================================================
-- Equivalente al VenueIdentity de Payper pero para el STUDIO. Almacena los
-- hechos canónicos compartidos que Norte custodia y los demás agentes leen
-- (spec §7 capa 3).
--
-- Singleton: una sola row con id='livv'. RLS: solo platform admin lee/escribe.
-- Vive aplicado en Supabase (ngswutcpsgdgmmjnfddi) — este archivo es el
-- source-of-truth versionado en git.
-- =============================================================================

CREATE TABLE IF NOT EXISTS livv_studio_identity (
  id                    TEXT PRIMARY KEY DEFAULT 'livv',
  founder_name          TEXT NOT NULL,
  founder_email         TEXT NOT NULL,
  studio_thesis         TEXT NOT NULL,
  studio_brand_voice    TEXT,
  current_portfolio     JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_runway_months  INTEGER,
  okrs_current_quarter  JSONB DEFAULT '[]'::jsonb,
  north_star_metric     TEXT,
  competitors_by_product JSONB DEFAULT '{}'::jsonb,
  spec_version_sha      TEXT,
  spec_updated_at       TIMESTAMPTZ,
  founder_energy_score  NUMERIC(3, 2) DEFAULT 0.80,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT livv_studio_singleton CHECK (id = 'livv')
);

ALTER TABLE livv_studio_identity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS livv_studio_identity_admin ON livv_studio_identity;
CREATE POLICY livv_studio_identity_admin ON livv_studio_identity
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

INSERT INTO livv_studio_identity (
  id, founder_name, founder_email, studio_thesis, studio_brand_voice,
  current_portfolio, target_runway_months, okrs_current_quarter,
  north_star_metric, competitors_by_product
) VALUES (
  'livv',
  'Eneas',
  'eneasaldabe@gmail.com',
  'AI-first vertical software para PYMES mal servidas',
  'Directo, calmo, técnicamente preciso. Sin floripondio. Diseño visible.',
  '[{"id":"payper","name":"Payper","stage":"pre-launch","market":"gastronomía (cafés, bares, restos)","status":"designs cerrados, app en build, ecosistema de agentes en configuración"}]'::jsonb,
  18,
  '[]'::jsonb,
  NULL,
  '{"payper":["Fudo","Bistrosoft","Toast","Square"]}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- livv_studio_decisions — decision log per spec §5.3 skill 5
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS livv_studio_decisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context      TEXT NOT NULL,
  alternatives JSONB DEFAULT '[]'::jsonb,
  criteria     JSONB DEFAULT '[]'::jsonb,
  decision     TEXT NOT NULL,
  agent_slug   TEXT,
  product_id   TEXT,
  outcome      TEXT,
  outcome_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS livv_studio_decisions_created_idx ON livv_studio_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS livv_studio_decisions_product_idx ON livv_studio_decisions(product_id) WHERE product_id IS NOT NULL;

ALTER TABLE livv_studio_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS livv_studio_decisions_admin ON livv_studio_decisions;
CREATE POLICY livv_studio_decisions_admin ON livv_studio_decisions
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- livv_studio_lessons — episodic memory per spec §7 capa 4 (el moat real)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS livv_studio_lessons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context       TEXT NOT NULL,
  action        TEXT NOT NULL,
  result        TEXT,
  lesson        TEXT NOT NULL,
  applicable_if TEXT,
  product_id    TEXT,
  source_agent  TEXT,
  tags          TEXT[] DEFAULT '{}',
  upvoted_by_founder BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS livv_studio_lessons_tags_idx ON livv_studio_lessons USING GIN(tags);
CREATE INDEX IF NOT EXISTS livv_studio_lessons_product_idx ON livv_studio_lessons(product_id) WHERE product_id IS NOT NULL;

ALTER TABLE livv_studio_lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS livv_studio_lessons_admin ON livv_studio_lessons;
CREATE POLICY livv_studio_lessons_admin ON livv_studio_lessons
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- livv_studio_approvals — approval queue per spec §5.3 skill 6
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS livv_studio_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by    TEXT NOT NULL,
  category        TEXT NOT NULL,
  description     TEXT NOT NULL,
  amount_usd      NUMERIC(10, 2),
  context         JSONB DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS livv_studio_approvals_pending_idx ON livv_studio_approvals(created_at DESC) WHERE status = 'pending';

ALTER TABLE livv_studio_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS livv_studio_approvals_admin ON livv_studio_approvals;
CREATE POLICY livv_studio_approvals_admin ON livv_studio_approvals
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

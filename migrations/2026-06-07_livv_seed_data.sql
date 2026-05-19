-- LIVV-specific seed data — only fires for the Livv Studio tenant.
-- ──────────────────────────────────────────────────────────────────
-- Sprint 4 of the LIVV OS spec. Pre-loads the workspace with the
-- 3 ICPs / 5 channels / 4 growth phases / 4 team roles / 8 KPIs +
-- a Brand Kit + Positioning Principles, all values pulled verbatim
-- from the LIVV OS Claude Code Implementation Prompt.
--
-- Tenant scope: hard-coded to '309be231-99cb-4d6f-8e25-2b57ee5e5646'
-- (Livv Studio). Other tenants are not touched.
--
-- Idempotent: every INSERT uses WHERE NOT EXISTS scoped to
-- (tenant_id + a stable natural key like name / phase_number /
-- metric_name) so re-running the migration is a no-op.
--
-- If the tenant id doesn't exist yet (fresh DB, no Livv Studio),
-- this migration is also a no-op — the WHERE clauses self-skip.

DO $$
DECLARE
  livv_tenant UUID := '309be231-99cb-4d6f-8e25-2b57ee5e5646';
BEGIN
  -- Exit early if the tenant doesn't exist. Lets this migration ship
  -- to any environment safely.
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = livv_tenant) THEN
    RAISE NOTICE 'LIVV tenant % not found — seed skipped.', livv_tenant;
    RETURN;
  END IF;

  -- ── 1) Strategy ICPs ─────────────────────────────────────────────
  INSERT INTO public.strategy_icps (tenant_id, name, description, pain_points, entry_module, expansion_path, market_geo, ticket_implementation, ticket_retainer_monthly, status)
  SELECT livv_tenant, 'Gastronomía & Nightlife',
    'Bares, restoranes, clubs y delivery operations en LATAM. Pagan por velocidad de implementación, no por consultoría — necesitan algo que rinda esta semana.',
    ARRAY['Cobros desincronizados con la cocina', 'Staff turnover alto', 'No miden CAC ni LTV', 'Marketing tribal sin atribución']::TEXT[],
    'Payper',
    ARRAY['Calls', 'Projects', 'Finance']::TEXT[],
    ARRAY['AR', 'UY', 'CL', 'MX']::TEXT[],
    2000, 450, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.strategy_icps WHERE tenant_id = livv_tenant AND name = 'Gastronomía & Nightlife');

  INSERT INTO public.strategy_icps (tenant_id, name, description, pain_points, entry_module, expansion_path, market_geo, ticket_implementation, ticket_retainer_monthly, status)
  SELECT livv_tenant, 'Agencias & Estudios Creativos',
    'Agencias de marketing / design / web de 3-15 personas. Necesitan operación interna sólida (calls, projects, finance) más que herramientas para clientes.',
    ARRAY['Time tracking caótico', 'Margen por proyecto desconocido', 'Reuniones que no avanzan', 'Onboarding de freelancers lento']::TEXT[],
    'Calls+Projects+Finance',
    ARRAY['Sales Pipeline', 'Content Engine', 'Team Scaling']::TEXT[],
    ARRAY['AR', 'UY', 'BR', 'MX', 'CO', 'US-LATAM']::TEXT[],
    4000, 750, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.strategy_icps WHERE tenant_id = livv_tenant AND name = 'Agencias & Estudios Creativos');

  INSERT INTO public.strategy_icps (tenant_id, name, description, pain_points, entry_module, expansion_path, market_geo, ticket_implementation, ticket_retainer_monthly, status)
  SELECT livv_tenant, 'PyMEs en Crecimiento',
    'Empresas con 10-50 personas, revenue $200k-$2M, dueño-operador. Necesitan profesionalizar operación sin contratar ops manager.',
    ARRAY['Founder operating bottleneck', 'Procesos en cabeza del dueño', 'KPIs sin tracking sistemático', 'Pipeline comercial reactivo']::TEXT[],
    'diagnóstico completo',
    ARRAY['Strategy Hub', 'Growth Dashboard', 'Team Scaling']::TEXT[],
    ARRAY['AR', 'UY', 'CL', 'PY']::TEXT[],
    4000, 600, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.strategy_icps WHERE tenant_id = livv_tenant AND name = 'PyMEs en Crecimiento');

  -- ── 2) Content Channels ─────────────────────────────────────────
  INSERT INTO public.content_channels (tenant_id, name, platform, priority, target_audience, tone, format_types, frequency_posts_per_week, status)
  SELECT livv_tenant, 'LinkedIn', 'linkedin', 'principal',
    'Founders agencias + heads of marketing en LATAM',
    'Direct + técnico + opinion-led',
    ARRAY['post', 'thread', 'carousel']::TEXT[],
    5, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.content_channels WHERE tenant_id = livv_tenant AND platform = 'linkedin' AND name = 'LinkedIn');

  INSERT INTO public.content_channels (tenant_id, name, platform, priority, target_audience, tone, format_types, frequency_posts_per_week, status)
  SELECT livv_tenant, 'Instagram', 'instagram', 'secondary',
    'Visual storytelling — case studies y behind-the-build',
    'Aspiracional pero concreto, no genérico',
    ARRAY['reel', 'carousel', 'story']::TEXT[],
    4, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.content_channels WHERE tenant_id = livv_tenant AND platform = 'instagram' AND name = 'Instagram');

  INSERT INTO public.content_channels (tenant_id, name, platform, priority, target_audience, tone, format_types, frequency_posts_per_week, status)
  SELECT livv_tenant, 'YouTube', 'youtube', 'long-term',
    'Long-form para discoverability + autoridad',
    'Demostrativo, build-in-public, sin fluff',
    ARRAY['video', 'short']::TEXT[],
    2, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.content_channels WHERE tenant_id = livv_tenant AND platform = 'youtube' AND name = 'YouTube');

  INSERT INTO public.content_channels (tenant_id, name, platform, priority, target_audience, tone, format_types, frequency_posts_per_week, status)
  SELECT livv_tenant, 'Outbound Directo', 'email', 'principal',
    'ICPs identificados — outreach 1-to-1 con Loom + contexto',
    'Personal + concreto, observación verificable, no pitch',
    ARRAY['email', 'loom', 'dm']::TEXT[],
    15, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.content_channels WHERE tenant_id = livv_tenant AND platform = 'email' AND name = 'Outbound Directo');

  INSERT INTO public.content_channels (tenant_id, name, platform, priority, target_audience, tone, format_types, frequency_posts_per_week, status)
  SELECT livv_tenant, 'Contra & Marketplaces', 'marketplace', 'passive',
    'Pipeline pasivo — discoverability en Contra, Toptal, Working Not Working',
    'Portfolio polish — pocas palabras, foto del trabajo',
    ARRAY['profile-update', 'project-card']::TEXT[],
    1, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.content_channels WHERE tenant_id = livv_tenant AND platform = 'marketplace' AND name = 'Contra & Marketplaces');

  -- ── 3) Growth Phases ────────────────────────────────────────────
  INSERT INTO public.growth_phases (tenant_id, phase_number, title, timeline, status, milestones)
  SELECT livv_tenant, 1, 'Foundation', 'Mes 1-2', 'active',
    '[
      {"title": "Definir roles + responsibilities del equipo actual", "completed": false},
      {"title": "Documentar flows internos (intake, delivery, billing)", "completed": false},
      {"title": "Catálogo de módulos (qué vendemos y a quién)", "completed": false},
      {"title": "Playbook de deployment para cada módulo", "completed": false},
      {"title": "Pricing tiers + framework para custom quotes", "completed": false}
    ]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_phases WHERE tenant_id = livv_tenant AND phase_number = 1);

  INSERT INTO public.growth_phases (tenant_id, phase_number, title, timeline, status, milestones)
  SELECT livv_tenant, 2, 'First Clients', 'Mes 2-4', 'upcoming',
    '[
      {"title": "Cerrar 2-3 clientes piloto pagos", "completed": false},
      {"title": "Iterar el proceso de delivery con feedback real", "completed": false},
      {"title": "Documentar 2 casos de estudio publicables", "completed": false},
      {"title": "Content engine corriendo (5 posts/semana)", "completed": false},
      {"title": "Luis owns delivery — Eneas en estrategia", "completed": false}
    ]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_phases WHERE tenant_id = livv_tenant AND phase_number = 2);

  INSERT INTO public.growth_phases (tenant_id, phase_number, title, timeline, status, milestones)
  SELECT livv_tenant, 3, 'Scale', 'Mes 4-8', 'upcoming',
    '[
      {"title": "Outbound activo (15 outreach/semana sostenido)", "completed": false},
      {"title": "Abrir segunda vertical (Gastronomía o PyMEs)", "completed": false},
      {"title": "Content flywheel funcionando — leads inbound consistentes", "completed": false},
      {"title": "Optimizar prompts AI y reducir costo por output", "completed": false}
    ]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_phases WHERE tenant_id = livv_tenant AND phase_number = 3);

  INSERT INTO public.growth_phases (tenant_id, phase_number, title, timeline, status, milestones)
  SELECT livv_tenant, 4, 'Product-Led', 'Mes 8-12', 'upcoming',
    '[
      {"title": "Eneas dedica 80% del tiempo a producto", "completed": false},
      {"title": "Client Success hire onboarded", "completed": false},
      {"title": "Evaluar pivot SaaS vs continuar agency hybrid", "completed": false}
    ]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_phases WHERE tenant_id = livv_tenant AND phase_number = 4);

  -- ── 4) Team Roles (planned hires) ───────────────────────────────
  INSERT INTO public.team_role_definitions (tenant_id, title, department, type, hire_phase, hire_priority, rationale, tasks, skills_required, kpis, estimated_cost_monthly, status)
  SELECT livv_tenant, 'Content Creator', 'Marketing', 'contractor', 'mes 2-3', 1,
    'Sin output consistente, no hay pipeline inbound. Es la primer palanca de crecimiento.',
    ARRAY['Escribir + producir 5 piezas/semana', 'Editar reels + carouseles', 'Mantener calendario editorial', 'Repurposing cross-channel']::TEXT[],
    ARRAY['Copy técnico + atractivo', 'Edición video básica', 'Diseño en Figma', 'Time management']::TEXT[],
    '[
      {"name": "Posts publicados / semana", "target": 5},
      {"name": "Engagement rate promedio", "target": 3.5},
      {"name": "Leads inbound atribuidos / mes", "target": 4}
    ]'::jsonb,
    800, 'planned'
  WHERE NOT EXISTS (SELECT 1 FROM public.team_role_definitions WHERE tenant_id = livv_tenant AND title = 'Content Creator');

  INSERT INTO public.team_role_definitions (tenant_id, title, department, type, hire_phase, hire_priority, rationale, tasks, skills_required, kpis, estimated_cost_monthly, status)
  SELECT livv_tenant, 'Implementador Jr', 'Delivery', 'contractor', 'mes 3-4', 2,
    'Necesario para que Luis no sea cuello de botella. Tasks que no requieren judgment senior pero sí ejecución impecable.',
    ARRAY['Setup de Supabase + RLS por cliente', 'Configurar módulos + customizaciones de diseño', 'QA pre-launch', 'Documentar deltas vs playbook']::TEXT[],
    ARRAY['Supabase + Postgres básico', 'React + Tailwind (lectura mínima)', 'Attention to detail', 'Comunicación async']::TEXT[],
    '[
      {"name": "Proyectos deployados / mes", "target": 3},
      {"name": "Bugs post-launch / proyecto", "target": 1},
      {"name": "Tiempo promedio deploy", "target": 18}
    ]'::jsonb,
    1200, 'planned'
  WHERE NOT EXISTS (SELECT 1 FROM public.team_role_definitions WHERE tenant_id = livv_tenant AND title = 'Implementador Jr');

  INSERT INTO public.team_role_definitions (tenant_id, title, department, type, hire_phase, hire_priority, rationale, tasks, skills_required, kpis, estimated_cost_monthly, status)
  SELECT livv_tenant, 'Sales Outbound', 'Sales', 'contractor', 'mes 4-6', 3,
    'Outbound a comisión — Eneas no debería estar prospectando una vez tengamos delivery sólido.',
    ARRAY['Identificar 60 prospects/mes que matchean ICPs', 'Loguear outreach + responses', 'Calificar leads antes de pasarlos a Eneas', 'Mantener pipeline limpio']::TEXT[],
    ARRAY['Lead research + LinkedIn Sales Nav', 'Copywriting outbound', 'CRM hygiene', 'Resiliencia a rechazo']::TEXT[],
    '[
      {"name": "Outreach enviado / semana", "target": 15},
      {"name": "Reply rate", "target": 18},
      {"name": "Meetings agendadas / mes", "target": 6},
      {"name": "Conversiones cerradas / mes", "target": 1}
    ]'::jsonb,
    0, 'planned'
  WHERE NOT EXISTS (SELECT 1 FROM public.team_role_definitions WHERE tenant_id = livv_tenant AND title = 'Sales Outbound');

  INSERT INTO public.team_role_definitions (tenant_id, title, department, type, hire_phase, hire_priority, rationale, tasks, skills_required, kpis, estimated_cost_monthly, status)
  SELECT livv_tenant, 'Client Success', 'Delivery', 'part-time', 'mes 6-8', 4,
    'Una vez 8+ clientes activos, churn empieza a doler. Need someone dedicado a expansion + retention.',
    ARRAY['Onboarding semana 1 de cada cliente nuevo', 'Check-ins mensuales con cada retainer', 'Identificar expansion opportunities', 'Coordinar requests de cambio con delivery']::TEXT[],
    ARRAY['Empatía + comunicación', 'Operativa básica de Livv OS', 'Comercial sin ser vendedor', 'Análisis de uso']::TEXT[],
    '[
      {"name": "NPS promedio", "target": 70},
      {"name": "Expansion revenue / mes", "target": 1500},
      {"name": "Churn mensual", "target": 5}
    ]'::jsonb,
    1000, 'planned'
  WHERE NOT EXISTS (SELECT 1 FROM public.team_role_definitions WHERE tenant_id = livv_tenant AND title = 'Client Success');

  -- ── 5) Growth KPIs (north-star metrics) ─────────────────────────
  INSERT INTO public.growth_kpis (tenant_id, metric_name, target_value, target_unit, category)
  SELECT livv_tenant, 'Clientes con retainer', 10, 'clients', 'revenue'
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_kpis WHERE tenant_id = livv_tenant AND metric_name = 'Clientes con retainer');

  INSERT INTO public.growth_kpis (tenant_id, metric_name, target_value, target_unit, category)
  SELECT livv_tenant, 'MRR retainers', 6000, 'USD', 'revenue'
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_kpis WHERE tenant_id = livv_tenant AND metric_name = 'MRR retainers');

  INSERT INTO public.growth_kpis (tenant_id, metric_name, target_value, target_unit, category)
  SELECT livv_tenant, 'Tiempo deploy', 21, 'days', 'operations'
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_kpis WHERE tenant_id = livv_tenant AND metric_name = 'Tiempo deploy');

  INSERT INTO public.growth_kpis (tenant_id, metric_name, target_value, target_unit, category)
  SELECT livv_tenant, '% revenue recurrente', 40, '%', 'revenue'
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_kpis WHERE tenant_id = livv_tenant AND metric_name = '% revenue recurrente');

  INSERT INTO public.growth_kpis (tenant_id, metric_name, target_value, target_unit, category)
  SELECT livv_tenant, 'Contenido / semana', 5, 'posts', 'content'
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_kpis WHERE tenant_id = livv_tenant AND metric_name = 'Contenido / semana');

  INSERT INTO public.growth_kpis (tenant_id, metric_name, target_value, target_unit, category)
  SELECT livv_tenant, 'Outreach / semana', 15, 'messages', 'sales'
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_kpis WHERE tenant_id = livv_tenant AND metric_name = 'Outreach / semana');

  INSERT INTO public.growth_kpis (tenant_id, metric_name, target_value, target_unit, category)
  SELECT livv_tenant, 'Agency sin Eneas', 90, '%', 'operations'
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_kpis WHERE tenant_id = livv_tenant AND metric_name = 'Agency sin Eneas');

  INSERT INTO public.growth_kpis (tenant_id, metric_name, target_value, target_unit, category)
  SELECT livv_tenant, 'Churn mensual', 5, '%', 'revenue'
  WHERE NOT EXISTS (SELECT 1 FROM public.growth_kpis WHERE tenant_id = livv_tenant AND metric_name = 'Churn mensual');

  -- ── 6) Positioning Principles ───────────────────────────────────
  INSERT INTO public.strategy_positioning (tenant_id, principle, description, examples, applies_to)
  SELECT livv_tenant, 'Mostrá no expliques',
    'Demostraciones > pitches. Si podés grabar un video de 60s mostrando el output, eso pesa más que cualquier deck.',
    ARRAY['Loom personalizado en outbound', 'Reels behind-the-build', 'Case studies con before/after literal', 'Live walkthroughs antes de quote']::TEXT[],
    ARRAY['outreach', 'content', 'sales']::TEXT[]
  WHERE NOT EXISTS (SELECT 1 FROM public.strategy_positioning WHERE tenant_id = livv_tenant AND principle = 'Mostrá no expliques');

  INSERT INTO public.strategy_positioning (tenant_id, principle, description, examples, applies_to)
  SELECT livv_tenant, 'El cliente como protagonista',
    'El cliente es Frodo, nosotros Gandalf. Su éxito es la historia, no nuestras herramientas.',
    ARRAY['Case studies en voz del cliente', 'Quotes literales > paráfrasis', 'Métricas del cliente > nuestras', 'Su logo más grande que el nuestro en deliverables']::TEXT[],
    ARRAY['content', 'sales', 'website']::TEXT[]
  WHERE NOT EXISTS (SELECT 1 FROM public.strategy_positioning WHERE tenant_id = livv_tenant AND principle = 'El cliente como protagonista');

  INSERT INTO public.strategy_positioning (tenant_id, principle, description, examples, applies_to)
  SELECT livv_tenant, 'Opinión fuerte, ejecución visible',
    'Tener punto de vista que algunos clientes no compartirán está bien. Tibieza = invisibilidad.',
    ARRAY['Posts contra prácticas que vemos mal', 'Decir "no" a proyectos fuera del playbook', 'Pricing público — no "consultanos"', 'Renunciar a clientes que no son ICP']::TEXT[],
    ARRAY['content', 'sales', 'team']::TEXT[]
  WHERE NOT EXISTS (SELECT 1 FROM public.strategy_positioning WHERE tenant_id = livv_tenant AND principle = 'Opinión fuerte, ejecución visible');

  INSERT INTO public.strategy_positioning (tenant_id, principle, description, examples, applies_to)
  SELECT livv_tenant, 'Build in public',
    'Lo que decidimos, lo que medimos, lo que cambiamos, lo que perdimos — todo público. Construye confianza + atrae talent + tier-1 clients.',
    ARRAY['Weekly snapshot público (subset)', 'Posts sobre decisions difíciles', 'Métricas internas semi-públicas', 'Failed experiments documentados']::TEXT[],
    ARRAY['content', 'recruiting']::TEXT[]
  WHERE NOT EXISTS (SELECT 1 FROM public.strategy_positioning WHERE tenant_id = livv_tenant AND principle = 'Build in public');

  -- ── 7) Brand Kit — LIVV ─────────────────────────────────────────
  -- Only seeds when the `brands` table exists (migration 2026-06-04
  -- must be applied first). Wrapped in a sub-block so a missing
  -- table doesn't kill the whole seed.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='brands') THEN
    INSERT INTO public.brands (
      tenant_id, name, tagline, industry, description,
      color_primary, color_secondary, color_accent, color_background, color_text,
      font_heading, font_body,
      photo_style_tags,
      tone_formal_casual, tone_technical_accessible, tone_serious_playful, tone_direct_storytelling,
      words_include, words_exclude, voice_examples, personality,
      audience_description, hashtags, ctas, content_rules, status
    )
    SELECT
      livv_tenant, 'LIVV', 'Donde el arte se cruza con el negocio.', 'Operating system for creative studios',
      'LIVV es un sistema operativo para estudios creativos y agencies. Cubre calls + projects + finance + sales + content + growth en un solo lugar, deploy en 21 días, $4k impl + $750/mo.',
      '#f59e0b',   -- amber accent
      '#5c1d18',   -- wine secondary
      '#c4a35a',   -- gold accent
      '#0a0a0a',   -- near-black bg (dark mode default)
      '#e8e8e8',   -- light text
      'SF Pro Display, Inter',
      'Inter, SF Pro Text',
      ARRAY['editorial', 'sharp', 'low-light', 'product-in-context', 'no-stock', 'b-roll-style']::TEXT[],
      70,  -- formal/casual — leans casual
      35,  -- technical/accessible — leans technical
      20,  -- serious/playful — strongly serious
      85,  -- direct/storytelling — strongly direct
      ARRAY['preciso', 'cinética', 'anclado', 'output', 'sin fricción', 'palanca', 'flywheel', 'criterio']::TEXT[],
      ARRAY['revolucionario', 'sinergia', 'game-changer', 'cutting-edge', 'disrupt', 'unlock', 'transformar (cuando es genérico)']::TEXT[],
      ARRAY[
        'Cobrar bien es el primer acto de respeto por tu trabajo.',
        'Procesos boring, productos sexy. Aburrite con la operación.',
        'Velocidad mata perfección — pero solo si después iterás.',
        'Lo que no se mide no se cobra.',
        'Foco sobre frenesí. Una cosa bien hecha vale 10 a medias.'
      ]::TEXT[],
      'Un estudio de ingeniería creativa que muestra resultados, no promesas. Habla en directo, sin filler. Tiene opinión, no consenso.',
      'Founders + heads of marketing en estudios creativos y PyMEs LATAM. Edad 28-45, design-aware, valoran sistema sobre herramienta.',
      '{"linkedin": ["#agencylife", "#operations", "#latam", "#buildinpublic"], "instagram": ["#buildinpublic", "#studiolife", "#systems"], "twitter": ["#buildinpublic"]}'::jsonb,
      ARRAY['Reservá una llamada de 30 min', 'Ver demo en 60 seg', 'Cotización en 24 hs', 'Hablemos']::TEXT[],
      '{"do": ["Abrir con observación concreta", "Usar números reales del cliente", "Cerrar con CTA clara"], "dont": ["Em dashes en client copy (en headers numéricos sí)", "Empezar con pregunta retórica", "Adjetivos genéricos sin sustento"], "formats": ["Posts ≤200 palabras", "Threads max 6 tweets", "Reels ≤45s"]}'::jsonb,
      'active'
    WHERE NOT EXISTS (SELECT 1 FROM public.brands WHERE tenant_id = livv_tenant AND name = 'LIVV');
  END IF;

  RAISE NOTICE 'LIVV seed data applied. Re-runs are no-ops thanks to WHERE NOT EXISTS guards.';
END$$;

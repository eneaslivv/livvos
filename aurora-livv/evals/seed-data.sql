-- ============================================================
-- aurora-livv · evals/seed-data.sql
-- Realistic seed for a single test tenant so evals are deterministic.
-- Idempotent: re-running upserts.
-- ============================================================

DO $$
DECLARE
  v_tenant_id UUID := '11111111-1111-1111-1111-111111111111';
  v_user_id   UUID := '22222222-2222-2222-2222-222222222222';
BEGIN

-- 1. tenant + config
INSERT INTO tenants (id, name)
VALUES (v_tenant_id, 'Aurora Test Studio')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_config (tenant_id, default_currency_code, agent_mode, stage_probabilities, north_star_metric)
VALUES (
  v_tenant_id,
  'USD',
  'multi',
  '{"new":0.05,"contacted":0.10,"qualified":0.25,"proposal":0.50,"negotiation":0.75,"won":1.00,"lost":0.00}'::jsonb,
  'won_deals_per_quarter'
)
ON CONFLICT (tenant_id) DO UPDATE SET
  default_currency_code = EXCLUDED.default_currency_code,
  agent_mode = EXCLUDED.agent_mode;

-- 2. seed projects (5 with varied health states)
INSERT INTO projects (id, title, description, progress, status, client, color, updated_at) VALUES
('a1111111-1111-1111-1111-111111111111', 'Fintech Dashboard',       'Banking redesign',    75, 'Active', 'Bank Corp',   '#3b82f6', now() - interval '5 days'),
('a2222222-2222-2222-2222-222222222222', 'E-commerce Platform',     'Shopify rebuild',     45, 'Active', 'Tech Store',  '#10b981', now() - interval '12 days'),
('a3333333-3333-3333-3333-333333333333', 'SaaS Branding',           'Logo + voice',        90, 'Active', 'Startup.io',  '#E11D74', now() - interval '2 days'),
('a4444444-4444-4444-4444-444444444444', 'Editorial Site',          'Magazine site',       30, 'Active', 'Boutique Co', '#F59E0B', now() - interval '20 days'),
('a5555555-5555-5555-5555-555555555555', 'Consulting Retainer',     'Q4 ops advisory',     50, 'Active', 'GrowthLab',   '#8B5CF6', now() - interval '8 days')
ON CONFLICT (id) DO NOTHING;

-- 3. seed finances per project (one in profit, one in break-even, one in loss, two mixed)
INSERT INTO finances (project_id, tenant_id, total_agreed, total_collected, direct_expenses, imputed_expenses, hours_worked, business_model, hourly_rate, created_by)
VALUES
('a1111111-1111-1111-1111-111111111111', v_tenant_id, 24000, 12000, 1200, 13800, 110, 'fixed',    NULL,  v_user_id), -- loss: -3000
('a2222222-2222-2222-2222-222222222222', v_tenant_id, 18000, 18000, 2200, 12000, 95,  'fixed',    NULL,  v_user_id), -- profit: 3800
('a3333333-3333-3333-3333-333333333333', v_tenant_id, 8000,  6000,  100,  3500,  40,  'fixed',    NULL,  v_user_id), -- profit
('a4444444-4444-4444-4444-444444444444', v_tenant_id, 12000, 0,     0,    1000,  10,  'fixed',    NULL,  v_user_id), -- not yet billed
('a5555555-5555-5555-5555-555555555555', v_tenant_id, 10000, 8000,  500,  6500,  80,  'retainer', NULL,  v_user_id)  -- profit small
ON CONFLICT DO NOTHING;

-- 4. seed leads in varied stages with history
DELETE FROM leads WHERE tenant_id = v_tenant_id;

INSERT INTO leads (id, tenant_id, name, email, company, message, origin, utm, status, ai_analysis, history, created_at, last_interaction) VALUES
-- hot, stale (urgent for Solara)
('b1111111-1111-1111-1111-111111111111', v_tenant_id, 'Martín Gomez', 'martin.g@startup.io', 'Startup.io', 'Hi, looking for SaaS rebranding.', 'Web Form',
 '{"source":"google","medium":"cpc","campaign":"q4-brand"}'::jsonb,
 'qualified',
 '{"category":"branding","temperature":"hot","summary":"High intent SaaS launch imminent.","recommendation":"Send SaaS Branding Kit PDF.","score":0.87,"decision_maker_confirmed":true,"budget_signal":"range","timeline_signal":"urgent","scope_clarity":"partial","estimated_value":12000}'::jsonb,
 '[{"from":"new","to":"contacted","at":"2026-05-10T10:00:00Z","by":"system"},{"from":"contacted","to":"qualified","at":"2026-05-12T14:30:00Z","by":"system"}]'::jsonb,
 now() - interval '10 days', now() - interval '4 days'),

-- warm, fresh
('b2222222-2222-2222-2222-222222222222', v_tenant_id, 'Sarah Lee', 'sarah@boutique.co', 'Boutique Co', 'Shopify dev needed.', 'Instagram',
 '{"source":"instagram","medium":"organic"}'::jsonb,
 'proposal',
 '{"category":"ecommerce","temperature":"warm","summary":"Specific need for Shopify Dev.","recommendation":"Share E-com portfolio.","score":0.64,"decision_maker_confirmed":true,"budget_signal":"confirmed","timeline_signal":"defined","scope_clarity":"clear","estimated_value":7500}'::jsonb,
 '[{"from":"new","to":"contacted","at":"2026-05-13T09:00:00Z","by":"system"},{"from":"contacted","to":"qualified","at":"2026-05-15T11:00:00Z","by":"system"},{"from":"qualified","to":"proposal","at":"2026-05-18T16:00:00Z","by":"system"}]'::jsonb,
 now() - interval '7 days', now() - interval '1 day'),

-- cold, very stale
('b3333333-3333-3333-3333-333333333333', v_tenant_id, 'Carlos Rivera', 'carlos@oldco.com', 'Old Co', 'Maybe later', 'Referral',
 NULL,
 'contacted',
 '{"category":"consulting","temperature":"cold","summary":"Low urgency.","recommendation":"Nurture quarterly.","score":0.22,"estimated_value":4000}'::jsonb,
 '[{"from":"new","to":"contacted","at":"2026-03-01T12:00:00Z","by":"system"}]'::jsonb,
 now() - interval '80 days', now() - interval '30 days'),

-- new
('b4444444-4444-4444-4444-444444444444', v_tenant_id, 'Ana Pérez', 'ana@newco.io', 'NewCo', 'Got your name from a friend', 'Referral',
 NULL,
 'new',
 '{"category":"branding","temperature":"warm","summary":"Inbound referral.","score":0.45}'::jsonb,
 '[]'::jsonb,
 now() - interval '1 day', now() - interval '1 day'),

-- negotiation
('b5555555-5555-5555-5555-555555555555', v_tenant_id, 'Diego López', 'diego@mediumco.com', 'Medium Co', 'Reviewing the offer', 'LinkedIn',
 '{"source":"linkedin","medium":"organic"}'::jsonb,
 'negotiation',
 '{"category":"consulting","temperature":"hot","score":0.78,"estimated_value":15000,"decision_maker_confirmed":true,"budget_signal":"confirmed","timeline_signal":"defined","scope_clarity":"clear"}'::jsonb,
 '[{"from":"new","to":"contacted","at":"2026-04-20T12:00:00Z","by":"system"},{"from":"contacted","to":"qualified","at":"2026-04-25T12:00:00Z","by":"system"},{"from":"qualified","to":"proposal","at":"2026-05-02T12:00:00Z","by":"system"},{"from":"proposal","to":"negotiation","at":"2026-05-15T12:00:00Z","by":"system"}]'::jsonb,
 now() - interval '30 days', now() - interval '2 days'),

-- won
('b6666666-6666-6666-6666-666666666666', v_tenant_id, 'Lucía Méndez', 'lucia@happyco.com', 'Happy Co', 'Done!', 'Web Form',
 '{"source":"google","medium":"organic"}'::jsonb,
 'won',
 '{"category":"branding","temperature":"hot","score":0.95,"estimated_value":8000}'::jsonb,
 '[{"from":"new","to":"contacted","at":"2026-04-01T12:00:00Z","by":"system"},{"from":"contacted","to":"qualified","at":"2026-04-05T12:00:00Z","by":"system"},{"from":"qualified","to":"proposal","at":"2026-04-12T12:00:00Z","by":"system"},{"from":"proposal","to":"won","at":"2026-04-25T12:00:00Z","by":"system"}]'::jsonb,
 now() - interval '50 days', now() - interval '25 days'),

-- lost
('b7777777-7777-7777-7777-777777777777', v_tenant_id, 'Mario Acosta', 'mario@nope.com', 'Nope Co', 'Went with competitor', 'Web Form',
 NULL,
 'lost',
 '{"category":"branding","temperature":"cold","score":0.30}'::jsonb,
 '[{"from":"new","to":"contacted","at":"2026-04-10T12:00:00Z","by":"system"},{"from":"contacted","to":"qualified","at":"2026-04-15T12:00:00Z","by":"system"},{"from":"qualified","to":"lost","at":"2026-04-22T12:00:00Z","by":"system","reason":"price"}]'::jsonb,
 now() - interval '40 days', now() - interval '28 days');

-- 5. web_analytics
DELETE FROM web_analytics WHERE updated_at < now() - interval '60 days';
INSERT INTO web_analytics (total_visits, unique_visitors, bounce_rate, conversions, top_pages, daily_visits, updated_at) VALUES
(3245, 2110, 38.4, 47,
 '[{"path":"/","views":1240},{"path":"/portfolio","views":580},{"path":"/about","views":320},{"path":"/pricing","views":210}]'::jsonb,
 '[{"date":"2026-04-21","value":110},{"date":"2026-04-22","value":135},{"date":"2026-04-23","value":98},{"date":"2026-04-24","value":142}]'::jsonb,
 now())
ON CONFLICT DO NOTHING;

END $$;

-- 6. Verify
SELECT
  (SELECT COUNT(*) FROM tenants  WHERE id='11111111-1111-1111-1111-111111111111') AS tenant_n,
  (SELECT COUNT(*) FROM leads    WHERE tenant_id='11111111-1111-1111-1111-111111111111') AS leads_n,
  (SELECT COUNT(*) FROM projects)  AS projects_n,
  (SELECT COUNT(*) FROM finances WHERE tenant_id='11111111-1111-1111-1111-111111111111') AS finances_n;

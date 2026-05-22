-- =============================================================================
-- PR6 — Seed 5 skills del Slack agentic mode en `skills` table.
--
-- Aplicada en producción 2026-05-22 via MCP apply_migration:
-- migration name = slack_pr6_seed_skills_v4
--
-- Las skills documentan QUÉ hace el sistema (no son funciones Postgres). Sirven
-- como catálogo + observability + onboarding. El dashboard de Master mode
-- las lista junto con métricas de ejecución.
--
-- Schema notes:
--   • category constraint: 'database'|'security'|'domain'|'system'|'development'
--   • priority constraint: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW' (UPPERCASE)
-- =============================================================================

BEGIN;

INSERT INTO public.skills (
  name, description, category, priority, expected_duration,
  file_path, required_agents, required_permissions, dependencies,
  objectives, prerequisites,
  validation_criteria, error_handling, success_metrics, agent_interfaces, expected_outputs,
  is_active, version
) VALUES
('classify-slack-message','Clasifica un mensaje inbound de Slack (intent, priority, summary) y lo matchea contra clients/projects.','domain','HIGH','~7s','supabase/functions/comm-classify/index.ts',
  ARRAY['slack-agent','inbox-agent']::text[], ARRAY['communication_messages.update','clients.read','projects.read']::text[],
  ARRAY['comm-classify edge fn deployed','OPENAI_API_KEY set']::text[],
  ARRAY['Asignar intent','Matchear client por email/domain/name','Matchear project por title mention','Sugerir task si has_request','Confidence score heurístico']::text[],
  ARRAY['slack_monitored_channels.inbound_mode IN classify_and_propose|classify_and_auto_create']::text[],
  '{"min_confidence":0.5}'::jsonb, '{"on_openai_429":"retry exponential"}'::jsonb,
  '{"target_accuracy":0.85,"target_latency_p50_ms":7000}'::jsonb,
  '{"slack-agent":"reads classification"}'::jsonb,
  '{"shape":{"intent":"text","summary":"text","confidence":"number"}}'::jsonb, true, 1),
('extract-task-from-message','Cuando classify detecta has_request=true, propone una task con title/description/due_date/priority/project_id/client_id.','domain','HIGH','~1s','supabase/functions/comm-classify/index.ts',
  ARRAY['slack-agent']::text[], ARRAY['tasks.insert']::text[], ARRAY['classify-slack-message']::text[],
  ARRAY['Title imperativo corto','Description con contexto','due_date inferred (nunca inventado)','priority Low|Medium|High']::text[],
  ARRAY['classify-slack-message ran']::text[],
  '{"min_confidence_for_auto":0.85}'::jsonb, '{"on_invalid_due_date":"null"}'::jsonb,
  '{"target_relevance":0.9}'::jsonb, '{}'::jsonb,
  '{"shape":{"title":"text","description":"text","due_date":"date|null","priority":"Low|Medium|High"}}'::jsonb, true, 1),
('match-client-from-context','Resuelve el client_id correcto leyendo from_email, domain, body mentions y thread context.','domain','MEDIUM','<1s','supabase/functions/comm-classify/index.ts',
  ARRAY['slack-agent','inbox-agent']::text[], ARRAY['clients.read']::text[],
  ARRAY['communication_messages.from_email populated']::text[],
  ARRAY['Match exact email','Match por domain','Match por name mention','Multiple matches → null']::text[],
  ARRAY[]::text[],
  '{"match_strategies":["email_exact","email_domain","name_mention"]}'::jsonb,
  '{"on_ambiguous":"return null"}'::jsonb,
  '{"target_precision":0.95}'::jsonb, '{}'::jsonb,
  '{"shape":{"client_id":"uuid|null","match_reason":"text|null"}}'::jsonb, true, 1),
('draft-slack-reply','Genera draft de respuesta a un mensaje Slack para que un human lo apruebe.','domain','MEDIUM','~2s','supabase/functions/comm-classify/index.ts',
  ARRAY['slack-agent']::text[], ARRAY['communication_messages.update','reply_drafts.insert']::text[],
  ARRAY['classify-slack-message']::text[],
  ARRAY['2-5 sentences polite concrete','First-person plural','NEVER make up commitments','Match language']::text[],
  ARRAY[]::text[],
  '{"max_length":500}'::jsonb, '{"on_unclear":"ask clarifying question"}'::jsonb,
  '{"target_human_approval_rate":0.7}'::jsonb, '{}'::jsonb,
  '{"shape":{"text":"text","reply_tone":"formal|friendly|concise"}}'::jsonb, true, 1),
('notify-assignee','Envía DM Slack al assignee con block kit (Aceptar/Snooze/Ver) cuando se asigna una task.','domain','HIGH','~1s','supabase/functions/task-assignee-dm/index.ts',
  ARRAY[]::text[], ARRAY['tasks.read','profiles.read','integration_tokens.read']::text[],
  ARRAY['profiles.slack_user_id linked via /livv link']::text[],
  ARRAY['Disparar on tasks.assignee_id change','Block kit con context','Buttons accept/snooze/view','Graceful skip si no slack_user_id']::text[],
  ARRAY['trigger trg_slack_dm_on_task_assignment exists']::text[],
  '{"on_no_slack_user_id":"skip"}'::jsonb, '{"on_token_missing":"skip"}'::jsonb,
  '{"target_delivery_rate":0.95}'::jsonb, '{}'::jsonb,
  '{"shape":{"sent_to":"text","task_id":"uuid"}}'::jsonb, true, 1);

COMMIT;

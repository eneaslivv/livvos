-- ============================================================
-- aurora-livv · 02_agent_metrics.sql
-- 8 operational views over agents.* + domain tables.
-- All views are SECURITY INVOKER (inherit caller's RLS).
-- ============================================================

-- ---------------------------------------------------------------------
-- 1. v_tool_success_rate
--    Per-tool success rate over last 30 days.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW agents.v_tool_success_rate AS
SELECT
  tenant_id,
  agent,
  tool_name,
  tier,
  COUNT(*) AS calls_n,
  COUNT(*) FILTER (WHERE success = true) AS success_n,
  COUNT(*) FILTER (WHERE success = false) AS failure_n,
  ROUND(100.0 * COUNT(*) FILTER (WHERE success = true) / NULLIF(COUNT(*),0), 1) AS success_rate_pct,
  ROUND(AVG(latency_ms))::int AS avg_latency_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms))::int AS p95_latency_ms
FROM agents.tool_calls
WHERE created_at >= now() - interval '30 days'
GROUP BY tenant_id, agent, tool_name, tier;

-- ---------------------------------------------------------------------
-- 2. v_agent_csat
--    Thumbs-up / thumbs-down per agent.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW agents.v_agent_csat AS
SELECT
  m.tenant_id,
  m.agent,
  COUNT(f.id) AS feedback_n,
  COUNT(*) FILTER (WHERE f.rating = 1) AS thumbs_up,
  COUNT(*) FILTER (WHERE f.rating = -1) AS thumbs_down,
  ROUND(100.0 * COUNT(*) FILTER (WHERE f.rating = 1) / NULLIF(COUNT(f.id), 0), 1) AS satisfaction_pct
FROM agents.messages m
JOIN agents.feedback f ON f.message_id = m.id
WHERE m.role = 'agent'
  AND m.created_at >= now() - interval '30 days'
GROUP BY m.tenant_id, m.agent;

-- ---------------------------------------------------------------------
-- 3. v_session_funnel
--    Of all sessions started, how many produced ≥1 tool call?
--    How many produced a confirmed WRITE?
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW agents.v_session_funnel AS
SELECT
  s.tenant_id,
  s.active_agent,
  COUNT(DISTINCT s.id) AS sessions_n,
  COUNT(DISTINCT s.id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM agents.tool_calls tc
      JOIN agents.messages m ON m.id = tc.message_id
      WHERE m.session_id = s.id
    )
  ) AS sessions_with_tool_call,
  COUNT(DISTINCT s.id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM agents.audit_log al
      JOIN agents.messages m ON m.tenant_id = al.tenant_id AND m.agent = al.agent
      WHERE m.session_id = s.id
        AND al.status = 'committed'
        AND al.tier IN ('WRITE','DESTRUCTIVE')
    )
  ) AS sessions_with_committed_write
FROM agents.sessions s
WHERE s.started_at >= now() - interval '30 days'
GROUP BY s.tenant_id, s.active_agent;

-- ---------------------------------------------------------------------
-- 4. v_routing_health
--    Atlas routing: how often does the user accept the routed agent?
--    Approximated by "Atlas routed → user's NEXT message went to that agent".
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW agents.v_routing_health AS
WITH routes AS (
  SELECT
    m.session_id,
    m.created_at,
    (m.canvas->>'target_agent') AS routed_to,
    LEAD((m.canvas->>'target_agent')) OVER (PARTITION BY m.session_id ORDER BY m.created_at) AS next_target,
    LEAD(m.agent) OVER (PARTITION BY m.session_id ORDER BY m.created_at) AS next_agent
  FROM agents.messages m
  WHERE m.agent = 'atlas'
    AND m.canvas->>'type' = 'route'
)
SELECT
  routed_to,
  COUNT(*) AS routes_n,
  COUNT(*) FILTER (WHERE next_agent = routed_to) AS accepted_n,
  ROUND(100.0 * COUNT(*) FILTER (WHERE next_agent = routed_to) / NULLIF(COUNT(*),0), 1) AS acceptance_pct
FROM routes
WHERE created_at >= now() - interval '30 days'
GROUP BY routed_to;

-- ---------------------------------------------------------------------
-- 5. v_compensation_events
--    How often do sagas have to undo something?
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW agents.v_compensation_events AS
SELECT
  c.tenant_id,
  al.agent,
  al.tool_name,
  COUNT(DISTINCT al.id) AS audits_with_compensation,
  COUNT(*) AS compensation_steps_n,
  COUNT(*) FILTER (WHERE c.status = 'done') AS compensation_done,
  COUNT(*) FILTER (WHERE c.status = 'failed') AS compensation_failed
FROM agents.compensations c
JOIN agents.audit_log al ON al.id = c.audit_id
WHERE c.created_at >= now() - interval '30 days'
GROUP BY c.tenant_id, al.agent, al.tool_name;

-- ---------------------------------------------------------------------
-- 6. v_destructive_audit
--    Every DESTRUCTIVE call, with the typing confirmation check.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW agents.v_destructive_audit AS
SELECT
  al.id AS audit_id,
  al.created_at,
  al.tenant_id,
  al.user_id,
  al.agent,
  al.tool_name,
  al.status,
  al.before_state,
  al.after_state,
  al.error
FROM agents.audit_log al
WHERE al.tier = 'DESTRUCTIVE'
ORDER BY al.created_at DESC;

-- ---------------------------------------------------------------------
-- 7. v_token_cost
--    Per-tenant token usage and approximated USD cost.
--    Rates approximate; tune in tenant_config or env.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW agents.v_token_cost AS
SELECT
  tenant_id,
  agent,
  date_trunc('day', created_at) AS day,
  COUNT(*) AS messages_n,
  SUM(tokens_in) AS tokens_in,
  SUM(tokens_out) AS tokens_out,
  -- Sonnet 4.5 approximate: $3/$15 per M tokens. Opus 4.6: $15/$75.
  ROUND(
    SUM(tokens_in) * CASE agent WHEN 'atlas' THEN 0.000015 ELSE 0.000003 END
  + SUM(tokens_out) * CASE agent WHEN 'atlas' THEN 0.000075 ELSE 0.000015 END
  , 4) AS approx_usd
FROM agents.messages
WHERE role = 'agent'
  AND created_at >= now() - interval '30 days'
GROUP BY tenant_id, agent, date_trunc('day', created_at);

-- ---------------------------------------------------------------------
-- 8. v_eval_pass_rate
--    Pass rate per agent over the most recent eval run.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW agents.v_eval_pass_rate AS
SELECT DISTINCT ON (agent)
  agent,
  ran_at,
  total_cases,
  passed,
  failed,
  pass_rate,
  llm_model,
  cost_usd
FROM agents.evals_runs
ORDER BY agent, ran_at DESC;

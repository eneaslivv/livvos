// @ts-nocheck
// livv OS — studio-level tools for Norte / Tesoro / Pulso / Memoria.
// Estos tools operan sobre las tablas livv_studio_* (singleton identity,
// decisions, lessons, approvals) + agregaciones cross-tenant a nivel
// portfolio (no scoped por tenant — usa el supabaseAdmin para ver TODO).
//
// Guard: solo accesibles desde agentes con `guard: founder_only` en agents.ts.
// El edge function bloquea la invocación antes de llegar acá si no sos admin.

import type { ToolHandler } from '../types.ts';

// ─────────────────────────────────────────────────────────────────────────
// IDENTITY + memory primitives (shared by Norte, Memoria)
// ─────────────────────────────────────────────────────────────────────────

export const get_studio_identity: ToolHandler = async (_args, { supabaseAdmin }) => {
  const { data, error } = await supabaseAdmin
    .from('livv_studio_identity')
    .select('*')
    .eq('id', 'livv')
    .maybeSingle();
  if (error) return { error: error.message };
  return data || { error: 'identity_not_found' };
};

export const update_studio_identity: ToolHandler = async (args, { supabaseAdmin }) => {
  const allowed = ['studio_thesis', 'studio_brand_voice', 'current_portfolio',
                   'target_runway_months', 'okrs_current_quarter', 'north_star_metric',
                   'competitors_by_product', 'founder_energy_score'];
  const update: Record<string, any> = {};
  for (const k of allowed) {
    if (args[k] !== undefined) update[k] = args[k];
  }
  if (Object.keys(update).length === 0) return { error: 'no_valid_fields' };
  update.updated_at = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('livv_studio_identity').update(update).eq('id', 'livv');
  if (error) return { error: error.message };
  return { ok: true, updated_fields: Object.keys(update) };
};

// ─────────────────────────────────────────────────────────────────────────
// DECISION LOG (Norte skill #5)
// ─────────────────────────────────────────────────────────────────────────

export const list_decisions: ToolHandler = async (args, { supabaseAdmin }) => {
  let q = supabaseAdmin
    .from('livv_studio_decisions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(args.limit || 20);
  if (args.product_id) q = q.eq('product_id', args.product_id);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { decisions: data || [], count: data?.length ?? 0 };
};

export const log_decision: ToolHandler = async (args, { supabaseAdmin }) => {
  if (!args.context || !args.decision) return { error: 'context_and_decision_required' };
  const { data, error } = await supabaseAdmin
    .from('livv_studio_decisions')
    .insert({
      context: args.context,
      alternatives: args.alternatives || [],
      criteria: args.criteria || [],
      decision: args.decision,
      agent_slug: args.agent_slug || 'norte',
      product_id: args.product_id || null,
    })
    .select('id, created_at')
    .single();
  if (error) return { error: error.message };
  return { ok: true, decision_id: data?.id, logged_at: data?.created_at };
};

// ─────────────────────────────────────────────────────────────────────────
// LESSONS (Memoria — el moat real per spec §7 capa 4)
// ─────────────────────────────────────────────────────────────────────────

export const list_lessons: ToolHandler = async (args, { supabaseAdmin }) => {
  let q = supabaseAdmin
    .from('livv_studio_lessons')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(args.limit || 20);
  if (args.product_id) q = q.eq('product_id', args.product_id);
  if (args.tag) q = q.contains('tags', [args.tag]);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { lessons: data || [], count: data?.length ?? 0 };
};

export const log_lesson: ToolHandler = async (args, { supabaseAdmin }) => {
  if (!args.context || !args.action || !args.lesson) {
    return { error: 'context_action_lesson_required' };
  }
  const { data, error } = await supabaseAdmin
    .from('livv_studio_lessons')
    .insert({
      context: args.context,
      action: args.action,
      result: args.result || null,
      lesson: args.lesson,
      applicable_if: args.applicable_if || null,
      product_id: args.product_id || null,
      source_agent: args.source_agent || 'memoria',
      tags: args.tags || [],
    })
    .select('id, created_at')
    .single();
  if (error) return { error: error.message };
  return { ok: true, lesson_id: data?.id, logged_at: data?.created_at };
};

// ─────────────────────────────────────────────────────────────────────────
// APPROVALS QUEUE (Norte skill #6)
// ─────────────────────────────────────────────────────────────────────────

export const list_approvals: ToolHandler = async (args, { supabaseAdmin }) => {
  let q = supabaseAdmin
    .from('livv_studio_approvals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(args.limit || 20);
  if (args.status) q = q.eq('status', args.status);
  else q = q.eq('status', 'pending');
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { approvals: data || [], count: data?.length ?? 0 };
};

export const create_approval: ToolHandler = async (args, { supabaseAdmin }) => {
  if (!args.requested_by || !args.description) {
    return { error: 'requested_by_and_description_required' };
  }
  const { data, error } = await supabaseAdmin
    .from('livv_studio_approvals')
    .insert({
      requested_by: args.requested_by,
      category: args.category || 'general',
      description: args.description,
      amount_usd: args.amount_usd ?? null,
      context: args.context || {},
    })
    .select('id, created_at')
    .single();
  if (error) return { error: error.message };
  return { ok: true, approval_id: data?.id, created_at: data?.created_at };
};

export const resolve_approval: ToolHandler = async (args, { supabaseAdmin }) => {
  if (!args.approval_id || !args.status) {
    return { error: 'approval_id_and_status_required' };
  }
  if (!['approved', 'rejected'].includes(args.status)) {
    return { error: 'status_must_be_approved_or_rejected' };
  }
  const { error } = await supabaseAdmin
    .from('livv_studio_approvals')
    .update({
      status: args.status,
      resolution_note: args.note || null,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', args.approval_id);
  if (error) return { error: error.message };
  return { ok: true };
};

// ─────────────────────────────────────────────────────────────────────────
// TESORO — finance del studio (cost cross-tenant + AI cost breakdown)
// ─────────────────────────────────────────────────────────────────────────

export const runway_calc: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Approx: usa los gastos de AI tokens registrados en aurora_messages como
  // proxy real del burn. Para gastos non-AI se podría leer la tabla expenses
  // del master tenant cuando esté integrada.
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: aiMessages } = await supabaseAdmin
    .from('aurora_messages')
    .select('cost_usd, created_at')
    .gte('created_at', since);
  const monthlyAiCost = (aiMessages || []).reduce((s: number, m: any) => s + Number(m.cost_usd || 0), 0);
  const { data: identity } = await supabaseAdmin
    .from('livv_studio_identity').select('target_runway_months').eq('id', 'livv').maybeSingle();
  return {
    estimated_monthly_burn_usd: Math.round(monthlyAiCost * 100) / 100,
    target_runway_months: identity?.target_runway_months || 18,
    runway_methodology: 'AI cost (aurora_messages last 30d). Non-AI burn requires expenses table integration.',
    note: 'Approx — Tesoro needs bank/Stripe connection to compute true burn.',
  };
};

export const ai_cost_breakdown: ToolHandler = async (args, { supabaseAdmin }) => {
  const days = args.days || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabaseAdmin
    .from('aurora_messages')
    .select('agent_slug, model, cost_usd, tokens_in, tokens_out, created_at')
    .gte('created_at', since)
    .not('cost_usd', 'is', null);
  const byAgent: Record<string, { cost: number; calls: number; tokens_in: number; tokens_out: number }> = {};
  const byModel: Record<string, { cost: number; calls: number }> = {};
  let total = 0;
  for (const m of (data || [])) {
    const agent = m.agent_slug || 'unknown';
    const model = m.model || 'unknown';
    if (!byAgent[agent]) byAgent[agent] = { cost: 0, calls: 0, tokens_in: 0, tokens_out: 0 };
    if (!byModel[model]) byModel[model] = { cost: 0, calls: 0 };
    byAgent[agent].cost += Number(m.cost_usd || 0);
    byAgent[agent].calls += 1;
    byAgent[agent].tokens_in += Number(m.tokens_in || 0);
    byAgent[agent].tokens_out += Number(m.tokens_out || 0);
    byModel[model].cost += Number(m.cost_usd || 0);
    byModel[model].calls += 1;
    total += Number(m.cost_usd || 0);
  }
  return {
    window_days: days,
    total_cost_usd: Math.round(total * 100) / 100,
    by_agent: Object.entries(byAgent).map(([slug, m]) => ({
      slug,
      cost_usd: Math.round(m.cost * 100) / 100,
      calls: m.calls,
      tokens_in: m.tokens_in,
      tokens_out: m.tokens_out,
    })).sort((a, b) => b.cost_usd - a.cost_usd),
    by_model: Object.entries(byModel).map(([model, m]) => ({
      model,
      cost_usd: Math.round(m.cost * 100) / 100,
      calls: m.calls,
    })).sort((a, b) => b.cost_usd - a.cost_usd),
  };
};

// ─────────────────────────────────────────────────────────────────────────
// PULSO — portfolio metrics cross-tenant (treat each tenant ≈ product proxy)
// ─────────────────────────────────────────────────────────────────────────

export const portfolio_snapshot: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Get identity + tenant rollup
  const [idRes, tenantRes] = await Promise.all([
    supabaseAdmin.from('livv_studio_identity').select('current_portfolio').eq('id', 'livv').maybeSingle(),
    supabaseAdmin.from('tenants').select('id, name, status, plan, created_at').neq('status', 'suspended'),
  ]);
  const declared = (idRes.data?.current_portfolio || []) as any[];
  const tenants = tenantRes.data || [];

  // Per-tenant stats (proxy for product traction)
  const stats: any[] = [];
  for (const t of tenants.slice(0, 10)) {
    const [usersRes, leadsRes, invRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
      supabaseAdmin.from('invoices').select('amount').eq('tenant_id', t.id).eq('status', 'paid'),
    ]);
    const revenue = (invRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    stats.push({
      tenant_id: t.id,
      name: t.name,
      plan: t.plan,
      status: t.status,
      users: usersRes.count || 0,
      leads: leadsRes.count || 0,
      revenue_paid: Math.round(revenue),
      created_at: t.created_at,
    });
  }
  return {
    declared_products: declared,
    tenants_n: tenants.length,
    tenant_stats: stats,
    note: 'Each tenant ≈ proxy de uso del producto Payper. Cuando arranque producto #2 esto se separa por product_id.',
  };
};

export const portfolio_health_score: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Score per product on 5 dimensions: traction, revenue, team, technical, public-narrative.
  // Today: 1 producto (Payper). Numbers come from tenant stats + activity_logs.
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [tRes, aRes, eRes] = await Promise.all([
    supabaseAdmin.from('tenants').select('id, status').neq('status', 'suspended'),
    supabaseAdmin.from('activity_logs').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabaseAdmin.from('aurora_messages').select('cost_usd').gte('created_at', since),
  ]);
  const tenantCount = tRes.data?.length || 0;
  const weeklyActivity = aRes.count || 0;
  const weeklyAiCost = (eRes.data || []).reduce((s: number, m: any) => s + Number(m.cost_usd || 0), 0);

  const dimensions = {
    traction: tenantCount > 5 ? 'green' : tenantCount > 0 ? 'amber' : 'red',
    revenue: 'amber', // TODO: needs MRR from invoices roll-up
    team: 'green',     // solo founder, sin team risk
    technical: 'green', // build pasa, edge functions deployed
    public_narrative: 'red',  // no public posts tracked yet
  };
  const score = Object.values(dimensions).filter(d => d === 'green').length;

  return {
    product_id: 'payper',
    score_5: score,
    dimensions,
    weekly_activity_count: weeklyActivity,
    weekly_ai_cost_usd: Math.round(weeklyAiCost * 100) / 100,
    tenants_active: tenantCount,
    note: 'Sub-dimension revenue requiere integration con Stripe / bank para precision. public_narrative requiere connect con Ola (Sprint 5).',
  };
};

// ─────────────────────────────────────────────────────────────────────────
// FOUNDER ENERGY (Norte skill #10 — privada, solo Norte la consume)
// ─────────────────────────────────────────────────────────────────────────

// ═════════════════════════════════════════════════════════════════════════
// CUMBRE — Strategy / Foresight (Sprint 4 del spec)
// ═════════════════════════════════════════════════════════════════════════

export const boston_matrix: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Categorize products from current_portfolio + tenant stats into BCG quadrants:
  // stars (high growth + high share), cash_cows (low growth + high share),
  // question_marks (high growth + low share), dogs (low growth + low share).
  // With only 1 product (Payper) today, output is mostly directional.
  const [idRes, tenantRes] = await Promise.all([
    supabaseAdmin.from('livv_studio_identity').select('current_portfolio').eq('id', 'livv').maybeSingle(),
    supabaseAdmin.from('tenants').select('id, created_at, status').neq('status', 'suspended'),
  ]);
  const products = (idRes.data?.current_portfolio || []) as any[];
  const tenants = tenantRes.data || [];
  const recentTenants = tenants.filter((t: any) => new Date(t.created_at).getTime() > Date.now() - 90 * 86400000);
  const growthRate = tenants.length > 0 ? recentTenants.length / tenants.length : 0;
  // For each declared product, assign a quadrant heuristically.
  const matrix = products.map((p: any) => {
    let quadrant: 'star' | 'cash_cow' | 'question_mark' | 'dog' = 'question_mark';
    if (p.stage === 'pre-launch') quadrant = 'question_mark';
    else if (p.stage === 'launched' && growthRate > 0.3) quadrant = 'star';
    else if (p.stage === 'launched' && growthRate <= 0.3) quadrant = 'cash_cow';
    return { product_id: p.id, name: p.name, stage: p.stage, growth_rate_proxy: Math.round(growthRate * 100), quadrant };
  });
  return {
    products_n: products.length,
    matrix,
    note: 'BCG matrix con 1 producto es directional. Cuando arranque P#2, el cuadrante se mide vs el otro.',
  };
};

export const scenario_brief: ToolHandler = async (args, { supabaseAdmin }) => {
  // Returns context the LLM needs to reason about "qué pasa si X" scenarios.
  // Doesn't simulate by itself — gives Cumbre the data to reason over.
  const [identityRes, runRes, costRes, tenantRes] = await Promise.all([
    supabaseAdmin.from('livv_studio_identity').select('*').eq('id', 'livv').maybeSingle(),
    supabaseAdmin.from('aurora_messages').select('cost_usd').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    supabaseAdmin.from('aurora_messages').select('cost_usd, model').gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString()),
    supabaseAdmin.from('tenants').select('id, created_at, plan, status'),
  ]);
  const monthlyAi = (runRes.data || []).reduce((s: number, m: any) => s + Number(m.cost_usd || 0), 0);
  const last90AiCost = (costRes.data || []).reduce((s: number, m: any) => s + Number(m.cost_usd || 0), 0);
  return {
    scenario_name: args.scenario_name || 'unnamed',
    identity: identityRes.data,
    monthly_ai_cost_usd: Math.round(monthlyAi * 100) / 100,
    last_90d_ai_cost_usd: Math.round(last90AiCost * 100) / 100,
    tenants: tenantRes.data || [],
    tenant_growth_last_90d: (tenantRes.data || []).filter((t: any) => new Date(t.created_at).getTime() > Date.now() - 90 * 86400000).length,
    instruction: 'Razona sobre el escenario usando estos datos. Output: trade-offs cuantificados + 1 recomendación.',
  };
};

export const stress_test_inputs: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Inputs for stress testing the studio (e.g. "if revenue drops 30%, if AI 2x...").
  const [identityRes, costRes, tenantRes, invRes] = await Promise.all([
    supabaseAdmin.from('livv_studio_identity').select('target_runway_months, current_portfolio').eq('id', 'livv').maybeSingle(),
    supabaseAdmin.from('aurora_messages').select('cost_usd').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    supabaseAdmin.from('tenants').select('id, plan').neq('status', 'suspended'),
    supabaseAdmin.from('invoices').select('amount, status').eq('status', 'paid').gte('issued_date', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
  ]);
  const aiCost30d = (costRes.data || []).reduce((s: number, m: any) => s + Number(m.cost_usd || 0), 0);
  const revenue30d = (invRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  return {
    baseline: {
      monthly_revenue_usd: Math.round(revenue30d),
      monthly_ai_cost_usd: Math.round(aiCost30d * 100) / 100,
      net_monthly_usd: Math.round(revenue30d - aiCost30d),
      tenants_active: tenantRes.data?.length || 0,
      target_runway_months: identityRes.data?.target_runway_months || 18,
    },
    stress_scenarios: [
      { name: 'revenue_drop_30pct', delta_revenue_pct: -30, delta_cost_pct: 0 },
      { name: 'ai_cost_2x',          delta_revenue_pct: 0,   delta_cost_pct: 100 },
      { name: 'competitor_takes_30pct_tenants', delta_revenue_pct: -30, delta_cost_pct: -10 },
      { name: 'tax_change_anthropic_25pct',     delta_revenue_pct: 0,   delta_cost_pct: 25 },
    ],
    instruction: 'Calcula impact en runway para cada scenario y prioriza por gravedad.',
  };
};

// ═════════════════════════════════════════════════════════════════════════
// FORJA — Engineering / Tech Ops (Sprint 5 del spec)
// ═════════════════════════════════════════════════════════════════════════

export const infra_health: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Pulls a quick health snapshot of the underlying infra signals we can see.
  const [agentMsgsRes, recentErrorsRes] = await Promise.all([
    supabaseAdmin.from('aurora_messages').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    // Errors proxy: tool errors are stored as 'tool' role with content starting with '{"error"'
    supabaseAdmin.from('aurora_messages').select('id, content:text', { count: 'exact', head: true }).eq('role', 'tool').gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
  ]);
  return {
    aurora_messages_24h: agentMsgsRes.count || 0,
    tool_calls_24h: recentErrorsRes.count || 0,
    note: 'Forja necesita integraciones reales con Vercel/Supabase logs para metrics precisos. Sin eso, los signals son agregaciones del propio Aurora.',
  };
};

export const deploy_log: ToolHandler = async (args, { supabaseAdmin }) => {
  // List recent activity_logs of type 'deploy' or 'release' if they exist.
  const { data } = await supabaseAdmin
    .from('activity_logs')
    .select('action, target, type, created_at, user_name')
    .or('type.eq.deploy,type.eq.release,action.ilike.%deploy%,action.ilike.%release%')
    .order('created_at', { ascending: false })
    .limit(args.limit || 10);
  return { deploys: data || [], note: 'Filtros loosely — agregar type=deploy en activity_logs para mejor precision.' };
};

export const ai_provider_concentration: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Concentration risk: % cost coming from each model in last 30 days.
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data } = await supabaseAdmin.from('aurora_messages').select('model, cost_usd').gte('created_at', since).not('cost_usd', 'is', null);
  const byModel: Record<string, number> = {};
  let total = 0;
  for (const m of (data || [])) {
    const model = m.model || 'unknown';
    byModel[model] = (byModel[model] || 0) + Number(m.cost_usd || 0);
    total += Number(m.cost_usd || 0);
  }
  const concentration = Object.entries(byModel)
    .map(([model, cost]) => ({ model, cost_usd: Math.round(cost * 100) / 100, pct: total > 0 ? Math.round((cost / total) * 100) : 0 }))
    .sort((a, b) => b.cost_usd - a.cost_usd);
  const provider = (m: string) => m.startsWith('gpt') ? 'openai' : m.startsWith('claude') ? 'anthropic' : m.startsWith('gemini') ? 'google' : 'unknown';
  const byProvider: Record<string, number> = {};
  for (const row of concentration) byProvider[provider(row.model)] = (byProvider[provider(row.model)] || 0) + row.cost_usd;
  const topProviderPct = total > 0 ? Math.max(...Object.values(byProvider)) / total : 0;
  return {
    total_30d_usd: Math.round(total * 100) / 100,
    by_model: concentration,
    by_provider: Object.entries(byProvider).map(([p, c]) => ({ provider: p, cost_usd: Math.round(c * 100) / 100 })),
    concentration_risk: topProviderPct > 0.9 ? 'high' : topProviderPct > 0.7 ? 'medium' : 'low',
    note: 'Si un solo provider tiene >90% del cost, hay riesgo de vendor lock. Mitigar con abstraction layer.',
  };
};

// ═════════════════════════════════════════════════════════════════════════
// TRAZO — Design / Brand (Sprint 5 del spec)
// ═════════════════════════════════════════════════════════════════════════

export const brand_voice_get: ToolHandler = async (_args, { supabaseAdmin }) => {
  const { data } = await supabaseAdmin
    .from('livv_studio_identity')
    .select('studio_brand_voice, studio_thesis, current_portfolio')
    .eq('id', 'livv').maybeSingle();
  return data || { error: 'identity_not_found' };
};

export const asset_inventory: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Best-effort: list logos/banners from tenant_assets storage prefix.
  // Returns counts only — actual asset listing requires storage API access.
  const { count: tenantsCount } = await supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true });
  return {
    tenants_with_assets: tenantsCount || 0,
    note: 'Asset inventory real necesita integration con Supabase storage. Por ahora returns counts proxy.',
    recommended_assets_per_tenant: ['logo_light.svg', 'logo_dark.svg', 'banner.jpg', 'favicon.ico'],
  };
};

// ═════════════════════════════════════════════════════════════════════════
// OLA — Growth / Marketing (Sprint 5 del spec)
// ═════════════════════════════════════════════════════════════════════════

export const recent_wins: ToolHandler = async (args, { supabaseAdmin }) => {
  // Pulls "shareable" wins from the last N days: closed deals, big lessons,
  // launched products, new tenants, completed projects.
  const days = args.days || 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [decisions, lessons, leads, tenants] = await Promise.all([
    supabaseAdmin.from('livv_studio_decisions').select('decision, context, created_at').gte('created_at', since).limit(10),
    supabaseAdmin.from('livv_studio_lessons').select('lesson, action, created_at').gte('created_at', since).limit(10),
    supabaseAdmin.from('leads').select('name, company, status, last_interaction').eq('status', 'won').gte('updated_at', since).limit(10),
    supabaseAdmin.from('tenants').select('name, created_at').gte('created_at', since).neq('status', 'suspended').limit(10),
  ]);
  return {
    window_days: days,
    decisions_made: decisions.data || [],
    lessons_captured: lessons.data || [],
    deals_won: leads.data || [],
    new_tenants: tenants.data || [],
    note: 'Cada uno de estos puede ser hilo de build-in-public. Filtra los 2-3 mas narrativos.',
  };
};

export const narrative_check: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Compares the last 30 days of activity vs the declared studio_thesis to flag
  // if recent moves drift from the narrative.
  const { data: identity } = await supabaseAdmin.from('livv_studio_identity').select('studio_thesis, current_portfolio').eq('id', 'livv').maybeSingle();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: decisions } = await supabaseAdmin.from('livv_studio_decisions').select('decision, context').gte('created_at', since).limit(20);
  return {
    studio_thesis: identity?.studio_thesis,
    declared_portfolio: identity?.current_portfolio,
    recent_decisions: decisions || [],
    instruction: 'Compara las decisions con la thesis. Detecta si hay drift (decisions que llevan a un vertical distinto, p.ej.).',
  };
};

export const build_in_public_suggest: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Aggregates recent wins + lessons and proposes 1-3 narrative angles.
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [decRes, lesRes] = await Promise.all([
    supabaseAdmin.from('livv_studio_decisions').select('decision, context').gte('created_at', since).limit(5),
    supabaseAdmin.from('livv_studio_lessons').select('lesson, applicable_if').gte('created_at', since).limit(5),
  ]);
  return {
    last_week_decisions: decRes.data || [],
    last_week_lessons: lesRes.data || [],
    suggested_formats: ['Twitter thread (5-7 tweets)', 'LinkedIn post (300 words)', 'Newsletter section (500 words)'],
    instruction: 'Propone 1-3 angulos narrativos. Cada uno con: hook, angulo, formato, canal sugerido.',
  };
};

// ═════════════════════════════════════════════════════════════════════════
// RAÍZ — People / Talent (Sprint 6 del spec — on-demand)
// ═════════════════════════════════════════════════════════════════════════

export const team_count_studio: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Count of profiles in the master tenant (livv home) as proxy for team size.
  const { data: identity } = await supabaseAdmin.from('livv_studio_identity').select('founder_email').eq('id', 'livv').maybeSingle();
  const founderEmail = identity?.founder_email;
  const { data: founderProfile } = await supabaseAdmin.from('profiles').select('tenant_id').eq('email', founderEmail).maybeSingle();
  if (!founderProfile?.tenant_id) return { team_count: 1, note: 'Tenant del founder no encontrado. Asumiendo solo-founder.' };
  const { count } = await supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', founderProfile.tenant_id);
  return {
    team_count: count || 1,
    studio_tenant_id: founderProfile.tenant_id,
    note: count && count > 1 ? `Equipo de ${count} personas (incluyendo founder).` : 'Solo founder. Cuando contrates, Raiz arranca a operar fuerte.',
  };
};

export const hiring_signal_check: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Aggregates capacity heatmap + burnout signals to spot the "founder bottleneck" pattern.
  const { data: tasks } = await supabaseAdmin.from('tasks').select('assignee_id, status, due_date').neq('status', 'completed');
  const byPerson: Record<string, { open: number; overdue: number }> = {};
  const now = Date.now();
  for (const t of (tasks || [])) {
    if (!t.assignee_id) continue;
    if (!byPerson[t.assignee_id]) byPerson[t.assignee_id] = { open: 0, overdue: 0 };
    byPerson[t.assignee_id].open += 1;
    if (t.due_date && new Date(t.due_date).getTime() < now) byPerson[t.assignee_id].overdue += 1;
  }
  const overloadedCount = Object.values(byPerson).filter(p => p.overdue >= 5 || p.open >= 15).length;
  return {
    overloaded_people_n: overloadedCount,
    total_people_with_tasks: Object.keys(byPerson).length,
    bottleneck_signal: overloadedCount > 0 ? 'present' : 'absent',
    note: overloadedCount > 0 ? 'Senal de bottleneck. Si el founder es el unico overloaded, considera primer hire o delegar a agentes.' : 'No hay overload aun.',
  };
};

export const jd_template: ToolHandler = async (args, _ctx) => {
  // Returns a structured JD template tailored to the role hinted.
  const role = (args.role || 'general').toLowerCase();
  const sections = ['About livv', 'About the role', 'What you will do (first 90 days)', 'What you bring', 'How we work', 'Compensation', 'How to apply'];
  return {
    role,
    template_sections: sections,
    livv_context: 'livv is an AI-first studio. Tiny team, async, ship-oriented. Anthropic + OpenAI stack. Vertical SaaS for PYMES (starting with gastronomy / Payper).',
    instruction: 'Para cada section, escribe 2-3 lines especificas al role. Tono directo, sin corporate speak.',
  };
};

// ═════════════════════════════════════════════════════════════════════════
// BRÚJULA — Bizdev / Partnerships (Sprint 6 del spec — on-demand)
// ═════════════════════════════════════════════════════════════════════════

export const partner_summary_studio: ToolHandler = async (_args, { supabaseAdmin }) => {
  const { data } = await supabaseAdmin.from('partners').select('id, name, type, status, created_at').limit(50);
  const counts: Record<string, number> = {};
  for (const p of (data || [])) counts[p.status || 'unknown'] = (counts[p.status || 'unknown'] || 0) + 1;
  return {
    partners_total: data?.length || 0,
    by_status: counts,
    recent: (data || []).slice(0, 5),
    note: 'Brujula opera sobre partners propios del studio. Cuando arranque P#2, separa por product_id.',
  };
};

export const vertical_adjacency_research: ToolHandler = async (args, { supabaseAdmin }) => {
  const { data: identity } = await supabaseAdmin.from('livv_studio_identity').select('studio_thesis, current_portfolio, competitors_by_product').eq('id', 'livv').maybeSingle();
  const currentVertical = args.current_vertical || 'gastronomia';
  const adjacencies: Record<string, string[]> = {
    gastronomia: ['peluquerias', 'gimnasios', 'talleres mecanicos', 'consultorios medicos', 'estudios de yoga', 'kioscos / almacenes', 'lavaderos'],
    salud: ['fisioterapia', 'odontologia', 'psicologia', 'veterinaria', 'farmacias'],
    educacion: ['cursos online', 'tutorias', 'academias deportivas', 'jardines de infantes'],
  };
  return {
    studio_thesis: identity?.studio_thesis,
    current_portfolio: identity?.current_portfolio,
    current_vertical: currentVertical,
    adjacent_verticals: adjacencies[currentVertical] || [],
    note: 'Brujula sugiere proximos verticales basados en adjacency. Las decisiones reales se toman con Cumbre (analisis estrategico).',
  };
};

// ═════════════════════════════════════════════════════════════════════════
// MEMORIA EXPANSION (Sprint 3 del spec — auto-extraccion + founder journal)
// ═════════════════════════════════════════════════════════════════════════

export const extract_lesson_candidates: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Scans recent decisions + threads for patterns that could become lessons.
  // The agent (Memoria) reviews these candidates and offers them to the founder
  // for confirmation. Founder accepts via log_lesson.
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [decRes, msgRes] = await Promise.all([
    supabaseAdmin.from('livv_studio_decisions').select('id, context, decision, outcome, created_at').gte('created_at', since).limit(20),
    supabaseAdmin.from('aurora_messages').select('agent_slug, text, created_at').eq('role', 'assistant').gte('created_at', since).limit(50),
  ]);
  // Heuristic: decisions con outcome ya conocido son candidates fuertes.
  const decisionCandidates = (decRes.data || []).filter((d: any) => d.outcome);
  return {
    candidate_count: decisionCandidates.length,
    decision_candidates: decisionCandidates,
    recent_agent_outputs_count: msgRes.data?.length || 0,
    instruction: 'Memoria: revisa cada candidate y propon una leccion en formato {context, action, result, lesson, applicable_if}. Esperar confirmation del founder antes de log_lesson.',
  };
};

export const journal_questions: ToolHandler = async (_args, _ctx) => {
  // The 5 structured journal questions for end-of-day reflection (spec §6.4 skill 8).
  return {
    questions: [
      { id: 'shipped', q: 'Que moviste hoy?' },
      { id: 'stalled', q: 'Que no moviste hoy y por que?' },
      { id: 'learned', q: 'Que aprendiste? (1 leccion concreta)' },
      { id: 'tomorrow', q: 'Que prioriza para manana?' },
      { id: 'blocker', q: 'Tenes algun bloqueo o gente que necesitas que te desbloquee?' },
    ],
    format: 'Hace las 5 preguntas una por una al founder. Al final, ofrece guardar la respuesta de "learned" como leccion via log_lesson.',
  };
};

// (founder_energy_check sigue siendo el mismo de Sprint 1 — no se modifica)
export const founder_energy_check: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Proxy crude: cuántos mensajes user mandó en últimas 24h, cuántas decisiones
  // grandes resolvió, % de aprobaciones sobre amount alto, hora del día más
  // frecuente. Score 0-1 (1 = fresco, 0 = agotado).
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [msgRes, decRes, identityRes] = await Promise.all([
    supabaseAdmin.from('aurora_messages').select('created_at, role').eq('role', 'user').gte('created_at', since),
    supabaseAdmin.from('livv_studio_decisions').select('created_at').gte('created_at', since),
    supabaseAdmin.from('livv_studio_identity').select('founder_energy_score').eq('id', 'livv').maybeSingle(),
  ]);
  const messages24h = msgRes.data?.length || 0;
  const decisions24h = decRes.data?.length || 0;
  const stored = identityRes.data?.founder_energy_score ?? 0.8;

  // Heuristic: > 80 msgs/day OR > 10 decisions/day → fatigue signal
  let score = stored;
  let signal: 'fresh' | 'normal' | 'high_load' | 'risk_burnout' = 'normal';
  if (messages24h > 100 || decisions24h > 12) {
    score = Math.max(0.3, Number(score) - 0.2);
    signal = 'risk_burnout';
  } else if (messages24h > 60 || decisions24h > 8) {
    score = Math.max(0.5, Number(score) - 0.1);
    signal = 'high_load';
  } else if (messages24h < 10) {
    score = Math.min(1.0, Number(score) + 0.05);
    signal = 'fresh';
  }

  // Persist updated score
  await supabaseAdmin.from('livv_studio_identity').update({
    founder_energy_score: score,
    updated_at: new Date().toISOString(),
  }).eq('id', 'livv');

  return {
    energy_score: Math.round(Number(score) * 100) / 100,
    signal,
    messages_24h: messages24h,
    decisions_24h: decisions24h,
    recommendation: signal === 'risk_burnout' ? 'Pará. Cerrá los pendientes urgentes y descansá.' :
                    signal === 'high_load' ? 'Día cargado. Acortá la lista, delegá lo que puedas a los agentes.' :
                    signal === 'fresh' ? 'Energía buena. Día para mover algo grande.' :
                    'Día normal. Seguí el plan.',
  };
};

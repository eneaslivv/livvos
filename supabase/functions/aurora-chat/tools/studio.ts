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

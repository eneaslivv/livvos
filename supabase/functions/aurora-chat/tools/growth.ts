// @ts-nocheck
// Cross-cutting tools — Clients (Cobra), Products (Rune), Partners (Echo), Pulse (master).

import type { ToolHandler } from '../types.ts';

// ─────────────────────────────────────────────────────────────
// COBRA — clients / retainer health
// ─────────────────────────────────────────────────────────────
export const list_clients: ToolHandler = async (args, { supabase }) => {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, company, email, status, industry, notes, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(args.limit || 25);
  if (error) return { error: error.message };
  return { clients: data || [], count: data?.length || 0 };
};

export const client_health_scores: ToolHandler = async (_args, { supabase }) => {
  const { data: clients } = await supabase
    .from('clients').select('id, name, company, status, updated_at').eq('status', 'active').limit(30);
  const results = [];
  for (const c of (clients || [])) {
    const [msgRes, taskRes] = await Promise.all([
      supabase.from('client_messages').select('id, created_at').eq('client_id', c.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('tasks').select('id, status, due_date').eq('client_id', c.id).neq('status', 'completed'),
    ]);
    const lastMsg = msgRes.data?.[0]?.created_at;
    const daysSinceTouch = lastMsg ? Math.floor((Date.now() - new Date(lastMsg).getTime()) / 86400000) : 999;
    const openTasks = taskRes.data?.length || 0;
    const overdueTasks = (taskRes.data || []).filter((t: any) => t.due_date && new Date(t.due_date).getTime() < Date.now()).length;
    let health: 'green' | 'amber' | 'red' = 'green';
    if (daysSinceTouch > 21 || overdueTasks > 3) health = 'red';
    else if (daysSinceTouch > 10 || overdueTasks > 1) health = 'amber';
    results.push({
      client_id: c.id,
      name: c.name,
      company: c.company,
      health,
      days_since_touch: daysSinceTouch,
      open_tasks: openTasks,
      overdue_tasks: overdueTasks,
    });
  }
  return { clients: results.sort((a, b) => ({ red: 0, amber: 1, green: 2 } as any)[a.health] - ({ red: 0, amber: 1, green: 2 } as any)[b.health]) };
};

// ─────────────────────────────────────────────────────────────
// RUNE — products marketplace
// ─────────────────────────────────────────────────────────────
export const list_products: ToolHandler = async (args, { supabase }) => {
  // The products table is best-effort; fall back gracefully if it doesn't exist.
  const { data, error } = await supabase.from('products').select('*').limit(args.limit || 20);
  if (error) return { error: error.message, hint: 'products table may not exist yet' };
  return { products: data || [] };
};

// ─────────────────────────────────────────────────────────────
// ECHO — partners
// ─────────────────────────────────────────────────────────────
export const list_partners: ToolHandler = async (args, { supabase }) => {
  let q = supabase.from('partners').select('*').order('created_at', { ascending: false }).limit(args.limit || 20);
  if (args.status) q = q.eq('status', args.status);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { partners: data || [] };
};

export const dormant_partners: ToolHandler = async (args, { supabase }) => {
  const days = args.days_threshold || 60;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  // A partner is dormant if no lead has been attributed via their code in `days`.
  const { data: partners } = await supabase
    .from('partners').select('id, name, company, referral_code, status').eq('status', 'active');
  const results = [];
  for (const p of (partners || [])) {
    const { count } = await supabase
      .from('leads').select('id', { count: 'exact', head: true })
      .eq('partner_id', p.id).gte('created_at', cutoff);
    if ((count || 0) === 0) results.push({ ...p, leads_in_window: 0 });
  }
  return { dormant_partners: results, threshold_days: days };
};

// ─────────────────────────────────────────────────────────────
// PULSE — platform admin (cross-tenant). Uses supabaseAdmin.
// ─────────────────────────────────────────────────────────────
export const list_tenants_health: ToolHandler = async (_args, { supabaseAdmin }) => {
  // Pulse is gated — only platform admins can talk to it. The runner enforces
  // via the agent's `guard`. Inside the tool we trust the gate and use the
  // admin client for cross-tenant data.
  const { data, error } = await supabaseAdmin
    .from('tenants').select('id, name, status, plan, created_at, suspended_at').limit(50);
  if (error) return { error: error.message };
  return { tenants: data || [] };
};

export const platform_kpis: ToolHandler = async (_args, { supabaseAdmin }) => {
  const { data, error } = await supabaseAdmin.rpc('platform_get_dashboard');
  if (error) return { error: error.message };
  return data || {};
};

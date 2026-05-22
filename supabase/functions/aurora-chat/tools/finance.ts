// @ts-nocheck
// Finance-domain tools (Marina).

import type { ToolHandler } from '../types.ts';

export const list_invoices: ToolHandler = async (args, { supabase }) => {
  let q = supabase
    .from('invoices')
    .select('id, client_id, project_id, amount, status, due_date, issued_date, notes')
    .order('issued_date', { ascending: false })
    .limit(args.limit || 20);
  if (args.status) q = q.eq('status', args.status);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { invoices: data || [], count: data?.length ?? 0 };
};

export const list_expenses: ToolHandler = async (args, { supabase }) => {
  const days = args.days || 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('expenses')
    .select('id, description, amount, category, date')
    .gte('date', cutoff)
    .order('date', { ascending: false })
    .limit(args.limit || 50);
  if (error) return { error: error.message };
  const total = (data || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
  return { expenses: data || [], total, window_days: days };
};

export const ar_aging: ToolHandler = async (_args, { supabase }) => {
  const { data, error } = await supabase
    .from('invoices')
    .select('amount, due_date, status')
    .in('status', ['sent', 'overdue']);
  if (error) return { error: error.message };
  const now = Date.now();
  const buckets = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  for (const inv of (data || [])) {
    const dueMs = inv.due_date ? new Date(inv.due_date).getTime() : now;
    const ageDays = Math.max(0, Math.floor((now - dueMs) / 86400000));
    if (ageDays <= 30) buckets['0_30'] += inv.amount || 0;
    else if (ageDays <= 60) buckets['31_60'] += inv.amount || 0;
    else if (ageDays <= 90) buckets['61_90'] += inv.amount || 0;
    else buckets['90_plus'] += inv.amount || 0;
  }
  return { aging_buckets: buckets, total_ar: Object.values(buckets).reduce((s, v) => s + v, 0) };
};

export const project_profitability: ToolHandler = async (args, { supabase }) => {
  const limit = args.limit || 10;
  const { data: projects } = await supabase
    .from('projects').select('id, title, client_id').limit(limit);
  const results = [];
  for (const p of (projects || [])) {
    const [inc, exp] = await Promise.all([
      supabase.from('invoices').select('amount').eq('project_id', p.id).eq('status', 'paid'),
      supabase.from('expenses').select('amount').eq('project_id', p.id),
    ]);
    const income = (inc.data || []).reduce((s: number, r: any) => s + (r.amount || 0), 0);
    const cost   = (exp.data || []).reduce((s: number, r: any) => s + (r.amount || 0), 0);
    results.push({
      id: p.id,
      title: p.title,
      income, cost,
      margin: income - cost,
      margin_pct: income > 0 ? Math.round(((income - cost) / income) * 100) : 0,
    });
  }
  return { projects: results.sort((a, b) => b.margin - a.margin) };
};

export const cashflow_projection: ToolHandler = async (args, { supabase }) => {
  const weeks = args.weeks || 12;
  const [incRes, expRes] = await Promise.all([
    supabase.from('invoices').select('amount, due_date, status').neq('status', 'paid'),
    supabase.from('expenses').select('amount, date'),
  ]);
  const incoming = (incRes.data || []).reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const recentExp = (expRes.data || [])
    .filter((e: any) => {
      const d = new Date(e.date || 0).getTime();
      return d >= Date.now() - 90 * 86400000;
    });
  const avgWeeklyExp = recentExp.length > 0
    ? recentExp.reduce((s: number, e: any) => s + (e.amount || 0), 0) / 12
    : 0;
  const projected = incoming - (avgWeeklyExp * weeks);
  return {
    horizon_weeks: weeks,
    expected_incoming: Math.round(incoming),
    avg_weekly_expense: Math.round(avgWeeklyExp),
    projected_net: Math.round(projected),
    runway_status: projected > 0 ? 'positive' : 'at_risk',
  };
};

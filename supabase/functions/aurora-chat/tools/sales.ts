// @ts-nocheck
// Sales-domain tools (Solara + Nova). All queries scope by tenant_id via RLS.

import type { ToolHandler } from '../types.ts';

export const list_open_leads: ToolHandler = async (args, { supabase }) => {
  const limit = Math.min(args.limit || 20, 50);
  let q = supabase
    .from('leads')
    .select('id, name, company, status, ai_score, last_interaction, budget, owner_id, created_at')
    .neq('status', 'closed').neq('status', 'lost')
    .order('ai_score', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (args.status) q = q.eq('status', args.status);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return {
    leads: data || [],
    count: data?.length ?? 0,
    pipeline_value: (data || []).reduce((s: number, l: any) => s + (l.budget || 0), 0),
  };
};

export const get_lead_detail: ToolHandler = async (args, { supabase }) => {
  if (!args.lead_id) return { error: 'lead_id_required' };
  const { data, error } = await supabase
    .from('leads').select('*').eq('id', args.lead_id).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'not_found' };
  return data;
};

export const list_stale_leads: ToolHandler = async (args, { supabase }) => {
  const days = args.days_threshold || 14;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('leads')
    .select('id, name, company, status, ai_score, last_interaction, budget')
    .neq('status', 'closed').neq('status', 'lost')
    .lt('last_interaction', cutoff)
    .order('last_interaction', { ascending: true })
    .limit(args.limit || 10);
  if (error) return { error: error.message };
  return { threshold_days: days, stale_leads: data || [], count: data?.length ?? 0 };
};

export const draft_followup: ToolHandler = async (args, { supabase }) => {
  if (!args.lead_id) return { error: 'lead_id_required' };
  const { data: lead } = await supabase
    .from('leads').select('name, company, status, ai_analysis, last_interaction').eq('id', args.lead_id).maybeSingle();
  if (!lead) return { error: 'lead_not_found' };
  return {
    lead_context: lead,
    instruction: 'Drafteá 2 variantes (warm + direct) en español rioplatense. Hook en los primeros 50 chars. Sin emojis. No usar em dashes.',
  };
};

export const funnel_stats: ToolHandler = async (args, { supabase }) => {
  const { data, error } = await supabase
    .from('leads').select('status, budget, created_at, ai_score');
  if (error) return { error: error.message };
  const days = args.days || 30;
  const cutoff = Date.now() - days * 86400000;
  const recent = (data || []).filter((l: any) => new Date(l.created_at).getTime() >= cutoff);
  const byStage: Record<string, number> = {};
  for (const l of recent) byStage[l.status || 'new'] = (byStage[l.status || 'new'] || 0) + 1;
  const won = recent.filter((l: any) => l.status === 'won' || l.status === 'closed').length;
  const total = recent.length;
  return {
    window_days: days,
    total_leads: total,
    by_stage: byStage,
    won_count: won,
    conversion_rate: total > 0 ? Math.round((won / total) * 100) / 100 : 0,
    pipeline_value: recent.reduce((s: number, l: any) => s + (l.budget || 0), 0),
  };
};

export const source_attribution: ToolHandler = async (args, { supabase }) => {
  const days = args.days || 90;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('leads')
    .select('source, status, budget')
    .gte('created_at', cutoff);
  if (error) return { error: error.message };
  const map: Record<string, { leads_n: number; won_n: number; revenue: number }> = {};
  for (const l of (data || [])) {
    const src = l.source || 'unknown';
    if (!map[src]) map[src] = { leads_n: 0, won_n: 0, revenue: 0 };
    map[src].leads_n += 1;
    if (l.status === 'won' || l.status === 'closed') {
      map[src].won_n += 1;
      map[src].revenue += l.budget || 0;
    }
  }
  return {
    window_days: days,
    sources: Object.entries(map).map(([source, m]) => ({ source, ...m, conversion: m.leads_n > 0 ? Math.round((m.won_n / m.leads_n) * 100) / 100 : 0 })),
  };
};

export const weighted_forecast: ToolHandler = async (_args, { supabase }) => {
  const { data, error } = await supabase
    .from('leads')
    .select('status, budget, ai_score')
    .neq('status', 'closed').neq('status', 'lost');
  if (error) return { error: error.message };
  // Simple weighted forecast: ai_score (0-100) × budget
  const weighted = (data || []).reduce((s: number, l: any) => s + ((l.ai_score || 50) / 100) * (l.budget || 0), 0);
  const raw = (data || []).reduce((s: number, l: any) => s + (l.budget || 0), 0);
  return {
    pipeline_raw: Math.round(raw),
    pipeline_weighted: Math.round(weighted),
    deals_open: data?.length || 0,
  };
};

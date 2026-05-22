// @ts-nocheck
// Strategy/Content/Toolkit tools (Lumen + Vega + Iris).

import type { ToolHandler } from '../types.ts';

export const list_icps: ToolHandler = async (_args, { supabase }) => {
  const { data, error } = await supabase
    .from('strategy_icps').select('*').limit(20);
  if (error) return { error: error.message };
  return { icps: data || [], count: data?.length ?? 0 };
};

export const list_packages: ToolHandler = async (_args, { supabase }) => {
  const { data, error } = await supabase
    .from('strategy_packages').select('*').limit(20);
  if (error) return { error: error.message };
  return { packages: data || [], count: data?.length ?? 0 };
};

export const list_positioning: ToolHandler = async (_args, { supabase }) => {
  const { data, error } = await supabase
    .from('strategy_positioning').select('*').limit(20);
  if (error) return { error: error.message };
  return { principles: data || [], count: data?.length ?? 0 };
};

export const brand_kit_detail: ToolHandler = async (args, { supabase }) => {
  let q = supabase.from('brand_kits').select('*');
  if (args.brand_id) q = q.eq('id', args.brand_id);
  const { data, error } = await q.limit(5);
  if (error) return { error: error.message };
  return { brand_kits: data || [] };
};

export const strategy_drift_score: ToolHandler = async (_args, { supabase }) => {
  // Compute a simple drift: count leads whose source/industry doesn't match
  // any declared ICP's targeting hints in the last 60 days.
  const [icpRes, leadRes] = await Promise.all([
    supabase.from('strategy_icps').select('name, industry, segment'),
    supabase.from('leads').select('source, industry, created_at').gte('created_at', new Date(Date.now() - 60 * 86400000).toISOString()),
  ]);
  const icps = icpRes.data || [];
  const leads = leadRes.data || [];
  const icpIndustries = new Set(icps.map((i: any) => (i.industry || '').toLowerCase()).filter(Boolean));
  const drifting = leads.filter((l: any) => l.industry && !icpIndustries.has((l.industry || '').toLowerCase()));
  return {
    leads_total: leads.length,
    leads_drifting: drifting.length,
    drift_pct: leads.length > 0 ? Math.round((drifting.length / leads.length) * 100) : 0,
    declared_icps: icps.length,
    note: drifting.length > leads.length * 0.3
      ? 'Drift alto: más del 30% de leads no encaja con tus ICPs declarados.'
      : 'Drift en rango sano.',
  };
};

export const list_channels: ToolHandler = async (_args, { supabase }) => {
  const { data, error } = await supabase
    .from('content_channels').select('*').limit(20);
  if (error) return { error: error.message };
  return { channels: data || [] };
};

export const list_content_pieces: ToolHandler = async (args, { supabase }) => {
  let q = supabase.from('content_pieces').select('*').order('created_at', { ascending: false }).limit(args.limit || 20);
  if (args.status)  q = q.eq('status', args.status);
  if (args.channel) q = q.eq('channel', args.channel);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { pieces: data || [] };
};

export const cadence_compliance: ToolHandler = async (_args, { supabase }) => {
  const since = new Date(Date.now() - 28 * 86400000).toISOString();
  const [chRes, pcRes] = await Promise.all([
    supabase.from('content_channels').select('id, name, target_cadence_per_week'),
    supabase.from('content_pieces').select('channel_id, published_at, status').gte('published_at', since).eq('status', 'published'),
  ]);
  const channels = chRes.data || [];
  const pieces   = pcRes.data || [];
  const byChannel: Record<string, number> = {};
  for (const p of pieces) byChannel[p.channel_id] = (byChannel[p.channel_id] || 0) + 1;
  const report = channels.map((c: any) => {
    const target4w = (c.target_cadence_per_week || 0) * 4;
    const actual = byChannel[c.id] || 0;
    return {
      channel: c.name,
      target_4w: target4w,
      actual_4w: actual,
      compliance_pct: target4w > 0 ? Math.round((actual / target4w) * 100) : null,
    };
  });
  return { channels: report };
};

export const list_frameworks: ToolHandler = async (_args, { supabase }) => {
  const { data, error } = await supabase
    .from('strategy_frameworks').select('id, name, category, deliverable_type, estimated_hours, price, status').eq('status', 'active');
  if (error) return { error: error.message };
  return { frameworks: data || [] };
};

export const list_client_engagements: ToolHandler = async (args, { supabase }) => {
  let q = supabase.from('client_strategy_projects').select('*').order('updated_at', { ascending: false }).limit(args.limit || 20);
  if (args.status) q = q.eq('status', args.status);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { engagements: data || [] };
};

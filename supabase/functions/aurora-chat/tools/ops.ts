// @ts-nocheck
// Daily ops + Communications + Team tools (Orion + Halo + Selva).

import type { ToolHandler } from '../types.ts';

export const today_focus: ToolHandler = async (_args, { supabase, userId }) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, due_date, priority, status, project_id, assignee_id, assignee_ids')
    .or(`due_date.lte.${end.toISOString().slice(0, 10)},assignee_id.eq.${userId}`)
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true })
    .limit(15);
  if (error) return { error: error.message };
  const overdue = (data || []).filter((t: any) => t.due_date && new Date(t.due_date) < start);
  const today   = (data || []).filter((t: any) => t.due_date && t.due_date.slice(0, 10) === start.toISOString().slice(0, 10));
  const upcoming = (data || []).filter((t: any) => !overdue.includes(t) && !today.includes(t));
  return {
    overdue, today, upcoming,
    counts: { overdue: overdue.length, today: today.length, upcoming: upcoming.length },
  };
};

export const capacity_heatmap: ToolHandler = async (_args, { supabase }) => {
  const { data, error } = await supabase
    .from('tasks')
    .select('assignee_id, status, due_date, priority')
    .neq('status', 'completed');
  if (error) return { error: error.message };
  const byPerson: Record<string, { open: number; overdue: number }> = {};
  const now = Date.now();
  for (const t of (data || [])) {
    if (!t.assignee_id) continue;
    if (!byPerson[t.assignee_id]) byPerson[t.assignee_id] = { open: 0, overdue: 0 };
    byPerson[t.assignee_id].open += 1;
    if (t.due_date && new Date(t.due_date).getTime() < now) byPerson[t.assignee_id].overdue += 1;
  }
  const personIds = Object.keys(byPerson);
  if (personIds.length === 0) return { heatmap: [] };
  const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', personIds);
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.name]));
  const heatmap = personIds.map(id => ({
    user_id: id,
    name: profileMap.get(id) || 'Unknown',
    open: byPerson[id].open,
    overdue: byPerson[id].overdue,
    burden: byPerson[id].open + byPerson[id].overdue * 2,
  })).sort((a, b) => b.burden - a.burden);
  return { heatmap };
};

export const overnight_diff: ToolHandler = async (_args, { supabase }) => {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [leadRes, taskRes, invRes] = await Promise.all([
    supabase.from('leads').select('id, name, status, created_at').gte('created_at', since).limit(10),
    supabase.from('tasks').select('id, title, status, completed, updated_at').gte('updated_at', since).limit(20),
    supabase.from('invoices').select('id, amount, status, updated_at').gte('updated_at', since).limit(10),
  ]);
  return {
    new_leads: leadRes.data || [],
    task_changes: taskRes.data || [],
    invoice_changes: invRes.data || [],
    since,
  };
};

export const list_inbox_recent: ToolHandler = async (args, { supabase }) => {
  // Inbox is composed of client_messages + leads (new). Returning both.
  const limit = args.limit || 20;
  const [msgRes, leadRes] = await Promise.all([
    supabase.from('client_messages').select('id, client_id, message, sender_type, sender_name, created_at, read').order('created_at', { ascending: false }).limit(limit),
    supabase.from('leads').select('id, name, company, message, created_at').eq('status', 'new').order('created_at', { ascending: false }).limit(10),
  ]);
  return {
    messages: msgRes.data || [],
    new_leads: leadRes.data || [],
  };
};

export const detect_inbox_clusters: ToolHandler = async (_args, { supabase }) => {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data } = await supabase
    .from('client_messages').select('message, sender_name, created_at').gte('created_at', since).limit(100);
  // Very simple keyword clustering — looks for repeated 2+ word phrases.
  const tokens: Record<string, number> = {};
  for (const m of (data || [])) {
    const words = (m.message || '').toLowerCase().match(/\b\w{4,}\b/g) || [];
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      tokens[bigram] = (tokens[bigram] || 0) + 1;
    }
  }
  const clusters = Object.entries(tokens)
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));
  return { clusters, window_days: 7 };
};

export const list_team_capacity: ToolHandler = async (_args, { supabase }) => {
  const { data, error } = await supabase
    .from('team_member_profiles')
    .select('id, name, type, rate_monthly, status, start_date')
    .eq('status', 'active');
  if (error) return { error: error.message };
  return { team: data || [], count: data?.length || 0 };
};

export const burnout_signals: ToolHandler = async (_args, { supabase }) => {
  // Detect: anyone with > 8 overdue tasks OR > 20 open tasks signals risk.
  const { data: tasks } = await supabase
    .from('tasks').select('assignee_id, due_date, status').neq('status', 'completed');
  const now = Date.now();
  const byPerson: Record<string, { open: number; overdue: number }> = {};
  for (const t of (tasks || [])) {
    if (!t.assignee_id) continue;
    if (!byPerson[t.assignee_id]) byPerson[t.assignee_id] = { open: 0, overdue: 0 };
    byPerson[t.assignee_id].open += 1;
    if (t.due_date && new Date(t.due_date).getTime() < now) byPerson[t.assignee_id].overdue += 1;
  }
  const personIds = Object.keys(byPerson);
  const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', personIds);
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.name]));
  const at_risk = personIds
    .map(id => ({ user_id: id, name: profileMap.get(id) || 'Unknown', ...byPerson[id] }))
    .filter(p => p.overdue >= 8 || p.open >= 20)
    .sort((a, b) => b.overdue - a.overdue);
  return { at_risk, threshold: { overdue: 8, open: 20 } };
};

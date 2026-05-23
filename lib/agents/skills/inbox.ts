/**
 * Inbox skills — read-only access to communication_messages.
 *
 * Skills:
 *   • inbox.pending           — messages still pending action
 *   • inbox.ai_flagged        — AI-flagged task-requests not yet converted
 *   • inbox.recent            — last N messages regardless of status (resumir inbox)
 *   • inbox.by_contact        — messages from/to a specific person (by name or email)
 *   • inbox.summary_stats     — quick counts by platform/status/today
 *   • inbox.slack_channels    — recent messages grouped by Slack channel
 */

import type { Skill, SkillResult, ExecutionContext } from '../types';

const ok = <T>(kind: SkillResult<T>['kind'], data: T, ms?: number): SkillResult<T> =>
  ({ ok: true, kind, data, ms });
const fail = (kind: SkillResult<any>['kind'], reason: string, ms?: number): SkillResult<any> =>
  ({ ok: false, kind, reason, ms });

// ── inbox.pending ────────────────────────────────────────────────────
export const pending_messages: Skill<{ platform?: 'gmail' | 'slack' }, Array<any>> = {
  id: 'inbox.pending',
  description: 'Inbound messages still pending action (not replied, not archived).',
  kind: 'read',
  validate: (p: any) => ({ platform: p?.platform }),
  run: async (params, ctx) => {
    const t0 = Date.now();
    let q = ctx.db.from('communication_messages')
      .select('id, platform, from_name, from_email, subject, body_text, channel_name, received_at, ai_classification, matched_client_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'pending')
      .order('received_at', { ascending: false })
      .limit(40);
    if (params.platform) q = q.eq('platform', params.platform);
    const { data, error } = await q;
    const ms = Date.now() - t0;
    if (error) return fail('message[]', error.message, ms);
    if (!data || data.length === 0) return fail('message[]', 'inbox_clear', ms);
    return ok('message[]', data, ms);
  },
};

// ── inbox.ai_flagged ─────────────────────────────────────────────────
export const ai_flagged_requests: Skill<{}, Array<any>> = {
  id: 'inbox.ai_flagged_requests',
  description: 'Messages the AI classifier flagged as task-requests, not yet converted.',
  kind: 'read',
  run: async (_p, ctx) => {
    const t0 = Date.now();
    const { data, error } = await ctx.db.from('communication_messages')
      .select('id, platform, from_name, subject, body_text, channel_name, ai_classification, received_at')
      .eq('tenant_id', ctx.tenantId)
      .neq('status', 'task_created')
      .filter('ai_classification->>should_create_task', 'eq', 'true')
      .order('received_at', { ascending: false })
      .limit(30);
    const ms = Date.now() - t0;
    if (error) return fail('message[]', error.message, ms);
    if (!data || data.length === 0) return fail('message[]', 'no_requests', ms);
    return ok('message[]', data, ms);
  },
};

// ── inbox.recent ─────────────────────────────────────────────────────
// Fetches the last N messages regardless of status. This is the
// "resumir inbox" / "qué cambió" catch-all that the old pending skill
// missed — the user wants to see ALL recent comms, not just unread.
export const recent_messages: Skill<{ platform?: 'gmail' | 'slack'; limit?: number }, Array<any>> = {
  id: 'inbox.recent',
  description: 'Last 30 messages across all platforms (mail + Slack), regardless of status.',
  kind: 'read',
  validate: (p: any) => ({ platform: p?.platform, limit: p?.limit }),
  run: async (params, ctx) => {
    const t0 = Date.now();
    const lim = Math.min(params.limit || 30, 50);
    let q = ctx.db.from('communication_messages')
      .select('id, platform, from_name, from_email, subject, body_text, channel_name, thread_id, received_at, status, ai_classification, matched_client_id')
      .eq('tenant_id', ctx.tenantId)
      .order('received_at', { ascending: false })
      .limit(lim);
    if (params.platform) q = q.eq('platform', params.platform);
    const { data, error } = await q;
    const ms = Date.now() - t0;
    if (error) return fail('message[]', error.message, ms);
    if (!data || data.length === 0) return fail('message[]', 'no_messages_found', ms);
    return ok('message[]', data, ms);
  },
};

// ── inbox.by_contact ─────────────────────────────────────────────────
// Search messages from/to a specific person — by name, email, or
// matched_client_id. Used by both the Home chat ("qué dijo Christie")
// and the Client detail page timeline.
export const messages_by_contact: Skill<
  { name?: string; email?: string; client_id?: string },
  Array<any>
> = {
  id: 'inbox.by_contact',
  description: 'Messages from/to a specific contact (by name, email, or client ID).',
  kind: 'read',
  validate: (p: any) => {
    if (!p?.name && !p?.email && !p?.client_id) {
      throw new Error('Need at least one of: name, email, client_id');
    }
    return { name: p.name, email: p.email, client_id: p.client_id };
  },
  run: async (params, ctx) => {
    const t0 = Date.now();
    let q = ctx.db.from('communication_messages')
      .select('id, platform, from_name, from_email, subject, body_text, channel_name, thread_id, received_at, status, ai_classification, matched_client_id')
      .eq('tenant_id', ctx.tenantId)
      .order('received_at', { ascending: false })
      .limit(30);
    if (params.client_id) {
      q = q.eq('matched_client_id', params.client_id);
    } else if (params.email) {
      q = q.ilike('from_email', `%${params.email}%`);
    } else if (params.name) {
      q = q.ilike('from_name', `%${params.name}%`);
    }
    const { data, error } = await q;
    const ms = Date.now() - t0;
    if (error) return fail('message[]', error.message, ms);
    if (!data || data.length === 0) return fail('message[]', 'no_messages_from_contact', ms);
    return ok('message[]', data, ms);
  },
};

// ── inbox.summary_stats ──────────────────────────────────────────────
// Quick aggregated counts — platform breakdown, how many pending,
// how many arrived today. Gives the LLM a fast overview without
// fetching individual rows.
export const summary_stats: Skill<{}, Record<string, any>> = {
  id: 'inbox.summary_stats',
  description: 'Quick inbox stats — total, pending, by platform, arrivals today.',
  kind: 'read',
  run: async (_p, ctx) => {
    const t0 = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    // Fetch all msgs from last 7 days for counting (cheaper than separate count queries)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await ctx.db.from('communication_messages')
      .select('id, platform, status, received_at')
      .eq('tenant_id', ctx.tenantId)
      .gte('received_at', weekAgo)
      .order('received_at', { ascending: false });
    const ms = Date.now() - t0;
    if (error) return fail('stats', error.message, ms);
    const all = data || [];
    const stats = {
      total_7d: all.length,
      pending: all.filter(m => m.status === 'pending').length,
      done: all.filter(m => m.status === 'done' || m.status === 'archived').length,
      task_created: all.filter(m => m.status === 'task_created').length,
      today: all.filter(m => m.received_at >= todayIso).length,
      by_platform: {
        gmail: all.filter(m => m.platform === 'gmail').length,
        slack: all.filter(m => m.platform === 'slack').length,
      },
    };
    return ok('stats', stats, ms);
  },
};

// ── inbox.slack_channels ─────────────────────────────────────────────
// Recent Slack messages grouped by channel — useful for "resumir Slack"
export const slack_channels: Skill<{}, Array<any>> = {
  id: 'inbox.slack_channels',
  description: 'Recent Slack messages grouped by channel with last activity.',
  kind: 'read',
  run: async (_p, ctx) => {
    const t0 = Date.now();
    const { data, error } = await ctx.db.from('communication_messages')
      .select('id, from_name, from_email, subject, body_text, channel_name, channel_id, received_at, status, ai_classification')
      .eq('tenant_id', ctx.tenantId)
      .eq('platform', 'slack')
      .order('received_at', { ascending: false })
      .limit(50);
    const ms = Date.now() - t0;
    if (error) return fail('channel_group[]', error.message, ms);
    if (!data || data.length === 0) return fail('channel_group[]', 'no_slack_messages', ms);

    // Group by channel
    const channelMap = new Map<string, { channel: string; messages: typeof data }>();
    for (const msg of data) {
      const ch = msg.channel_name || msg.channel_id || 'DM';
      if (!channelMap.has(ch)) channelMap.set(ch, { channel: ch, messages: [] });
      channelMap.get(ch)!.messages.push(msg);
    }
    const grouped = Array.from(channelMap.values())
      .sort((a, b) => b.messages.length - a.messages.length);
    return ok('channel_group[]', grouped, ms);
  },
};

export const inboxSkills = [
  pending_messages,
  ai_flagged_requests,
  recent_messages,
  messages_by_contact,
  summary_stats,
  slack_channels,
];

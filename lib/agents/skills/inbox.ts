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
import {
  groupCommunicationMessages,
  isMessageHandled,
  needsMessageFollowUp,
} from '../../communications/conversations';

const ok = <T>(kind: SkillResult<T>['kind'], data: T, ms?: number): SkillResult<T> =>
  ({ ok: true, kind, data, ms });
const fail = (kind: SkillResult<any>['kind'], reason: string, ms?: number): SkillResult<any> =>
  ({ ok: false, kind, reason, ms });

const MESSAGE_SELECT = 'id, platform, from_name, from_email, subject, body_text, channel_id, channel_name, thread_id, external_id, received_at, status, ai_classification, matched_client_id, matched_project_id, replied_in_platform, reply_count, last_reply_at';

// Deterministic relative-time label, computed in code from received_at.
// The LLM must NOT compute times itself — it hallucinates "hace 2h" for
// messages that are days old. It only ever copies this string verbatim.
function relativeEs(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return 'recién';
  if (diffMin < 60) return `hace ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// Tenant team emails. A teammate's OWN message is OUTBOUND (not a pending
// request). We match by email because profiles.slack_user_id is usually empty,
// so slack-sync's reply detection never fires — that's why the team's own
// messages were being flagged as "pending/urgent" forever.
async function fetchTeamEmails(ctx: ExecutionContext): Promise<Set<string>> {
  try {
    const { data: members } = await ctx.db.from('tenant_members').select('user_id').eq('tenant_id', ctx.tenantId);
    const ids = (members || []).map((m: any) => m.user_id).filter(Boolean);
    if (ids.length === 0) return new Set();
    const { data: profs } = await ctx.db.from('profiles').select('email').in('id', ids);
    return new Set((profs || []).map((p: any) => String(p.email || '').toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

// Tag teammate-authored messages as outbound + handled (in memory only — never
// written to the DB) so grouping / follow-up logic never counts them as a
// pending request needing our reply.
const tagTeamOutbound = (messages: any[], teamEmails: Set<string>): any[] =>
  (messages || []).map(m => {
    const fromTeam = teamEmails.size > 0 && teamEmails.has(String(m.from_email || '').toLowerCase());
    if (!fromTeam) return { ...m, from_team: false };
    const pendingish = ['pending', 'snoozed'].includes(String(m.status || '').toLowerCase());
    return { ...m, from_team: true, direction: 'outbound', status: pendingish ? 'auto_resolved' : m.status };
  });

const annotateMessage = (message: any) => ({
  ...message,
  handled: isMessageHandled(message),
  needs_follow_up: needsMessageFollowUp(message),
  received_label: relativeEs(message.received_at),
});

// ── inbox.pending ────────────────────────────────────────────────────
export const pending_messages: Skill<{ platform?: 'gmail' | 'slack' }, Array<any>> = {
  id: 'inbox.pending',
  description: 'Inbound messages still pending action (not replied, not archived).',
  kind: 'read',
  validate: (p: any) => ({ platform: p?.platform }),
  run: async (params, ctx) => {
    const t0 = Date.now();
    let q = ctx.db.from('communication_messages')
      .select(MESSAGE_SELECT)
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'pending')
      .order('received_at', { ascending: false })
      .limit(40);
    if (params.platform) q = q.eq('platform', params.platform);
    const { data, error } = await q;
    const ms = Date.now() - t0;
    if (error) return fail('message[]', error.message, ms);
    if (!data || data.length === 0) return fail('message[]', 'inbox_clear', ms);
    return ok('message[]', data.map(annotateMessage), ms);
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
      .select(MESSAGE_SELECT)
      .eq('tenant_id', ctx.tenantId)
      .neq('status', 'task_created')
      .filter('ai_classification->>should_create_task', 'eq', 'true')
      .order('received_at', { ascending: false })
      .limit(30);
    const ms = Date.now() - t0;
    if (error) return fail('message[]', error.message, ms);
    if (!data || data.length === 0) return fail('message[]', 'no_requests', ms);
    return ok('message[]', data.map(annotateMessage), ms);
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
      .select(MESSAGE_SELECT)
      .eq('tenant_id', ctx.tenantId)
      .order('received_at', { ascending: false })
      .limit(lim);
    if (params.platform) q = q.eq('platform', params.platform);
    const { data, error } = await q;
    const ms = Date.now() - t0;
    if (error) return fail('message[]', error.message, ms);
    if (!data || data.length === 0) return fail('message[]', 'no_messages_found', ms);
    return ok('message[]', data.map(annotateMessage), ms);
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
      .select(MESSAGE_SELECT)
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
    return ok('message[]', data.map(annotateMessage), ms);
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
      .select('id, platform, status, received_at, ai_classification, replied_in_platform, reply_count, thread_id, channel_id, channel_name, from_name, from_email, subject, body_text')
      .eq('tenant_id', ctx.tenantId)
      .gte('received_at', weekAgo)
      .order('received_at', { ascending: false });
    const ms = Date.now() - t0;
    if (error) return fail('stats', error.message, ms);
    const teamEmails = await fetchTeamEmails(ctx);
    const all = tagTeamOutbound(data || [], teamEmails);
    // Only inbound (external) messages count toward "pending / needs reply".
    const inbound = all.filter((m: any) => !m.from_team);
    const groups = groupCommunicationMessages(all);
    const stats = {
      total_7d: all.length,
      inbound_7d: inbound.length,
      pending: inbound.filter((m: any) => m.status === 'pending').length,
      handled: all.filter(isMessageHandled).length,
      needs_follow_up: inbound.filter(needsMessageFollowUp).length,
      conversations_7d: groups.length,
      conversations_need_follow_up: groups.filter(g => g.followups > 0).length,
      task_created: all.filter((m: any) => m.status === 'task_created').length,
      today: inbound.filter((m: any) => m.received_at >= todayIso).length,
      by_platform: {
        gmail: inbound.filter((m: any) => m.platform === 'gmail').length,
        slack: inbound.filter((m: any) => m.platform === 'slack').length,
      },
    };
    return ok('stats', stats, ms);
  },
};

// Recent messages grouped into cross-platform conversations. This gives
// the LLM the same shape the UI uses: Gmail threads and Slack threads,
// with handled/follow-up state already computed.
export const conversation_summary: Skill<{ platform?: 'gmail' | 'slack'; limit?: number }, Array<any>> = {
  id: 'inbox.conversation_summary',
  description: 'Recent Gmail and Slack messages grouped by conversation/thread with follow-up state.',
  kind: 'read',
  validate: (p: any) => ({ platform: p?.platform, limit: p?.limit }),
  run: async (params, ctx) => {
    const t0 = Date.now();
    const lim = Math.min(params.limit || 120, 200);
    let q = ctx.db.from('communication_messages')
      .select(MESSAGE_SELECT)
      .eq('tenant_id', ctx.tenantId)
      .neq('status', 'archived')
      .order('received_at', { ascending: false })
      .limit(lim);
    if (params.platform) q = q.eq('platform', params.platform);
    const { data, error } = await q;
    const ms = Date.now() - t0;
    if (error) return fail('conversation_group[]', error.message, ms);
    if (!data || data.length === 0) return fail('conversation_group[]', 'no_conversations_found', ms);

    const teamEmails = await fetchTeamEmails(ctx);
    const grouped = groupCommunicationMessages(tagTeamOutbound(data, teamEmails).map(annotateMessage)).slice(0, 25).map(group => ({
      key: group.key,
      platform: group.platform,
      title: group.title,
      source: group.sourceLabel,
      participants: group.participants.slice(0, 5),
      total_messages: group.total,
      // If WE sent the latest message, the conversation is handled (ball in
      // their court) — zero out the "needs our reply" signals.
      pending_messages: (group.latest as any)?.from_team ? 0 : group.pending,
      handled_messages: group.handled,
      needs_follow_up: (group.latest as any)?.from_team ? 0 : group.followups,
      urgent_messages: (group.latest as any)?.from_team ? 0 : group.urgent,
      last_from_team: (group.latest as any)?.from_team === true,
      latest_at: group.latest?.received_at || null,
      latest_label: relativeEs(group.latest?.received_at || null),
      latest_summary: group.latest?.ai_classification?.summary || group.latest?.body_text || group.latest?.subject || null,
      messages: group.messages.slice(0, 6).map((message: any) => ({
        id: message.id,
        from: message.from_name || message.from_email || message.channel_name || 'Unknown',
        from_team: message.from_team === true,
        status: message.status,
        handled: message.handled,
        needs_follow_up: message.needs_follow_up,
        replied_in_platform: message.replied_in_platform === true,
        reply_count: message.reply_count || 0,
        received_at: message.received_at,
        received_label: relativeEs(message.received_at),
        summary: message.ai_classification?.summary || String(message.body_text || message.subject || '').slice(0, 240),
        intent: message.ai_classification?.intent || null,
        priority: message.ai_classification?.priority || null,
        matched_client_id: message.matched_client_id || null,
        matched_project_id: message.matched_project_id || null,
      })),
    }));
    return ok('conversation_group[]', grouped, ms);
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
      .select(MESSAGE_SELECT)
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
      channelMap.get(ch)!.messages.push(annotateMessage(msg));
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
  conversation_summary,
  messages_by_contact,
  summary_stats,
  slack_channels,
];

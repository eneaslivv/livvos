/**
 * Slack — frontend helpers.
 *
 * Same architecture as gmail.ts: OAuth + raw Slack API calls happen in
 * Supabase Edge Functions (Phase 2). The frontend just kicks off the
 * connect flow and reads results back from our DB.
 */

import { supabase } from '../supabase';
import type { CommunicationMessage, SlackMonitoredChannel } from '../../types/communications';

// ── OAuth connect URL ─────────────────────────────────────────────────────
export async function getSlackConnectUrl(tenantId: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-connect?tenant_id=${tenantId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`slack-connect failed: ${res.status}`);
  const { auth_url } = await res.json();
  return auth_url as string;
}

// ── List Slack channels available for monitoring ──────────────────────────
// Edge fn: slack-channels — lists channels the bot has access to AND
// returns the bot's actual identity (so the UI can show the exact
// `/invite @<handle>` command instead of guessing from the workspace name).
// Frontend uses this to populate the multi-select in IntegrationSettings
// + render the invite hint.
export interface AvailableSlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
  num_members: number | null;
}

export interface SlackBotIdentity {
  user_id: string;
  /** The legacy username — what /invite @<this> actually accepts. */
  handle: string | null;
  /** What Slack shows in messages/UI. */
  display_name: string | null;
}

export interface SlackChannelsResult {
  bot: SlackBotIdentity | null;
  channels: AvailableSlackChannel[];
}

export async function listAvailableSlackChannels(
  tenantId: string,
  integrationTokenId: string,
): Promise<SlackChannelsResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-channels?tenant_id=${tenantId}&integration_token_id=${integrationTokenId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`slack-channels failed: ${res.status}`);
  const data = await res.json() as Partial<SlackChannelsResult>;
  return {
    bot: data.bot || null,
    channels: data.channels || [],
  };
}

// ── Toggle which channels are monitored ───────────────────────────────────
// Direct Supabase mutation — no edge fn needed. RLS already scopes to the
// caller's tenant.
//
// Now preserves the project_id mapping per channel: we read the existing
// rows BEFORE deleting and carry their project_id into the inserts. So
// re-toggling a channel doesn't wipe the channel→project link the user
// already configured.
export async function setMonitoredChannels(
  tenantId: string,
  integrationTokenId: string,
  channels: AvailableSlackChannel[],
): Promise<SlackMonitoredChannel[]> {
  // 1. Snapshot existing project_id mappings keyed by channel_id so we can
  //    re-apply them after the replace-all.
  const { data: existing } = await supabase
    .from('slack_monitored_channels')
    .select('channel_id, project_id')
    .eq('integration_token_id', integrationTokenId);
  const projectByChannel = new Map<string, string | null>();
  (existing || []).forEach((r: any) => {
    if (r.project_id) projectByChannel.set(r.channel_id, r.project_id);
  });

  const { error: delErr } = await supabase
    .from('slack_monitored_channels')
    .delete()
    .eq('integration_token_id', integrationTokenId);
  if (delErr) throw delErr;

  if (channels.length === 0) return [];
  const { data, error } = await supabase
    .from('slack_monitored_channels')
    .insert(
      channels.map(c => ({
        tenant_id: tenantId,
        integration_token_id: integrationTokenId,
        channel_id: c.id,
        channel_name: c.name,
        channel_type: c.is_private ? 'private' : 'public',
        is_active: true,
        project_id: projectByChannel.get(c.id) || null,
      })),
    )
    .select();
  if (error) throw error;
  return data as SlackMonitoredChannel[];
}

// ── Update which events a monitored channel subscribes to ────────────────
// notify_events is a jsonb array of SlackProjectEvent strings. Default at
// migration time is ["task_completed","milestone_paid","project_completed"]
// (task_created OFF). Use this helper to flip individual events on/off.
export async function setSlackChannelNotifyEvents(
  monitoredChannelRowId: string,
  events: SlackProjectEvent[],
): Promise<void> {
  const { error } = await supabase
    .from('slack_monitored_channels')
    .update({ notify_events: events })
    .eq('id', monitoredChannelRowId);
  if (error) throw error;
}

// ── Link a monitored channel to a project (or unlink with null) ──────────
// Updates slack_monitored_channels.project_id directly. After this call
// every NEW message arriving from that channel will have its
// matched_project_id auto-populated by slack-events / slack-sync.
//
// Existing messages from before the link are not retroactively re-tagged
// (they were classified at insert time). If you need to backfill, run
// an UPDATE manually or ask the AI to re-classify.
export async function linkSlackChannelToProject(
  monitoredChannelRowId: string,
  projectId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('slack_monitored_channels')
    .update({ project_id: projectId })
    .eq('id', monitoredChannelRowId);
  if (error) throw error;
}

// ── Post a message INTO a Slack channel (outbound) ────────────────────────
// Edge fn: slack-notify — uses the connected workspace's bot token to call
// chat.postMessage. Used for manual "send to channel" actions and for
// automatic notifications (new lead, approved proposal, etc).
//
// channel_id is optional: when omitted we use the per-workspace default
// stored in integration_tokens.slack_notify_channel_id (set in Settings).
export async function postToSlack(args: {
  tenantId: string;
  channelId?: string;
  text: string;
  blocks?: any[];
  integrationTokenId?: string;
}): Promise<{ ok: true; ts: string; channel: string; workspace?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-notify`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: args.tenantId,
        channel_id: args.channelId,
        text: args.text,
        blocks: args.blocks,
        integration_token_id: args.integrationTokenId,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `slack-notify failed: ${res.status}`);
  }
  return res.json();
}

// ── Set / clear the default notification channel for a workspace ─────────
// Direct table update — no edge fn needed. RLS scopes to the caller's tenant.
// Pass null to clear it (notifications won't auto-send anywhere until reset).
export async function setSlackNotifyChannel(
  integrationTokenId: string,
  channelId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('integration_tokens')
    .update({ slack_notify_channel_id: channelId })
    .eq('id', integrationTokenId);
  if (error) throw error;
}

// ── Notify Slack when something happens to a project ─────────────────────
// Generic dispatcher: looks up every active channel linked to the project,
// filters by per-channel `notify_events` jsonb subscription, builds the
// right Block Kit message per event type, and posts via slack-notify.
//
// Best-effort: errors are collected, never thrown. A failed Slack post
// never blocks the underlying mutation (task save / income save / etc).
//
// Supported events:
//   - task_created       a new task was added under the project
//   - task_completed     a task transitioned to status='done'
//   - milestone_paid     an income installment was marked paid
//   - project_completed  the project itself moved to status='Completed'
export type SlackProjectEvent =
  | 'task_created'
  | 'task_completed'
  | 'milestone_paid'
  | 'project_completed';

export interface SlackProjectEventPayload {
  tenantId: string;
  projectId: string;
  event: SlackProjectEvent;
  /** What this event is about — title of the task / income / project. */
  itemTitle: string;
  /** Optional pre-resolved project name; auto-fetched if missing. */
  projectName?: string | null;
  /** Optional actor (e.g. 'Eneas Aldabe'). Renders as a context line. */
  actorName?: string | null;
  /** Optional money amount for milestone_paid (e.g. 2300). */
  amount?: number | null;
  currency?: string | null;
  /** Optional priority — surfaced as a small badge for task_created. */
  priority?: string | null;
}

interface EventCopy { emoji: string; headline: string }

const EVENT_COPY: Record<SlackProjectEvent, EventCopy> = {
  task_created:       { emoji: '🆕', headline: 'Nueva tarea' },
  task_completed:     { emoji: '✅', headline: 'Tarea completada' },
  milestone_paid:     { emoji: '💰', headline: 'Cuota cobrada' },
  project_completed:  { emoji: '🏁', headline: 'Proyecto completado' },
};

const fmtMoney = (n: number, curr: string) =>
  `${curr} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export async function notifySlackProjectEvent(payload: SlackProjectEventPayload): Promise<{ posted: number; errors: string[] }> {
  const errors: string[] = [];
  if (!payload.projectId) return { posted: 0, errors };

  // 1. All active channels linked to this project.
  const { data: links, error } = await supabase
    .from('slack_monitored_channels')
    .select('channel_id, channel_name, integration_token_id, notify_events')
    .eq('tenant_id', payload.tenantId)
    .eq('project_id', payload.projectId)
    .eq('is_active', true);
  if (error) {
    errors.push(error.message);
    return { posted: 0, errors };
  }
  if (!links || links.length === 0) return { posted: 0, errors };

  // 2. Filter by per-channel event subscription.
  const subscribed = links.filter((l: any) => {
    const events = Array.isArray(l.notify_events) ? l.notify_events : [];
    return events.includes(payload.event);
  });
  if (subscribed.length === 0) return { posted: 0, errors };

  // 3. Resolve project name on demand.
  let projectName = payload.projectName ?? null;
  if (!projectName) {
    try {
      const { data: proj } = await supabase
        .from('projects').select('title').eq('id', payload.projectId).maybeSingle();
      projectName = (proj as any)?.title || null;
    } catch { /* ignore */ }
  }

  // 4. Build the message.
  const copy = EVENT_COPY[payload.event];
  const projectLine = projectName ? `_${projectName}_` : '';
  const amountLine = (payload.amount != null && payload.amount > 0)
    ? `\n*${fmtMoney(payload.amount, payload.currency || 'USD')}*`
    : '';
  const priorityBadge = payload.priority && payload.priority !== 'medium'
    ? ` · prioridad ${payload.priority}` : '';

  const text = `${copy.emoji} ${copy.headline} — ${payload.itemTitle}`;
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${copy.emoji} ${copy.headline}\n*${payload.itemTitle}*${amountLine}${projectLine ? `\n${projectLine}` : ''}`,
      },
    },
  ];
  const contextLines: string[] = [];
  if (payload.actorName) contextLines.push(`Por ${payload.actorName}`);
  if (priorityBadge) contextLines.push(priorityBadge.replace(' · ', ''));
  if (contextLines.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: contextLines.join(' · ') }],
    });
  }

  // 5. Post to each subscribed channel.
  let posted = 0;
  for (const link of subscribed) {
    try {
      await postToSlack({
        tenantId: payload.tenantId,
        channelId: link.channel_id,
        text,
        blocks,
        integrationTokenId: link.integration_token_id || undefined,
      });
      posted++;
    } catch (err: any) {
      errors.push(`#${link.channel_name}: ${err?.message || 'failed'}`);
    }
  }
  return { posted, errors };
}

// Back-compat shim — keeps the older callsite working until we delete it.
// New code should call notifySlackProjectEvent directly.
export async function notifyTaskCompletedToSlack(args: {
  tenantId: string;
  task: { id: string; title: string; project_id?: string | null };
  projectName?: string | null;
  completedByName?: string;
}): Promise<{ posted: number; errors: string[] }> {
  if (!args.task.project_id) return { posted: 0, errors: [] };
  return notifySlackProjectEvent({
    tenantId: args.tenantId,
    projectId: args.task.project_id,
    event: 'task_completed',
    itemTitle: args.task.title,
    projectName: args.projectName,
    actorName: args.completedByName || null,
  });
}

// ── Pull recent messages from monitored channels ──────────────────────────
// Edge fn: slack-sync — calls conversations.history on each channel listed
// in slack_monitored_channels and inserts new messages into
// communication_messages. Idempotent (deduped by channel_id:ts).
//
// Called from the manual "Sync now" button AND from the auto-poll interval
// in pages/Communications.tsx.
export async function syncSlack(
  tenantId: string,
  opts: { hours?: number } = {},
): Promise<{ synced: number; errors: string[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-sync`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenant_id: tenantId, hours: opts.hours ?? 24 }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `slack-sync failed: ${res.status}`);
  }
  return res.json();
}

// ── Send Slack reply ──────────────────────────────────────────────────────
// Same edge fn as gmail (comm-reply) — it routes by platform.
export async function sendSlackReply(args: {
  message_id: string;
  body: string;
  edited_from_draft?: boolean;
}): Promise<CommunicationMessage> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comm-reply`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `comm-reply failed: ${res.status}`);
  }
  return res.json();
}

// ── Display helpers ───────────────────────────────────────────────────────
/** Slack messages can use mrkdwn — extract a plain preview for the inbox list. */
export function slackTextToPreview(text: string): string {
  if (!text) return '';
  return text
    // <@U123|name> → @name
    .replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_, _id, name) => `@${name || 'user'}`)
    // <#C123|chan> → #chan
    .replace(/<#([A-Z0-9]+)(?:\|([^>]+))?>/g, (_, _id, name) => `#${name || 'channel'}`)
    // <https://example.com|label> → label, <https://example.com> → URL
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    // basic mrkdwn → plain
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

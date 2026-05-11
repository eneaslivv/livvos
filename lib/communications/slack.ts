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
// Edge fn: slack-channels — lists channels the bot has access to. Frontend
// uses this to populate the multi-select in IntegrationSettings.
export interface AvailableSlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
  num_members: number | null;
}
export async function listAvailableSlackChannels(
  tenantId: string,
  integrationTokenId: string,
): Promise<AvailableSlackChannel[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-channels?tenant_id=${tenantId}&integration_token_id=${integrationTokenId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`slack-channels failed: ${res.status}`);
  const { channels } = await res.json();
  return channels as AvailableSlackChannel[];
}

// ── Toggle which channels are monitored ───────────────────────────────────
// Direct Supabase mutation — no edge fn needed. RLS already scopes to the
// caller's tenant.
export async function setMonitoredChannels(
  tenantId: string,
  integrationTokenId: string,
  channels: AvailableSlackChannel[],
): Promise<SlackMonitoredChannel[]> {
  // Replace-all semantics: delete the existing rows for this integration,
  // insert the new set. Simpler than diffing in the UI.
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
      })),
    )
    .select();
  if (error) throw error;
  return data as SlackMonitoredChannel[];
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

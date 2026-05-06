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

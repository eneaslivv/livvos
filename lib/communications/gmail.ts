/**
 * Gmail — frontend helpers.
 *
 * NOTE on architecture: in eneas-os, anything that needs OAuth secrets or
 * the Gmail API itself runs in Supabase Edge Functions (Deno). The
 * frontend never holds Google client secrets or makes raw Gmail API
 * calls. This file only:
 *
 *   1. Builds the OAuth "connect" redirect URL the user clicks
 *   2. Talks to our own edge functions (gmail-sync, gmail-reply, etc)
 *      which handle the heavy lifting
 *   3. Provides parsing helpers shared between frontend + edge fn
 *
 * The Gmail API client itself (googleapis SDK) lives in the edge
 * functions, not here. Phase 2 will add those edge functions.
 */

import { supabase } from '../supabase';
import type { CommunicationMessage } from '../../types/communications';

// ── OAuth connect URL ─────────────────────────────────────────────────────
// The actual OAuth dance happens in supabase/functions/gmail-connect (Phase
// 2). We just call that endpoint to get a URL we can window.location to.
export async function getGmailConnectUrl(tenantId: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-connect?tenant_id=${tenantId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`gmail-connect failed: ${res.status}`);
  const { auth_url } = await res.json();
  return auth_url as string;
}

// ── Manual sync trigger ───────────────────────────────────────────────────
// Useful in dev (where Pub/Sub webhooks aren't configured) and as a "Sync
// now" button in the settings UI. Edge function: gmail-sync.
export async function syncGmail(
  tenantId: string,
  opts?: { limit?: number },
): Promise<{ synced: number; errors: string[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-sync`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tenant_id: tenantId, limit: opts?.limit ?? 50 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `gmail-sync failed: ${res.status}`);
  }
  return res.json();
}

// ── Send reply ────────────────────────────────────────────────────────────
// Edge fn: comm-reply. Routes to either Gmail or Slack based on the
// message's platform. Frontend wrapper here for type safety.
export async function sendGmailReply(args: {
  message_id: string;
  body: string;
  /** Optional override of the AI-suggested edited_text we store as audit. */
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

// ── Body parsing (used by both frontend display + edge fn ingestion) ──────
// Gmail returns body as a base64url-encoded string inside a MIME part tree.
// This lives here so both sides can use it; the edge function imports
// directly from a shared deno-compatible variant (Phase 2).

/** Strip HTML tags + collapse whitespace for a plaintext preview. */
export function htmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extract a short preview from a message body (first ~140 chars, no quoted reply chains). */
export function previewFromBody(body: string): string {
  if (!body) return '';
  // Drop quoted reply blocks (lines starting with > or "On <date>, <name> wrote:")
  const lines = body
    .split('\n')
    .filter(l => !l.startsWith('>'))
    .filter(l => !/^On .+ wrote:$/.test(l.trim()))
    .filter(l => l.trim().length > 0);
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 140 ? text.slice(0, 137) + '…' : text;
}

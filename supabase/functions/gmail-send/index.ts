// gmail-send — send a NEW email (not a reply to an existing thread) using
// the caller's connected Gmail OAuth token. Companion to comm-reply, which
// only handles replies in an existing thread.
//
// POST { tenant_id, to, subject, body, cc?, bcc?, integration_token_id? }
// Returns: { ok: true, external_id, thread_id, communication_message_id }
//
// Behavior:
//   - Authenticates the caller via the standard authenticate() helper.
//   - Looks up the caller's active Gmail integration_token (or the one
//     they explicitly named via integration_token_id).
//   - Refreshes the token if it's expired.
//   - Builds an RFC 2822 message + sends via gmail.users.messages.send.
//   - Records an outbound row in communication_messages so the message
//     shows up in the user's Inbox view alongside replies.
import { authenticate, adminClient, ensureFreshGmailToken, json, commCorsHeaders } from '../_shared/comm-utils.ts'

interface SendArgs {
  tenant_id: string
  to: string                    // single address or comma-separated list
  subject: string
  body: string                  // plain text for now (HTML can come later)
  cc?: string
  bcc?: string
  integration_token_id?: string // optional: pick a specific Gmail account
}

function buildRfc2822(args: {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  fromEmail: string
  fromName?: string
}): string {
  const lines: string[] = []
  const fromHeader = args.fromName ? `${args.fromName} <${args.fromEmail}>` : args.fromEmail
  lines.push(`From: ${fromHeader}`)
  lines.push(`To: ${args.to}`)
  if (args.cc) lines.push(`Cc: ${args.cc}`)
  if (args.bcc) lines.push(`Bcc: ${args.bcc}`)
  lines.push(`Subject: ${args.subject || '(no subject)'}`)
  lines.push('MIME-Version: 1.0')
  lines.push('Content-Type: text/plain; charset="UTF-8"')
  lines.push('Content-Transfer-Encoding: 7bit')
  lines.push('')
  lines.push(args.body)
  return lines.join('\r\n')
}

const b64url = (str: string): string => {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendGmail(accessToken: string, opts: {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  fromEmail: string
  fromName?: string
}): Promise<{ external_id: string; thread_id: string }> {
  const raw = buildRfc2822(opts)
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: b64url(raw) }),
  })
  if (!res.ok) {
    const err = (await res.text()).slice(0, 200)
    throw new Error(`Gmail send failed: ${res.status} — ${err}`)
  }
  const data = await res.json() as { id: string; threadId: string }
  return { external_id: data.id, thread_id: data.threadId }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: commCorsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  try {
    const args = await req.json() as SendArgs
    if (!args.tenant_id || !args.to?.trim() || !args.body?.trim()) {
      return json({ error: 'tenant_id + to + body required' }, 400)
    }

    // Validate the caller is a member of args.tenant_id specifically (not just
    // any tenant they belong to), then use the validated ctx.tenant_id for every
    // lookup/write below — never the raw args.tenant_id. Otherwise a member of
    // tenant A who knows tenant B's id could send mail from / log rows into B.
    const ctx = await authenticate(req, args.tenant_id)
    const admin = adminClient()

    // Resolve which Gmail token to use. If the caller named one explicitly
    // we honour it; otherwise pick the most-recently connected active one.
    let tokenQuery = admin.from('integration_tokens')
      .select('id, tenant_id, access_token, refresh_token, expires_at, gmail_email')
      .eq('platform', 'gmail')
      .eq('tenant_id', ctx.tenant_id)
      .eq('is_active', true)
      .order('connected_at', { ascending: false })
      .limit(1)
    if (args.integration_token_id) {
      tokenQuery = admin.from('integration_tokens')
        .select('id, tenant_id, access_token, refresh_token, expires_at, gmail_email')
        .eq('id', args.integration_token_id)
        .eq('platform', 'gmail')
        .eq('tenant_id', ctx.tenant_id)
        .eq('is_active', true)
        .limit(1)
    }
    const { data: tokens, error: tokenErr } = await tokenQuery
    if (tokenErr) throw tokenErr
    const token = (tokens && tokens[0]) as any
    if (!token) {
      return json({ error: 'No active Gmail account connected for this tenant' }, 400)
    }

    // Refresh token if expired (returns the latest valid access_token)
    const accessToken = await ensureFreshGmailToken(admin, token)

    // Resolve caller display name — best effort, used in the From header
    let fromName: string | undefined
    try {
      const { data: prof } = await admin.from('profiles').select('name').eq('id', ctx.user_id).maybeSingle()
      fromName = (prof as any)?.name || undefined
    } catch { /* ignore */ }

    const sent = await sendGmail(accessToken, {
      to: args.to.trim(),
      cc: args.cc?.trim() || undefined,
      bcc: args.bcc?.trim() || undefined,
      subject: args.subject || '(no subject)',
      body: args.body,
      fromEmail: token.gmail_email,
      fromName,
    })

    // Persist the outbound message so it shows up in the Inbox view.
    const nowIso = new Date().toISOString()
    const { data: msg, error: insertErr } = await admin.from('communication_messages').insert({
      tenant_id: ctx.tenant_id,
      integration_token_id: token.id,
      platform: 'gmail',
      direction: 'outbound',
      external_id: sent.external_id,
      thread_id: sent.thread_id,
      from_email: token.gmail_email,
      from_name: fromName || null,
      to_email: args.to,
      subject: args.subject,
      body_text: args.body,
      sent_at: nowIso,
      received_at: nowIso, // keep outbound rows sortable in the inbox timeline (ordered by received_at)
      status: 'sent',
      replied_by: ctx.user_id,
      replied_at: nowIso,
    }).select('id').maybeSingle()
    if (insertErr) {
      // The mail went out, just couldn't log it — return success but flag it
      return json({
        ok: true, external_id: sent.external_id, thread_id: sent.thread_id,
        warning: 'mail sent but inbox row could not be saved: ' + insertErr.message,
      })
    }

    return json({
      ok: true,
      external_id: sent.external_id,
      thread_id: sent.thread_id,
      communication_message_id: (msg as any)?.id || null,
    })
  } catch (err) {
    return json({ error: (err as Error).message || 'gmail-send failed' }, 500)
  }
})

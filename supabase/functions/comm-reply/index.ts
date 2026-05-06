// Unified reply sender — Gmail OR Slack, routed by the message's platform.
//
// POST { message_id: string, body: string, edited_from_draft?: boolean }
// Returns the updated CommunicationMessage row (status='replied').
//
// Behavior:
//   - Looks up the message + the integration_token that owns it
//   - For Gmail: builds a properly-encoded RFC 2822 message + sends via
//     gmail.users.messages.send with threadId set so it lands in the
//     same thread
//   - For Slack: sends via chat.postMessage with thread_ts when the
//     original was a thread reply, otherwise as a top-level message
//   - Records a reply_drafts row for audit (so we know what was AI vs
//     user-edited)
//   - Updates the message: status='replied', replied_at, replied_by,
//     reply_sent

import { authenticate, adminClient, ensureFreshGmailToken, json, commCorsHeaders } from '../_shared/comm-utils.ts'

interface ReplyArgs {
  message_id: string
  body: string
  edited_from_draft?: boolean
}

// ── Gmail send ───────────────────────────────────────────────────────
function buildRfc2822(args: {
  to: string
  subject: string
  inReplyTo?: string
  references?: string
  body: string
  fromEmail: string
  fromName?: string
}): string {
  const lines: string[] = []
  const fromHeader = args.fromName ? `${args.fromName} <${args.fromEmail}>` : args.fromEmail
  lines.push(`From: ${fromHeader}`)
  lines.push(`To: ${args.to}`)
  // Reply prefix only if the original subject didn't already have one.
  const subj = /^re:/i.test(args.subject) ? args.subject : `Re: ${args.subject || '(no subject)'}`
  lines.push(`Subject: ${subj}`)
  if (args.inReplyTo) lines.push(`In-Reply-To: ${args.inReplyTo}`)
  if (args.references) lines.push(`References: ${args.references}`)
  lines.push('MIME-Version: 1.0')
  lines.push('Content-Type: text/plain; charset="UTF-8"')
  lines.push('Content-Transfer-Encoding: 7bit')
  lines.push('')
  lines.push(args.body)
  return lines.join('\r\n')
}

const b64url = (str: string): string => {
  const bytes = new TextEncoder().encode(str)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendGmail(accessToken: string, opts: {
  threadId: string | null
  to: string
  subject: string
  body: string
  fromEmail: string
  fromName?: string
  inReplyTo?: string
  references?: string
}): Promise<{ external_id: string; thread_id: string }> {
  const raw = buildRfc2822(opts)
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: b64url(raw),
      threadId: opts.threadId || undefined,
    }),
  })
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} — ${(await res.text()).slice(0, 120)}`)
  const data = await res.json() as { id: string; threadId: string }
  return { external_id: data.id, thread_id: data.threadId }
}

// ── Slack send ───────────────────────────────────────────────────────
async function sendSlack(botToken: string, opts: {
  channel: string
  text: string
  thread_ts?: string
}): Promise<{ external_id: string; thread_id: string | null }> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: opts.channel,
      text: opts.text,
      ...(opts.thread_ts ? { thread_ts: opts.thread_ts } : {}),
    }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack send failed: ${data.error}`)
  return { external_id: data.ts, thread_id: data.thread_ts || null }
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: commCorsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  try {
    const { message_id, body, edited_from_draft } = await req.json() as ReplyArgs
    if (!message_id || !body?.trim()) return json({ error: 'message_id + non-empty body required' }, 400)

    const ctx = await authenticate(req)
    const admin = adminClient()

    // Fetch the message we're replying to.
    const { data: msg, error: msgErr } = await admin
      .from('communication_messages')
      .select('*')
      .eq('id', message_id)
      .eq('tenant_id', ctx.tenant_id)
      .maybeSingle()
    if (msgErr) return json({ error: msgErr.message }, 500)
    if (!msg) return json({ error: 'Message not found' }, 404)

    // Find the integration token that received it.
    let tokenQuery = admin
      .from('integration_tokens')
      .select('*')
      .eq('tenant_id', ctx.tenant_id)
      .eq('platform', msg.platform)
      .eq('is_active', true)
    if (msg.platform === 'gmail') tokenQuery = tokenQuery.eq('gmail_email', msg.from_email || msg.from_id)
    // (For Gmail we can't perfectly know which connected mailbox received
    // it; for now we pick by from_email match if available, falling back
    // to the first active gmail token. A better approach would be to
    // store the receiving inbox on the message at ingest time — Phase 2.5.)

    const { data: tokens } = await tokenQuery
    let tok = tokens?.[0]

    if (!tok && msg.platform === 'gmail') {
      // Fallback: any active Gmail token for this tenant.
      const { data: any } = await admin
        .from('integration_tokens')
        .select('*')
        .eq('tenant_id', ctx.tenant_id)
        .eq('platform', 'gmail')
        .eq('is_active', true)
        .limit(1)
      tok = any?.[0]
    }
    if (!tok) return json({ error: `No active ${msg.platform} integration` }, 400)

    // Audit: insert the draft we're about to send.
    await admin.from('reply_drafts').insert({
      message_id,
      tenant_id: ctx.tenant_id,
      ai_generated_text: msg.ai_classification?.suggested_reply || '',
      edited_text: edited_from_draft ? body : null,
      was_sent: true,
      created_by: ctx.user_id,
    })

    let sentInfo: { external_id: string; thread_id: string | null } | null = null
    if (msg.platform === 'gmail') {
      const accessToken = await ensureFreshGmailToken(admin, tok)
      // For threading, Gmail uses In-Reply-To with the original Message-ID,
      // not our internal external_id. We'd need to fetch the original to
      // get its Message-ID header — for now, threadId alone usually
      // suffices to keep replies in the right conversation.
      sentInfo = await sendGmail(accessToken, {
        threadId: msg.thread_id,
        to: msg.from_email || msg.from_id || '',
        subject: msg.subject || '',
        body,
        fromEmail: tok.gmail_email!,
      })
    } else if (msg.platform === 'slack') {
      const botToken = tok.slack_bot_token || tok.access_token
      sentInfo = await sendSlack(botToken!, {
        channel: msg.channel_id!,
        text: body,
        // Reply in-thread when the original was a thread message.
        thread_ts: msg.thread_id || msg.external_id,
      })
    }

    // Update the original message.
    const { data: updated, error: updErr } = await admin
      .from('communication_messages')
      .update({
        status: 'replied',
        replied_at: new Date().toISOString(),
        replied_by: ctx.user_id,
        reply_sent: body,
      })
      .eq('id', message_id)
      .select()
      .single()
    if (updErr) return json({ error: updErr.message }, 500)

    return json(updated)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})

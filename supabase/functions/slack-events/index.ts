// Slack Events API receiver.
//
// This is a PUBLIC webhook (verify_jwt=false). Slack POSTs every message
// in monitored channels here in real-time, so the user doesn't have to
// wait the 90s for the auto-poll. The poll stays in place as a safety
// net for missed events / cold starts.
//
// Security:
//   - Validates X-Slack-Signature using SLACK_SIGNING_SECRET (env var).
//   - The signing-secret check is mandatory; without it any caller could
//     stuff messages into communication_messages.
//   - Slack's URL-verification challenge is echoed back on first setup.
//
// Behavior on an event_callback (type=message):
//   - Reject subtypes (joins, topic edits, bot replies, etc.)
//   - Reject the bot's own messages (bot_user_id match)
//   - Look up integration_tokens by team_id
//   - Check the channel is in slack_monitored_channels and is_active
//   - Resolve user info (cached per request) for from_name/email/avatar
//   - Insert into communication_messages with platform='slack' and
//     external_id = `${channel_id}:${ts}`
//   - Fire-and-forget classify-and-update so the AI fields populate
//
// Setup (one-time, in the Slack app dashboard):
//   1. Event Subscriptions → enable
//   2. Request URL: https://<project>.supabase.co/functions/v1/slack-events
//   3. Subscribe to bot events:
//        message.channels   (public channels the bot is in)
//        message.groups     (private channels the bot is in)
//   4. Reinstall the app to the workspace if scopes changed.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-slack-signature, x-slack-request-timestamp',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SLACK_SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET') || ''

const adminClient = (): SupabaseClient =>
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

interface SlackUser {
  id: string
  name?: string
  real_name?: string
  profile?: {
    display_name?: string
    real_name?: string
    email?: string
    image_72?: string
    image_48?: string
  }
}

async function slackFetch<T = any>(botToken: string, method: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`https://slack.com/api/${method}`)
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${botToken}` } })
  if (!res.ok) throw new Error(`Slack ${method} ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error || 'unknown'}`)
  return data as T
}

// HMAC-SHA256 of `v0:{ts}:{rawBody}` using SLACK_SIGNING_SECRET, in hex.
async function verifySlackSignature(rawBody: string, timestamp: string, signature: string): Promise<boolean> {
  if (!SLACK_SIGNING_SECRET) {
    console.error('[slack-events] SLACK_SIGNING_SECRET is not set; rejecting all requests')
    return false
  }
  // Replay protection: reject anything older than 5 minutes.
  const ts = parseInt(timestamp, 10)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false

  const baseString = `v0:${timestamp}:${rawBody}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SLACK_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(baseString))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  const expected = `v0=${hex}`
  // Constant-time compare.
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

async function classifyAndUpdate(admin: SupabaseClient, messageId: string, classifyInput: any, tenantId: string) {
  try {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'comm_classify', input: JSON.stringify(classifyInput) }),
    })
    if (!res.ok) return
    const { result } = await res.json()
    if (!result) return
    // Read the row first so we can see if matched_project_id was already
    // set from the channel→project link. If yes, the AI's project guess
    // never wins — the explicit human-set link is the source of truth.
    const { data: existing } = await admin
      .from('communication_messages')
      .select('matched_project_id')
      .eq('id', messageId)
      .maybeSingle()
    const updates: any = { ai_processed: true, ai_classification: result }
    if (result.matched_client_id) {
      const { data: c } = await admin.from('clients').select('id').eq('id', result.matched_client_id).eq('tenant_id', tenantId).maybeSingle()
      if (c) updates.matched_client_id = result.matched_client_id
    }
    if (result.matched_project_id && !existing?.matched_project_id) {
      const { data: p } = await admin.from('projects').select('id').eq('id', result.matched_project_id).eq('tenant_id', tenantId).maybeSingle()
      if (p) updates.matched_project_id = result.matched_project_id
    }
    await admin.from('communication_messages').update(updates).eq('id', messageId)
  } catch (err) {
    console.error('[slack-events] classify error:', err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('X-Slack-Signature') || ''
  const timestamp = req.headers.get('X-Slack-Request-Timestamp') || ''

  // Verify the signature on EVERY request (including the URL verification
  // challenge — Slack signs that one too).
  const valid = await verifySlackSignature(rawBody, timestamp, signature)
  if (!valid) {
    return new Response('invalid signature', { status: 401, headers: corsHeaders })
  }

  let payload: any
  try { payload = JSON.parse(rawBody) }
  catch { return new Response('invalid json', { status: 400, headers: corsHeaders }) }

  // 1. URL verification handshake — echo back the challenge in plain text.
  if (payload.type === 'url_verification') {
    return new Response(payload.challenge || '', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    })
  }

  // 2. Event callback. We respond 200 fast and process async so Slack
  //    doesn't time out (3s budget on their side).
  if (payload.type === 'event_callback' && payload.event) {
    // Don't await — return 200 immediately, do the work in the background.
    // EdgeRuntime is a Deno deployment global on Supabase that keeps the
    // worker alive after the response is sent.
    const work = handleEvent(payload).catch(err => console.error('[slack-events] handle error:', err))
    try {
      // @ts-ignore — EdgeRuntime is provided by Supabase Edge Runtime
      EdgeRuntime?.waitUntil?.(work)
    } catch { /* not on Supabase Edge — best effort */ }
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  return new Response('ok', { status: 200, headers: corsHeaders })
})

async function handleEvent(payload: any) {
  const event = payload.event
  const teamId = payload.team_id || payload.authorizations?.[0]?.team_id
  if (!event || event.type !== 'message') return
  // Skip subtypes (joins, topic edits, message_changed, etc.) and bot replies.
  if (event.subtype) return
  if (event.bot_id) return
  if (!event.channel || !event.ts) return
  if (!teamId) return

  const admin = adminClient()

  // Find the integration token for this Slack workspace.
  const { data: tok } = await admin
    .from('integration_tokens')
    .select('id, tenant_id, slack_bot_token, slack_bot_user_id, access_token')
    .eq('platform', 'slack')
    .eq('slack_team_id', teamId)
    .eq('is_active', true)
    .maybeSingle()
  if (!tok) {
    console.warn('[slack-events] no token for team', teamId)
    return
  }

  // Skip messages authored by the bot itself.
  if (event.user && tok.slack_bot_user_id && event.user === tok.slack_bot_user_id) return

  // Channel must be in slack_monitored_channels for this workspace.
  const { data: monitored } = await admin
    .from('slack_monitored_channels')
    .select('channel_id, channel_name, project_id')
    .eq('tenant_id', tok.tenant_id)
    .eq('integration_token_id', tok.id)
    .eq('channel_id', event.channel)
    .eq('is_active', true)
    .maybeSingle()
  if (!monitored) return // user didn't ask us to monitor this channel

  const externalId = `${event.channel}:${event.ts}`

  // Idempotency: if we already have this row (e.g. the poll beat us), bail.
  const { data: existing } = await admin
    .from('communication_messages')
    .select('id')
    .eq('tenant_id', tok.tenant_id)
    .eq('platform', 'slack')
    .eq('external_id', externalId)
    .maybeSingle()
  if (existing) return

  const botToken = tok.slack_bot_token || tok.access_token
  let fromName = 'Unknown'
  let fromEmail: string | null = null
  let fromAvatar: string | null = null

  if (event.user && botToken) {
    try {
      const r = await slackFetch<{ user: SlackUser }>(botToken, 'users.info', { user: event.user })
      const u = r.user
      fromName = u.profile?.display_name || u.real_name || u.name || event.username || 'Unknown'
      fromEmail = u.profile?.email || null
      fromAvatar = u.profile?.image_72 || u.profile?.image_48 || null
    } catch (err) {
      console.warn('[slack-events] users.info failed', err)
      fromName = event.username || 'Unknown'
    }
  }

  const receivedAt = new Date(parseFloat(event.ts) * 1000).toISOString()

  // Lightweight thread context for replies.
  let threadContext: Array<{ from: string; body: string; date: string }> = []
  if (event.thread_ts && event.thread_ts !== event.ts && botToken) {
    try {
      const thread = await slackFetch<{ messages?: Array<{ ts: string; text: string; user?: string; username?: string }> }>(
        botToken, 'conversations.replies', { channel: event.channel, ts: event.thread_ts, limit: '6' },
      )
      const others = (thread.messages || []).filter(x => x.ts !== event.ts).slice(-5)
      threadContext = others.map(o => ({
        from: o.username || o.user || 'user',
        body: (o.text || '').slice(0, 500),
        date: new Date(parseFloat(o.ts) * 1000).toISOString(),
      }))
    } catch { /* best-effort */ }
  }

  // If the user linked this channel to a project, stamp matched_project_id
  // up-front. The AI classifier still runs (in classifyAndUpdate below)
  // but won't overwrite a non-null FK — see classifyAndUpdate guard.
  const { data: inserted, error: insErr } = await admin
    .from('communication_messages')
    .insert({
      tenant_id: tok.tenant_id,
      platform: 'slack',
      external_id: externalId,
      thread_id: event.thread_ts || event.ts,
      from_id: event.user || '',
      from_name: fromName,
      from_email: fromEmail,
      from_avatar_url: fromAvatar,
      subject: null,
      body_text: event.text || '',
      body_html: null,
      channel_id: event.channel,
      channel_name: monitored.channel_name,
      thread_context: threadContext,
      received_at: receivedAt,
      ai_processed: false,
      matched_project_id: monitored.project_id || null,
    })
    .select('id')
    .single()
  if (insErr) {
    if (!insErr.message.includes('duplicate')) {
      console.error('[slack-events] insert failed:', insErr)
    }
    return
  }

  // Fetch tenant + CRM context for AI classification (once per event).
  const { data: tenantRow } = await admin.from('tenants').select('name').eq('id', tok.tenant_id).maybeSingle()
  const { data: clientsList } = await admin.from('clients').select('id, name, email, company').eq('tenant_id', tok.tenant_id).limit(200)
  const { data: projectsList } = await admin.from('projects').select('id, title, client_id, clients(name)').eq('tenant_id', tok.tenant_id).limit(200)

  classifyAndUpdate(admin, inserted.id, {
    platform: 'slack',
    from_name: fromName,
    from_email: fromEmail || '',
    subject: `#${monitored.channel_name}`,
    body: event.text || '',
    thread_context: threadContext,
    agency_name: tenantRow?.name || 'this agency',
    clients: (clientsList || []).map((c: any) => ({ id: c.id, name: c.name || '', email: c.email || '', company: c.company || '' })),
    projects: (projectsList || []).map((p: any) => ({ id: p.id, title: p.title || '', client_id: p.client_id || null, client_name: p.clients?.name || null })),
  }, tok.tenant_id)
}

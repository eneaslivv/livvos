// Slack Events API receiver.
//
// PUBLIC webhook (verify_jwt=false). Slack POSTs every event in real-time.
//
// Security:
//   - HMAC verification con SLACK_SIGNING_SECRET (env var). Replay protection
//     5min. Constant-time compare. Sin signing secret la fn rechaza todo.
//   - Slack URL-verification challenge se echo-back en setup.
//
// Eventos soportados:
//   - message              → insertar en communication_messages, clasificar
//                            según slack_monitored_channels.inbound_mode
//   - app_mention          → ídem message, pero ai_classification.is_mention=true.
//                            (PR3 va a invocar slack-agent para responder.)
//   - reaction_added       → si emoji ∈ {white_check_mark, check, ballot_box_with_check}
//                            y el mensaje original tiene communication_messages.task_id,
//                            marca esa task como completed.
//
// Dedup robusto vía slack_event_log.slack_event_id (UNIQUE). El insert sirve
// como lock: si ya existe, rechazamos el evento (Slack retries no duplican).
//
// Inbound mode (per channel) controla el processing:
//   - ignore                       → insertamos al event_log para auditoría y sale.
//   - notify_only                  → inserta en communication_messages sin clasificar.
//   - classify_and_propose         → inserta + corre gemini + propone (sin auto-task).
//   - classify_and_auto_create     → inserta + corre gemini + crea task si confidence>0.85.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-slack-signature, x-slack-request-timestamp',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SLACK_SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET') || ''

const COMPLETION_REACTIONS = new Set(['white_check_mark', 'check', 'ballot_box_with_check', 'heavy_check_mark'])

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

// HMAC-SHA256 of `v0:{ts}:{rawBody}` using SLACK_SIGNING_SECRET, hex.
async function verifySlackSignature(rawBody: string, timestamp: string, signature: string): Promise<boolean> {
  if (!SLACK_SIGNING_SECRET) {
    console.error('[slack-events] SLACK_SIGNING_SECRET is not set; rejecting all requests')
    return false
  }
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
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

// NOTE: Inline classification was removed in PR2. Classification now happens
// via the Postgres trigger `trg_queue_comm_classify` → comm-classify edge fn.
// This drops the webhook response latency from ~2-3s to <200ms (Slack has a
// 3s timeout budget) and unifies the path for slack-events + slack-sync +
// backfill.

// Dedup helper: returns true if we should process this event, false if dup.
async function reserveEventId(admin: SupabaseClient, tenantId: string, slackEventId: string, eventType: string, channelId: string | null, teamId: string | null, payload: any): Promise<boolean> {
  const { error } = await admin
    .from('slack_event_log')
    .insert({
      tenant_id: tenantId,
      slack_event_id: slackEventId,
      slack_team_id: teamId,
      event_type: eventType,
      channel_id: channelId,
      raw_payload: payload,
      processing_status: 'processing',
    })
  if (error) {
    // Unique violation → duplicate retry from Slack.
    if (error.code === '23505' || /duplicate/i.test(error.message || '')) {
      return false
    }
    console.error('[slack-events] event_log insert failed:', error)
    return true  // fail open: still process so we don't lose events
  }
  return true
}

async function markEventDone(admin: SupabaseClient, slackEventId: string, status: 'done' | 'error' | 'skipped' = 'done', errMsg?: string) {
  await admin
    .from('slack_event_log')
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      ...(errMsg ? { error_message: errMsg.slice(0, 1000) } : {}),
    })
    .eq('slack_event_id', slackEventId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('X-Slack-Signature') || ''
  const timestamp = req.headers.get('X-Slack-Request-Timestamp') || ''

  const valid = await verifySlackSignature(rawBody, timestamp, signature)
  if (!valid) {
    return new Response('invalid signature', { status: 401, headers: corsHeaders })
  }

  let payload: any
  try { payload = JSON.parse(rawBody) }
  catch { return new Response('invalid json', { status: 400, headers: corsHeaders }) }

  // 1. URL verification challenge.
  if (payload.type === 'url_verification') {
    return new Response(payload.challenge || '', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    })
  }

  // 2. Event callback. Respond 200 fast, process async.
  if (payload.type === 'event_callback' && payload.event) {
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
  if (!event || !teamId) return
  // The top-level event_id is unique per Slack delivery; use it for dedup.
  const slackEventId: string | undefined = payload.event_id
  if (!slackEventId) return

  const admin = adminClient()

  // Find tenant for this workspace.
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

  // Dedup gate — first claimer wins. Slack retries duplicate event_ids on 5xx.
  const proceed = await reserveEventId(
    admin, tok.tenant_id, slackEventId, event.type || 'unknown',
    event.channel || event.item?.channel || null, teamId, payload,
  )
  if (!proceed) return

  try {
    if (event.type === 'reaction_added') {
      await handleReaction(admin, tok, event)
    } else if (event.type === 'app_mention') {
      await handleMessage(admin, tok, event, { isMention: true })
    } else if (event.type === 'message') {
      if (event.subtype) {
        await markEventDone(admin, slackEventId, 'skipped', `subtype:${event.subtype}`)
        return
      }
      if (event.bot_id) {
        await markEventDone(admin, slackEventId, 'skipped', 'bot_id')
        return
      }
      await handleMessage(admin, tok, event, { isMention: false })
    } else {
      await markEventDone(admin, slackEventId, 'skipped', `event_type:${event.type}`)
      return
    }
    await markEventDone(admin, slackEventId, 'done')
  } catch (err: any) {
    console.error('[slack-events] processing error:', err)
    await markEventDone(admin, slackEventId, 'error', String(err?.message || err))
  }
}

// ---------- message / app_mention --------------------------------------------
async function handleMessage(admin: SupabaseClient, tok: any, event: any, opts: { isMention: boolean }) {
  if (!event.channel || !event.ts) return
  if (event.user && tok.slack_bot_user_id && event.user === tok.slack_bot_user_id) return

  // Channel must be monitored.
  const { data: monitored } = await admin
    .from('slack_monitored_channels')
    .select('channel_id, channel_name, project_id, inbound_mode')
    .eq('tenant_id', tok.tenant_id)
    .eq('integration_token_id', tok.id)
    .eq('channel_id', event.channel)
    .eq('is_active', true)
    .maybeSingle()
  if (!monitored) return

  const mode = (monitored.inbound_mode || 'classify_and_propose') as
    'ignore' | 'notify_only' | 'classify_and_propose' | 'classify_and_auto_create'

  // ignore mode: solo logueamos al event_log (ya hicimos reserveEventId), bye.
  if (mode === 'ignore' && !opts.isMention) return
  // Las mentions SIEMPRE se procesan aunque el modo sea ignore (es explícito al bot).

  const externalId = `${event.channel}:${event.ts}`

  // Idempotency: si ya existe la fila, salimos.
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

  // Thread context for replies.
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
      ai_processed: mode === 'notify_only' ? true : false,
      ai_classification: opts.isMention ? { is_mention: true } : null,
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

  // El trigger Postgres `trg_queue_comm_classify` se va a disparar AFTER INSERT
  // y llama a comm-classify async via pg_net. Acá ya no clasificamos inline.

  // Mention handling — slack-agent es el bot conversacional que responde en
  // el thread. Disparamos fire-and-forget para que el webhook responda 200
  // a Slack en <200ms.
  if (opts.isMention && inserted?.id) {
    fetch(`${SUPABASE_URL}/functions/v1/slack-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: inserted.id }),
    }).catch(err => console.error('[slack-events] slack-agent dispatch failed:', err))
  }
}

// ---------- reaction_added → ✅ completes linked task ------------------------
async function handleReaction(admin: SupabaseClient, tok: any, event: any) {
  // event.item.channel, event.item.ts identify the target message.
  if (!event.reaction) return
  if (!COMPLETION_REACTIONS.has(event.reaction)) return
  const item = event.item
  if (!item || item.type !== 'message' || !item.channel || !item.ts) return

  // Find communication_messages row + linked task_id.
  const externalId = `${item.channel}:${item.ts}`
  const { data: msg } = await admin
    .from('communication_messages')
    .select('id, task_id, tenant_id')
    .eq('platform', 'slack')
    .eq('external_id', externalId)
    .eq('tenant_id', tok.tenant_id)
    .maybeSingle()
  if (!msg || !msg.task_id) return

  // Mark task complete. Use the existing helper if there's one; else direct update.
  const { error } = await admin
    .from('tasks')
    .update({ completed: true, status: 'Completed' })
    .eq('id', msg.task_id)
    .eq('tenant_id', tok.tenant_id)
  if (error) console.error('[slack-events] task complete update failed:', error)
}

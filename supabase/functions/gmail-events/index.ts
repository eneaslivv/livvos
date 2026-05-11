// Gmail Push Notifications receiver (via Google Cloud Pub/Sub).
//
// This is a PUBLIC webhook (verify_jwt=false). Pub/Sub POSTs an envelope:
//   {
//     "message": {
//       "data": "<base64 of {emailAddress, historyId}>",
//       "messageId": "...",
//       "publishTime": "..."
//     },
//     "subscription": "projects/.../subscriptions/..."
//   }
//
// Security:
//   - Pub/Sub push subscriptions can be configured with an "auth token"
//     (OIDC), which is delivered in the Authorization header. We validate
//     against GMAIL_PUBSUB_AUDIENCE_TOKEN (set as a Supabase secret) to
//     keep randos from spamming us. If the env var is unset we skip the
//     check (dev convenience) — set it in prod.
//   - We trust the data payload because Pub/Sub's push subscription
//     reaches us over HTTPS with the token check.
//
// Flow:
//   - Decode { emailAddress, historyId } from data
//   - Look up integration_tokens row by gmail_email
//   - Call users.history.list?startHistoryId=<storedHistoryId>&historyTypes=messageAdded
//   - For each new messageId, fetch full payload via users.messages.get
//   - Dedupe + insert + classify (same shape as gmail-sync)
//   - Update gmail_history_id on the token so the next push picks up
//     from where we left off
//
// Setup (one-time, in Google Cloud + Supabase secrets):
//   1. Create a Pub/Sub topic, e.g. projects/<gcp>/topics/gmail-livv
//   2. Add IAM binding: gmail-api-push@system.gserviceaccount.com →
//      role roles/pubsub.publisher on the topic.
//   3. Create a Pub/Sub push subscription pointing to
//      https://<project>.supabase.co/functions/v1/gmail-events
//      with "Enable authentication" → service account that can mint
//      OIDC tokens; audience = the same URL.
//   4. Set GMAIL_PUBSUB_TOPIC = projects/<gcp>/topics/gmail-livv as a
//      Supabase Edge Function secret (used by gmail-watch).
//   5. Set GMAIL_PUBSUB_AUDIENCE_TOKEN to a strong shared secret AND
//      pass it via a custom header from your push subscription (or use
//      OIDC verification — full PEM check is out of scope here, the
//      shared-secret pattern is the pragmatic minimum).
//   6. Run "Register push for this account" in Settings (UI button)
//      so the gmail-watch function calls users.watch and stores the
//      starting historyId.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const AUDIENCE_TOKEN = Deno.env.get('GMAIL_PUBSUB_AUDIENCE_TOKEN') || ''
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

const adminClient = (): SupabaseClient =>
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

interface PubSubPushBody {
  message?: { data?: string; messageId?: string; publishTime?: string }
  subscription?: string
}

interface GmailNotification {
  emailAddress: string
  historyId: string | number
}

interface ParsedHeader { name: string; value: string }
interface GmailMessagePayload {
  id: string
  threadId: string
  internalDate: string
  snippet?: string
  payload: {
    headers: ParsedHeader[]
    body?: { data?: string; size?: number }
    parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: any[] }>
  }
}

const headerVal = (headers: ParsedHeader[], name: string): string => {
  const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

const decodeB64Url = (data: string): string => {
  if (!data) return ''
  const norm = data.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (norm.length % 4)) % 4)
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(norm + pad), c => c.charCodeAt(0)))
  } catch { return '' }
}

const extractBodies = (payload: GmailMessagePayload['payload']): { text: string; html: string } => {
  let text = ''
  let html = ''
  const walk = (part: any) => {
    if (!part) return
    const mime = (part.mimeType || '').toLowerCase()
    const data = part.body?.data
    if (data) {
      const decoded = decodeB64Url(data)
      if (mime === 'text/plain' && !text) text = decoded
      else if (mime === 'text/html' && !html) html = decoded
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk)
  }
  walk(payload)
  if (!text && html) {
    text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n').trim()
  }
  return { text, html }
}

const parseFromHeader = (raw: string): { name: string; email: string } => {
  const match = raw.match(/^(.*?)<([^>]+)>$/)
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() }
  return { name: raw.trim(), email: raw.trim() }
}

async function ensureFreshToken(admin: SupabaseClient, tok: any): Promise<string> {
  const expiresAt = tok.expires_at ? new Date(tok.expires_at).getTime() : 0
  if (expiresAt && expiresAt - Date.now() > 60_000) return tok.access_token
  if (!tok.refresh_token) return tok.access_token
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: tok.refresh_token,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const data = await res.json() as { access_token: string; expires_in: number }
  await admin.from('integration_tokens').update({
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq('id', tok.id)
  return data.access_token
}

async function gmailFetch(accessToken: string, path: string): Promise<any> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail API ${res.status}`)
  return res.json()
}

async function classifyAndUpdate(admin: SupabaseClient, messageId: string, classifyInput: any, tenantId: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'comm_classify', input: JSON.stringify(classifyInput) }),
    })
    if (!res.ok) return
    const { result } = await res.json()
    if (!result) return
    const updates: any = { ai_processed: true, ai_classification: result }
    if (result.matched_client_id) {
      const { data: c } = await admin.from('clients').select('id').eq('id', result.matched_client_id).eq('tenant_id', tenantId).maybeSingle()
      if (c) updates.matched_client_id = result.matched_client_id
    }
    if (result.matched_project_id) {
      const { data: p } = await admin.from('projects').select('id').eq('id', result.matched_project_id).eq('tenant_id', tenantId).maybeSingle()
      if (p) updates.matched_project_id = result.matched_project_id
    }
    await admin.from('communication_messages').update(updates).eq('id', messageId)
  } catch (err) {
    console.error('[gmail-events] classify error:', err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('POST required', { status: 405, headers: corsHeaders })

  // Auth check — when AUDIENCE_TOKEN is set, the Pub/Sub subscription
  // should include it in the Authorization: Bearer <token> header.
  if (AUDIENCE_TOKEN) {
    const auth = req.headers.get('Authorization') || ''
    const tok = auth.replace('Bearer ', '')
    if (tok !== AUDIENCE_TOKEN) {
      return new Response('unauthorized', { status: 401, headers: corsHeaders })
    }
  }

  let body: PubSubPushBody
  try { body = await req.json() }
  catch { return new Response('invalid json', { status: 400, headers: corsHeaders }) }

  const dataB64 = body.message?.data
  if (!dataB64) return new Response('no data', { status: 200, headers: corsHeaders })

  let notification: GmailNotification
  try {
    const decoded = decodeB64Url(dataB64)
    notification = JSON.parse(decoded) as GmailNotification
  } catch {
    return new Response('bad data', { status: 200, headers: corsHeaders })
  }

  const email = notification.emailAddress
  const newHistoryId = String(notification.historyId)
  if (!email || !newHistoryId) return new Response('missing fields', { status: 200, headers: corsHeaders })

  // ACK fast and process in background — Pub/Sub will retry on 4xx/5xx,
  // we want to absorb the push quickly.
  const work = processNotification(email, newHistoryId).catch(err => console.error('[gmail-events] process error:', err))
  try {
    // @ts-ignore
    EdgeRuntime?.waitUntil?.(work)
  } catch {}

  return new Response('ok', { status: 200, headers: corsHeaders })
})

async function processNotification(email: string, newHistoryId: string) {
  const admin = adminClient()

  const { data: tok } = await admin
    .from('integration_tokens')
    .select('id, tenant_id, gmail_email, access_token, refresh_token, expires_at, gmail_history_id')
    .eq('platform', 'gmail')
    .eq('gmail_email', email)
    .eq('is_active', true)
    .maybeSingle()
  if (!tok) {
    console.warn('[gmail-events] no token for', email)
    return
  }

  // history.list needs a startHistoryId. If we've never stored one (fresh
  // setup), just stamp the new one and bail — we'll catch this account
  // on the next event (the auto-poll also runs every 90s as backup).
  if (!tok.gmail_history_id) {
    await admin.from('integration_tokens').update({ gmail_history_id: newHistoryId }).eq('id', tok.id)
    return
  }

  const accessToken = await ensureFreshToken(admin, tok)
  const tenantId = tok.tenant_id

  // Pull every messageAdded since our last cursor.
  let pageToken: string | undefined
  const newIds: string[] = []
  do {
    const params = new URLSearchParams({
      startHistoryId: String(tok.gmail_history_id),
      historyTypes: 'messageAdded',
      labelId: 'INBOX',
    })
    if (pageToken) params.set('pageToken', pageToken)
    let resp: any
    try {
      resp = await gmailFetch(accessToken, `/users/me/history?${params}`)
    } catch (err) {
      // history can return 404 if the historyId is expired (>7 days old).
      // Fall back: refresh historyId to current and exit — the poll picks
      // up the gap.
      console.warn('[gmail-events] history.list failed:', err)
      break
    }
    const history = resp.history || []
    for (const h of history) {
      const added = h.messagesAdded || []
      for (const a of added) {
        const m = a.message
        if (m?.id) newIds.push(m.id)
      }
    }
    pageToken = resp.nextPageToken
  } while (pageToken && newIds.length < 50)

  // Dedupe against existing rows.
  if (newIds.length === 0) {
    await admin.from('integration_tokens').update({ gmail_history_id: newHistoryId }).eq('id', tok.id)
    return
  }

  const { data: existing } = await admin
    .from('communication_messages')
    .select('external_id')
    .eq('tenant_id', tenantId)
    .eq('platform', 'gmail')
    .in('external_id', newIds)
  const have = new Set((existing || []).map((r: any) => r.external_id))
  const fresh = newIds.filter(id => !have.has(id))

  // Tenant + CRM context for AI classification.
  const { data: tenantRow } = await admin.from('tenants').select('name').eq('id', tenantId).maybeSingle()
  const { data: clientsList } = await admin.from('clients').select('id, name, email, company').eq('tenant_id', tenantId).limit(200)
  const { data: projectsList } = await admin.from('projects').select('id, title, client_id, clients(name)').eq('tenant_id', tenantId).limit(200)
  const agencyName = tenantRow?.name || 'this agency'
  const clientsCtx = (clientsList || []).map((c: any) => ({ id: c.id, name: c.name || '', email: c.email || '', company: c.company || '' }))
  const projectsCtx = (projectsList || []).map((p: any) => ({ id: p.id, title: p.title || '', client_id: p.client_id || null, client_name: p.clients?.name || null }))

  for (const msgId of fresh) {
    try {
      const m = await gmailFetch(accessToken, `/users/me/messages/${msgId}?format=full`) as GmailMessagePayload
      const headers = m.payload.headers
      const subject = headerVal(headers, 'Subject')
      const fromRaw = headerVal(headers, 'From')
      const { name: fromName, email: fromEmail } = parseFromHeader(fromRaw)
      const { text, html } = extractBodies(m.payload)

      let threadContext: Array<{ from: string; body: string; date: string }> = []
      try {
        const t = await gmailFetch(accessToken, `/users/me/threads/${m.threadId}`) as { messages?: GmailMessagePayload[] }
        const others = (t.messages || []).filter(x => x.id !== m.id).slice(-5)
        threadContext = others.map(o => ({
          from: headerVal(o.payload.headers, 'From'),
          body: (extractBodies(o.payload).text || '').slice(0, 500),
          date: new Date(parseInt(o.internalDate, 10)).toISOString(),
        }))
      } catch {}

      const receivedAt = new Date(parseInt(m.internalDate, 10)).toISOString()

      const { data: inserted, error: insErr } = await admin
        .from('communication_messages')
        .insert({
          tenant_id: tenantId,
          platform: 'gmail',
          external_id: m.id,
          thread_id: m.threadId,
          from_id: fromEmail,
          from_name: fromName,
          from_email: fromEmail,
          subject,
          body_text: text || m.snippet || '',
          body_html: html,
          thread_context: threadContext,
          received_at: receivedAt,
          ai_processed: false,
        })
        .select('id')
        .single()
      if (insErr) {
        if (!insErr.message.includes('duplicate')) console.error('[gmail-events] insert:', insErr)
        continue
      }
      classifyAndUpdate(admin, inserted.id, {
        platform: 'gmail',
        from_name: fromName,
        from_email: fromEmail,
        subject,
        body: text || '',
        thread_context: threadContext,
        agency_name: agencyName,
        clients: clientsCtx,
        projects: projectsCtx,
      }, tenantId)
    } catch (err) {
      console.error('[gmail-events] msg fetch failed:', msgId, err)
    }
  }

  // Advance cursor + stamp last_sync_at.
  await admin.from('integration_tokens').update({
    gmail_history_id: newHistoryId,
    last_sync_at: new Date().toISOString(),
  }).eq('id', tok.id)
}

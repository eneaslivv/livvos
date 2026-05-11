// Gmail watch registration.
//
// POST { tenant_id } from the Settings UI button. For each connected
// Gmail account in this tenant, calls users.watch with the configured
// Pub/Sub topic so Google starts pushing notifications to gmail-events.
//
// Stores the returned historyId + watch_expiry on integration_tokens.
// Watches expire after 7 days; the user (or a future cron) needs to
// re-run this periodically.
//
// Requires GMAIL_PUBSUB_TOPIC env var, e.g.
//   projects/my-gcp-project/topics/gmail-livv

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-custom-version, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GMAIL_PUBSUB_TOPIC = Deno.env.get('GMAIL_PUBSUB_TOPIC') || ''
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

const adminClient = (): SupabaseClient =>
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

async function authenticate(req: Request, tenantOverride?: string) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) throw new Error('Missing Authorization header')
  const admin = adminClient()
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData.user) throw new Error('Invalid token')
  const user_id = userData.user.id
  const { data: members, error: memErr } = await admin
    .from('tenant_members').select('tenant_id, role').eq('user_id', user_id)
  if (memErr) throw memErr
  if (!members || members.length === 0) throw new Error('No tenant membership')
  const member = tenantOverride ? members.find(m => m.tenant_id === tenantOverride) : members[0]
  if (!member) throw new Error('Not a member of the requested tenant')
  return { user_id, tenant_id: member.tenant_id, role: member.role }
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  if (!GMAIL_PUBSUB_TOPIC) {
    return json({
      error: 'GMAIL_PUBSUB_TOPIC not set in Edge Function secrets — see WEBHOOKS.md',
    }, 500)
  }

  try {
    const { tenant_id } = await req.json() as { tenant_id?: string }
    if (!tenant_id) return json({ error: 'tenant_id required' }, 400)
    const ctx = await authenticate(req, tenant_id)
    const admin = adminClient()

    const { data: tokens, error: tokErr } = await admin
      .from('integration_tokens')
      .select('id, gmail_email, access_token, refresh_token, expires_at')
      .eq('tenant_id', ctx.tenant_id)
      .eq('platform', 'gmail')
      .eq('is_active', true)
    if (tokErr) return json({ error: tokErr.message }, 500)
    if (!tokens || tokens.length === 0) {
      return json({ watched: 0, errors: ['No Gmail accounts connected'] })
    }

    let watched = 0
    const errors: string[] = []

    for (const tok of tokens) {
      try {
        const accessToken = await ensureFreshToken(admin, tok)
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicName: GMAIL_PUBSUB_TOPIC,
            labelIds: ['INBOX'],
            labelFilterAction: 'include',
          }),
        })
        if (!res.ok) {
          errors.push(`${tok.gmail_email}: watch ${res.status} ${(await res.text()).slice(0, 120)}`)
          continue
        }
        const data = await res.json() as { historyId: string; expiration: string }
        await admin.from('integration_tokens').update({
          gmail_history_id: data.historyId,
          gmail_watch_expiry: new Date(parseInt(data.expiration, 10)).toISOString(),
        }).eq('id', tok.id)
        watched++
      } catch (err) {
        errors.push(`${tok.gmail_email}: ${(err as Error).message}`)
      }
    }

    return json({ watched, errors })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})

// slack-notify — post a message INTO a Slack channel as the connected bot.
//
// POST {
//   tenant_id: string                  // required
//   channel_id?: string                // overrides the tenant default
//   text: string                        // required, fallback for blocks
//   blocks?: any[]                      // Slack Block Kit blocks
//   integration_token_id?: string       // pick a specific workspace; defaults to first active
// }
//
// Returns { ok: true, ts: '...', channel: '...' } on success.
//
// This is the OUTBOUND counterpart to slack-events / slack-sync. Used for:
//   - Manual "Notify channel" actions from the UI (e.g. broadcast a note from
//     a task or proposal into a Slack channel).
//   - Automatic notifications from server-side hooks (new lead, approved
//     proposal, overdue task, etc.).
//
// Auth: requires a Supabase user JWT (same as gmail-watch / slack-channels).
// The chosen integration_token's tenant_id must match the caller's tenant.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-custom-version, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  try {
    const body = await req.json() as {
      tenant_id?: string
      channel_id?: string
      text?: string
      blocks?: any[]
      integration_token_id?: string
      thread_ts?: string
    }
    const { tenant_id, channel_id, text, blocks, integration_token_id, thread_ts } = body
    if (!tenant_id) return json({ error: 'tenant_id required' }, 400)
    if (!text) return json({ error: 'text required' }, 400)

    const ctx = await authenticate(req, tenant_id)
    const admin = adminClient()

    // Pick the workspace token. Specific id wins; otherwise first active for this tenant.
    let tokQuery = admin
      .from('integration_tokens')
      .select('id, slack_bot_token, access_token, slack_team_name, slack_notify_channel_id')
      .eq('tenant_id', ctx.tenant_id)
      .eq('platform', 'slack')
      .eq('is_active', true)
    if (integration_token_id) tokQuery = tokQuery.eq('id', integration_token_id)
    const { data: tokens, error: tokErr } = await tokQuery.limit(1)
    if (tokErr) return json({ error: tokErr.message }, 500)
    const tok = tokens?.[0]
    if (!tok) return json({ error: 'No active Slack workspace for this tenant' }, 404)

    const botToken = tok.slack_bot_token || tok.access_token
    if (!botToken) return json({ error: 'No bot token stored' }, 500)

    const targetChannel = channel_id || tok.slack_notify_channel_id
    if (!targetChannel) {
      return json({
        error: 'No target channel — pass channel_id or set a default in Settings',
      }, 400)
    }

    const payload: any = {
      channel: targetChannel,
      text, // required as fallback even when blocks are present
    }
    if (Array.isArray(blocks) && blocks.length > 0) payload.blocks = blocks
    if (thread_ts) payload.thread_ts = thread_ts // reply in-thread (task comment threads)

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json() as { ok: boolean; ts?: string; channel?: string; error?: string }
    if (!data.ok) {
      // Common errors: not_in_channel (bot needs invite), channel_not_found
      return json({ error: `slack: ${data.error || 'unknown'}`, channel: targetChannel }, 502)
    }

    return json({ ok: true, ts: data.ts, channel: data.channel || targetChannel, workspace: tok.slack_team_name })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})

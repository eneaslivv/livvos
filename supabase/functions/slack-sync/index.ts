// Slack manual sync.
//
// POST { tenant_id, hours? } from the frontend "Sync now" button OR the
// auto-poll interval in pages/Communications.tsx.
//
// Flow per active Slack workspace:
//   1. Load every row from slack_monitored_channels where is_active=true
//   2. For each channel, call conversations.history (oldest = now - hours)
//   3. Filter out messages we already have in communication_messages
//      (deduplication via external_id = `${channel_id}:${message_ts}`)
//   4. Resolve sender info (cached per request via users.info)
//   5. Insert into communication_messages with platform='slack',
//      channel_id + channel_name set
//   6. Fire-and-forget classify-and-update for each row
//   7. Update last_sync_at on the integration_tokens row
//
// Returns { synced: N, errors: [...] } so the frontend can toast.

import { authenticate, adminClient, json, commCorsHeaders } from '../_shared/comm-utils.ts'

interface SlackMessage {
  type: string
  subtype?: string
  ts: string
  user?: string
  bot_id?: string
  username?: string
  text: string
  thread_ts?: string
  reply_count?: number
}

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
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${botToken}` },
  })
  if (!res.ok) throw new Error(`Slack ${method} ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error || 'unknown'}`)
  return data as T
}

// Background: classify a freshly-inserted message and write the result back.
// Same pattern as gmail-sync — we want the inbox to populate fast and let
// the AI classification trickle in via realtime.
async function classifyAndUpdate(admin: any, messageId: string, classifyInput: any, tenantId: string) {
  try {
    const supaUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const res = await fetch(`${supaUrl}/functions/v1/gemini`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'comm_classify', input: JSON.stringify(classifyInput) }),
    })
    if (!res.ok) {
      console.error('[slack-sync] classify failed:', res.status, await res.text())
      return
    }
    const { result } = await res.json()
    if (!result) return

    const updates: any = { ai_processed: true, ai_classification: result }
    if (result.matched_client_id) {
      const { data: c } = await admin
        .from('clients').select('id').eq('id', result.matched_client_id).eq('tenant_id', tenantId).maybeSingle()
      if (c) updates.matched_client_id = result.matched_client_id
    }
    if (result.matched_project_id) {
      const { data: p } = await admin
        .from('projects').select('id').eq('id', result.matched_project_id).eq('tenant_id', tenantId).maybeSingle()
      if (p) updates.matched_project_id = result.matched_project_id
    }
    await admin.from('communication_messages').update(updates).eq('id', messageId)
  } catch (err) {
    console.error('[slack-sync] classify error:', err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: commCorsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  try {
    const { tenant_id, hours = 24 } = await req.json() as { tenant_id?: string; hours?: number }
    if (!tenant_id) return json({ error: 'tenant_id required' }, 400)

    const ctx = await authenticate(req, tenant_id)
    const admin = adminClient()

    // Load all active Slack tokens for this tenant.
    const { data: tokens, error: tokErr } = await admin
      .from('integration_tokens')
      .select('id, slack_team_id, slack_team_name, slack_bot_token, slack_bot_user_id, access_token')
      .eq('tenant_id', ctx.tenant_id)
      .eq('platform', 'slack')
      .eq('is_active', true)
    if (tokErr) return json({ error: tokErr.message }, 500)
    if (!tokens || tokens.length === 0) {
      return json({ synced: 0, errors: ['No Slack workspaces connected'] })
    }

    // Tenant context for AI classification.
    const { data: tenantRow } = await admin
      .from('tenants').select('name').eq('id', ctx.tenant_id).maybeSingle()
    const agencyName = tenantRow?.name || 'this agency'

    const { data: clientsList } = await admin
      .from('clients').select('id, name, email, company').eq('tenant_id', ctx.tenant_id).limit(200)
    const { data: projectsList } = await admin
      .from('projects').select('id, title, client_id, clients(name)').eq('tenant_id', ctx.tenant_id).limit(200)
    const clients = (clientsList || []).map((c: any) => ({
      id: c.id, name: c.name || '', email: c.email || '', company: c.company || ''
    }))
    const projects = (projectsList || []).map((p: any) => ({
      id: p.id, title: p.title || '', client_id: p.client_id || null, client_name: p.clients?.name || null,
    }))

    let totalSynced = 0
    const errors: string[] = []
    // Lower bound for conversations.history. Slack expects unix seconds (with optional decimals).
    const oldestTs = ((Date.now() / 1000) - Math.max(1, hours) * 3600).toFixed(6)

    for (const tok of tokens) {
      const botToken = tok.slack_bot_token || tok.access_token
      if (!botToken) {
        errors.push(`token ${tok.id}: no bot token`)
        continue
      }

      // Channels we're supposed to monitor for THIS workspace.
      const { data: channels, error: chErr } = await admin
        .from('slack_monitored_channels')
        .select('channel_id, channel_name, channel_type')
        .eq('tenant_id', ctx.tenant_id)
        .eq('integration_token_id', tok.id)
        .eq('is_active', true)
      if (chErr) {
        errors.push(`channels ${tok.id}: ${chErr.message}`)
        continue
      }
      if (!channels || channels.length === 0) continue

      // Per-request user-info cache so we don't refetch the same person N times.
      const userCache = new Map<string, SlackUser | null>()
      const getUserInfo = async (uid: string): Promise<SlackUser | null> => {
        if (userCache.has(uid)) return userCache.get(uid) || null
        try {
          const r = await slackFetch<{ user: SlackUser }>(botToken, 'users.info', { user: uid })
          userCache.set(uid, r.user)
          return r.user
        } catch {
          userCache.set(uid, null)
          return null
        }
      }

      for (const ch of channels) {
        try {
          // 1. Fetch recent history. limit=100 is enough for a 24h window in
          //    most channels. Channels with massive volume will get the
          //    most-recent 100; subsequent runs catch the rest.
          const hist = await slackFetch<{ messages?: SlackMessage[] }>(botToken, 'conversations.history', {
            channel: ch.channel_id,
            oldest: oldestTs,
            limit: '100',
          })
          const all = hist.messages || []
          // Skip thread parents we've already seen, plus bot-from-self echoes,
          // plus channel-join / channel-leave / topic-change subtypes.
          const filtered = all.filter(m =>
            m.type === 'message'
            && !m.subtype // most subtypes are noise (joins, topic edits, bot replies, etc.)
            && m.user !== tok.slack_bot_user_id
          )
          if (filtered.length === 0) continue

          // 2. Build external_ids and dedupe against existing rows.
          const candidateIds = filtered.map(m => `${ch.channel_id}:${m.ts}`)
          const { data: existing } = await admin
            .from('communication_messages')
            .select('external_id')
            .eq('tenant_id', ctx.tenant_id)
            .eq('platform', 'slack')
            .in('external_id', candidateIds)
          const haveSet = new Set((existing || []).map((r: any) => r.external_id))
          const newOnes = filtered.filter(m => !haveSet.has(`${ch.channel_id}:${m.ts}`))

          // 3. Insert each new message.
          for (const m of newOnes) {
            try {
              const senderId = m.user || ''
              const sender = senderId ? await getUserInfo(senderId) : null
              const fromName = sender?.profile?.display_name || sender?.real_name || sender?.name || m.username || 'Unknown'
              const fromEmail = sender?.profile?.email || null
              const fromAvatar = sender?.profile?.image_72 || sender?.profile?.image_48 || null
              const receivedAt = new Date(parseFloat(m.ts) * 1000).toISOString()

              // Lightweight thread context — pull thread parent + last few replies
              // when this is a reply (thread_ts != ts).
              let threadContext: Array<{ from: string; body: string; date: string }> = []
              if (m.thread_ts && m.thread_ts !== m.ts) {
                try {
                  const thread = await slackFetch<{ messages?: SlackMessage[] }>(botToken, 'conversations.replies', {
                    channel: ch.channel_id,
                    ts: m.thread_ts,
                    limit: '6',
                  })
                  const others = (thread.messages || []).filter(x => x.ts !== m.ts).slice(-5)
                  threadContext = await Promise.all(others.map(async o => {
                    const oUser = o.user ? await getUserInfo(o.user) : null
                    return {
                      from: oUser?.real_name || oUser?.name || o.username || 'user',
                      body: (o.text || '').slice(0, 500),
                      date: new Date(parseFloat(o.ts) * 1000).toISOString(),
                    }
                  }))
                } catch { /* thread fetch is best-effort */ }
              }

              const { data: inserted, error: insErr } = await admin
                .from('communication_messages')
                .insert({
                  tenant_id: ctx.tenant_id,
                  platform: 'slack',
                  external_id: `${ch.channel_id}:${m.ts}`,
                  thread_id: m.thread_ts || m.ts,
                  from_id: senderId,
                  from_name: fromName,
                  from_email: fromEmail,
                  from_avatar_url: fromAvatar,
                  subject: null, // Slack messages don't have subjects
                  body_text: m.text || '',
                  body_html: null,
                  channel_id: ch.channel_id,
                  channel_name: ch.channel_name,
                  thread_context: threadContext,
                  received_at: receivedAt,
                  ai_processed: false,
                })
                .select('id')
                .single()
              if (insErr) {
                if (!insErr.message.includes('duplicate')) errors.push(`insert ${m.ts}: ${insErr.message}`)
                continue
              }
              totalSynced++

              classifyAndUpdate(admin, inserted.id, {
                platform: 'slack',
                from_name: fromName,
                from_email: fromEmail || '',
                subject: `#${ch.channel_name}`,
                body: m.text || '',
                thread_context: threadContext,
                agency_name: agencyName,
                clients,
                projects,
              }, ctx.tenant_id)
            } catch (msgErr) {
              errors.push(`msg ${m.ts}: ${(msgErr as Error).message}`)
            }
          }
        } catch (chErr2) {
          errors.push(`channel #${ch.channel_name}: ${(chErr2 as Error).message}`)
        }
      }

      await admin.from('integration_tokens').update({ last_sync_at: new Date().toISOString() }).eq('id', tok.id)
    }

    return json({ synced: totalSynced, errors })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})

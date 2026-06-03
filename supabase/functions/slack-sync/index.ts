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

const ACTIONABLE_SLACK_RE = /\b(can you|could you|please|need|needs|needed|blocked|blocker|not working|broken|issue|bug|help|asap|urgent|review|approve|approval|confirm|send|share|access|feedback|thoughts|waiting|follow up|when|where|what|how|why)\b/i

function hasSlackMention(text: string, mentionIds: Set<string>): boolean {
  if (!text) return false
  for (const id of mentionIds) {
    if (id && text.includes(`<@${id}>`)) return true
  }
  return false
}

function shouldImportSlackMessage(message: SlackMessage, mode: string | null | undefined, mentionIds: Set<string>): boolean {
  const filterMode = mode || 'actionable'
  if (filterMode === 'all') return true
  const text = message.text || ''
  const mentioned = hasSlackMention(text, mentionIds)
  if (filterMode === 'mentions') return mentioned
  return mentioned || text.includes('?') || ACTIONABLE_SLACK_RE.test(text)
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

    // Pre-existing matched_project_id (e.g. from a slack channel→project
    // link) wins over the AI guess. The user's explicit configuration is
    // the source of truth.
    const { data: existing } = await admin
      .from('communication_messages')
      .select('matched_project_id')
      .eq('id', messageId)
      .maybeSingle()
    const updates: any = { ai_processed: true, ai_classification: result }
    if (result.matched_client_id) {
      const { data: c } = await admin
        .from('clients').select('id').eq('id', result.matched_client_id).eq('tenant_id', tenantId).maybeSingle()
      if (c) updates.matched_client_id = result.matched_client_id
    }
    if (result.matched_project_id && !existing?.matched_project_id) {
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

    // Load all Slack user IDs for tenant members — used to detect
    // "you already replied in Slack" by matching reply authors against
    // known team members. Also includes bot user IDs so we skip those.
    const { data: memberProfiles } = await admin
      .from('profiles')
      .select('slack_user_id')
      .in('id', (await admin
        .from('tenant_members')
        .select('user_id')
        .eq('tenant_id', ctx.tenant_id)
      ).data?.map((m: any) => m.user_id) || [])
    const teamSlackIds = new Set<string>(
      (memberProfiles || [])
        .map((p: any) => p.slack_user_id)
        .filter(Boolean)
    )

    let totalSynced = 0
    const errors: string[] = []
    // Lower bound for conversations.history. Slack expects unix seconds (with optional decimals).
    const oldestTs = ((Date.now() / 1000) - Math.max(1, hours) * 3600).toFixed(6)

    for (const tok of tokens) {
      let tokenSynced = 0
      const botToken = tok.slack_bot_token || tok.access_token
      if (!botToken) {
        errors.push(`token ${tok.id}: no bot token`)
        await admin.from('integration_tokens').update({
          last_sync_status: 'error',
          last_sync_error: 'No Slack bot token',
          last_sync_finished_at: new Date().toISOString(),
        }).eq('id', tok.id)
        continue
      }
      await admin.from('integration_tokens').update({
        last_sync_status: 'syncing',
        last_sync_error: null,
        last_sync_started_at: new Date().toISOString(),
      }).eq('id', tok.id)

      // Add bot user ID to the team set so we can distinguish team vs external
      if (tok.slack_bot_user_id) teamSlackIds.add(tok.slack_bot_user_id)

      // Channels we're supposed to monitor for THIS workspace.
      const { data: channels, error: chErr } = await admin
        .from('slack_monitored_channels')
        .select('channel_id, channel_name, channel_type, project_id, inbound_filter')
        .eq('tenant_id', ctx.tenant_id)
        .eq('integration_token_id', tok.id)
        .eq('is_active', true)
      if (chErr) {
        errors.push(`channels ${tok.id}: ${chErr.message}`)
        await admin.from('integration_tokens').update({
          last_sync_status: 'error',
          last_sync_error: chErr.message,
          last_sync_finished_at: new Date().toISOString(),
        }).eq('id', tok.id)
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
              const mentionIds = new Set<string>(teamSlackIds)
              if (tok.slack_bot_user_id) mentionIds.add(tok.slack_bot_user_id)
              if (senderId && teamSlackIds.has(senderId)) continue
              if (!shouldImportSlackMessage(m, (ch as any).inbound_filter, mentionIds)) continue

              const sender = senderId ? await getUserInfo(senderId) : null
              const fromName = sender?.profile?.display_name || sender?.real_name || sender?.name || m.username || 'Unknown'
              const fromEmail = sender?.profile?.email || null
              const fromAvatar = sender?.profile?.image_72 || sender?.profile?.image_48 || null
              const receivedAt = new Date(parseFloat(m.ts) * 1000).toISOString()

              // Lightweight thread context — pull thread parent + last few replies
              // when this is a reply (thread_ts != ts).
              let threadContext: Array<{ from: string; body: string; date: string }> = []
              let repliedInPlatform = false
              let replyCount = m.reply_count || 0
              let lastReplyAt: string | null = null

              // Check if THIS message was sent by a team member (meaning
              // the team already engaged in this channel — mark as replied)
              if (senderId && teamSlackIds.has(senderId)) {
                repliedInPlatform = true
              }

              if (m.thread_ts && m.thread_ts !== m.ts) {
                try {
                  const thread = await slackFetch<{ messages?: SlackMessage[] }>(botToken, 'conversations.replies', {
                    channel: ch.channel_id,
                    ts: m.thread_ts,
                    limit: '20',
                  })
                  const allReplies = thread.messages || []
                  replyCount = Math.max(replyCount, allReplies.length - 1) // exclude parent

                  // Check if any team member replied in this thread
                  if (!repliedInPlatform) {
                    repliedInPlatform = allReplies.some(r =>
                      r.user && teamSlackIds.has(r.user) && r.ts !== m.ts
                    )
                  }

                  // Track last reply timestamp
                  if (allReplies.length > 1) {
                    const lastReply = allReplies[allReplies.length - 1]
                    lastReplyAt = new Date(parseFloat(lastReply.ts) * 1000).toISOString()
                  }

                  const others = allReplies.filter(x => x.ts !== m.ts).slice(-5)
                  threadContext = await Promise.all(others.map(async o => {
                    const oUser = o.user ? await getUserInfo(o.user) : null
                    return {
                      from: oUser?.real_name || oUser?.name || o.username || 'user',
                      body: (o.text || '').slice(0, 500),
                      date: new Date(parseFloat(o.ts) * 1000).toISOString(),
                    }
                  }))
                } catch { /* thread fetch is best-effort */ }
              } else if (m.reply_count && m.reply_count > 0) {
                // Parent message with replies — fetch to check team participation
                try {
                  const thread = await slackFetch<{ messages?: SlackMessage[] }>(botToken, 'conversations.replies', {
                    channel: ch.channel_id,
                    ts: m.ts,
                    limit: '20',
                  })
                  const allReplies = thread.messages || []
                  replyCount = Math.max(replyCount, allReplies.length - 1)

                  if (!repliedInPlatform) {
                    repliedInPlatform = allReplies.some(r =>
                      r.user && teamSlackIds.has(r.user) && r.ts !== m.ts
                    )
                  }

                  if (allReplies.length > 1) {
                    const lastReply = allReplies[allReplies.length - 1]
                    lastReplyAt = new Date(parseFloat(lastReply.ts) * 1000).toISOString()
                  }
                } catch { /* best-effort */ }
              }

              const { data: inserted, error: insErr } = await admin
                .from('communication_messages')
                .insert({
                  tenant_id: ctx.tenant_id,
                  platform: 'slack',
                  integration_token_id: tok.id,
                  external_id: `${ch.channel_id}:${m.ts}`,
                  thread_id: m.thread_ts || m.ts,
                  from_id: senderId,
                  from_name: fromName,
                  from_email: fromEmail,
                  from_avatar_url: fromAvatar,
                  subject: null,
                  body_text: m.text || '',
                  body_html: null,
                  channel_id: ch.channel_id,
                  channel_name: ch.channel_name,
                  thread_context: threadContext,
                  received_at: receivedAt,
                  ai_processed: false,
                  matched_project_id: (ch as any).project_id || null,
                  // Reply tracking
                  replied_in_platform: repliedInPlatform,
                  reply_count: replyCount,
                  last_reply_at: lastReplyAt,
                })
                .select('id')
                .single()
              if (insErr) {
                if (!insErr.message.includes('duplicate')) errors.push(`insert ${m.ts}: ${insErr.message}`)
                continue
              }
              totalSynced++
              tokenSynced++

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
          const lastMessageAt = filtered[0]?.ts ? new Date(parseFloat(filtered[0].ts) * 1000).toISOString() : null
          await admin.from('slack_monitored_channels').update({
            last_sync_at: new Date().toISOString(),
            last_sync_error: null,
            last_message_at: lastMessageAt,
          }).eq('tenant_id', ctx.tenant_id).eq('channel_id', ch.channel_id)
        } catch (chErr2) {
          const message = (chErr2 as Error).message
          errors.push(`channel #${ch.channel_name}: ${message}`)
          await admin.from('slack_monitored_channels').update({
            last_sync_error: message,
            last_sync_at: new Date().toISOString(),
          }).eq('tenant_id', ctx.tenant_id).eq('channel_id', ch.channel_id)
        }
      }

      const finishedAt = new Date().toISOString()
      await admin.from('integration_tokens').update({
        last_sync_at: finishedAt,
        last_sync_finished_at: finishedAt,
        last_sync_status: 'success',
        last_sync_error: null,
        last_sync_count: tokenSynced,
      }).eq('id', tok.id)
    }

    return json({ synced: totalSynced, errors })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})

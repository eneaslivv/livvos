// Slack channels — list channels available for the connected workspace,
// plus the bot's actual identity (name + @handle) so the UI can tell
// the user EXACTLY what to type in `/invite @<handle>`.
//
// GET ?tenant_id=…&integration_token_id=…
// Returns {
//   bot: { user_id, handle, display_name } | null,
//   channels: [{ id, name, is_private, is_member, num_members }]
// }

import { authenticate, adminClient, json, commCorsHeaders } from '../_shared/comm-utils.ts'

interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  is_member: boolean
  num_members?: number
  is_archived?: boolean
}

interface SlackUserInfo {
  id: string
  name: string                          // legacy username (lowercase, no spaces) — what /invite @<this> takes
  real_name?: string
  profile?: {
    display_name?: string
    real_name?: string
  }
}

async function listChannels(botToken: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = []
  let cursor: string | undefined

  do {
    const params = new URLSearchParams({
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '200',
    })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    })
    const data = await res.json()
    if (!data.ok) throw new Error(`slack ${data.error}`)
    if (Array.isArray(data.channels)) channels.push(...data.channels)
    cursor = data.response_metadata?.next_cursor || undefined
  } while (cursor && channels.length < 1000)

  return channels.filter(c => !c.is_archived)
}

async function getBotInfo(botToken: string, botUserId: string | null): Promise<SlackUserInfo | null> {
  if (!botUserId) return null
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${botUserId}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    })
    const data = await res.json()
    if (!data.ok || !data.user) return null
    return data.user as SlackUserInfo
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: commCorsHeaders })

  try {
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenant_id')
    const tokenId = url.searchParams.get('integration_token_id')
    if (!tenantId || !tokenId) return json({ error: 'tenant_id + integration_token_id required' }, 400)

    const ctx = await authenticate(req, tenantId)
    const admin = adminClient()

    const { data: tok, error: tokErr } = await admin
      .from('integration_tokens')
      .select('id, tenant_id, platform, slack_bot_token, slack_bot_user_id, access_token')
      .eq('id', tokenId)
      .eq('tenant_id', ctx.tenant_id)
      .eq('platform', 'slack')
      .maybeSingle()
    if (tokErr) return json({ error: tokErr.message }, 500)
    if (!tok) return json({ error: 'Slack integration not found' }, 404)

    const botToken = tok.slack_bot_token || tok.access_token
    if (!botToken) return json({ error: 'No bot token stored' }, 500)

    // Fetch channels + bot info in parallel.
    const [channels, botInfo] = await Promise.all([
      listChannels(botToken),
      getBotInfo(botToken, tok.slack_bot_user_id),
    ])

    return json({
      bot: botInfo
        ? {
            user_id: botInfo.id,
            // .name is the legacy username (e.g. "livv-os") — this is what
            // /invite @<x> in Slack actually accepts, NOT display_name.
            handle: botInfo.name || null,
            display_name: botInfo.profile?.display_name || botInfo.real_name || botInfo.name || null,
          }
        : null,
      channels: channels.map(c => ({
        id: c.id,
        name: c.name,
        is_private: c.is_private,
        is_member: c.is_member,
        num_members: c.num_members ?? null,
      })),
    })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})

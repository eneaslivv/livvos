// Slack channels — list channels available for the connected workspace.
//
// GET ?tenant_id=…&integration_token_id=…
// Returns { channels: [{ id, name, is_private, is_member, num_members }] }
//
// The frontend uses this to populate the multi-select in
// IntegrationSettings — the user picks which channels the inbox should
// monitor, and that becomes rows in slack_monitored_channels.

import { authenticate, adminClient, json, commCorsHeaders } from '../_shared/comm-utils.ts'

interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  is_member: boolean
  num_members?: number
  is_archived?: boolean
}

async function listChannels(botToken: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = []
  let cursor: string | undefined

  // Pull both public and private channels (types=public_channel,private_channel).
  // limit=200 (Slack max); paginate via response_metadata.next_cursor.
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
  } while (cursor && channels.length < 1000) // hard cap to avoid runaway pagination

  return channels.filter(c => !c.is_archived)
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
      .select('id, tenant_id, platform, slack_bot_token, access_token')
      .eq('id', tokenId)
      .eq('tenant_id', ctx.tenant_id)
      .eq('platform', 'slack')
      .maybeSingle()
    if (tokErr) return json({ error: tokErr.message }, 500)
    if (!tok) return json({ error: 'Slack integration not found' }, 404)

    const botToken = tok.slack_bot_token || tok.access_token
    if (!botToken) return json({ error: 'No bot token stored' }, 500)

    const channels = await listChannels(botToken)
    return json({
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

// Slack OAuth — start.
//
// Same pattern as gmail-connect: verify auth, sign state JWT, return
// the Slack OAuth URL.

import { authenticate, signOAuthState, json, commCorsHeaders } from '../_shared/comm-utils.ts'

const SLACK_CLIENT_ID = Deno.env.get('SLACK_CLIENT_ID')!
const SLACK_REDIRECT_URI = Deno.env.get('SLACK_REDIRECT_URI')
  ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/slack-callback`

// Bot scopes — needed to read channel messages, send replies, look up users.
const BOT_SCOPES = [
  'channels:read',     // list public channels
  'channels:history',  // read public channel messages
  'groups:read',       // list private channels
  'groups:history',    // read private channel messages
  'chat:write',        // send messages
  'users:read',        // user profiles
  'users:read.email',  // user emails
  'team:read',         // workspace name
  'app_mentions:read', // know when @app is mentioned
].join(',')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: commCorsHeaders })

  try {
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenant_id')
    if (!tenantId) return json({ error: 'tenant_id required' }, 400)

    const ctx = await authenticate(req, tenantId)
    const state = await signOAuthState({ tenant_id: ctx.tenant_id, user_id: ctx.user_id })

    const authUrl = new URL('https://slack.com/oauth/v2/authorize')
    authUrl.searchParams.set('client_id', SLACK_CLIENT_ID)
    authUrl.searchParams.set('scope', BOT_SCOPES)
    authUrl.searchParams.set('redirect_uri', SLACK_REDIRECT_URI)
    authUrl.searchParams.set('state', state)

    return json({ auth_url: authUrl.toString() })
  } catch (err) {
    return json({ error: (err as Error).message }, 401)
  }
})

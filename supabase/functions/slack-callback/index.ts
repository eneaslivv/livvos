// Slack OAuth — finish.
//
// Slack's response shape (oauth.v2.access):
//   {
//     ok: true,
//     access_token: "xoxb-...",       ← the bot token (what we use for API)
//     token_type: "bot",
//     scope: "chat:write,...",
//     bot_user_id: "U123",
//     team: { id: "T123", name: "Acme" },
//     authed_user: { id: "U456", access_token?: "xoxp-..." },  // user token if scopes include it
//     enterprise: null,
//     is_enterprise_install: false
//   }
//
// We store the bot token in slack_bot_token and also as access_token (so
// callers don't need to know which is which). Slack bot tokens don't
// expire so we don't need refresh logic.

import { adminClient, verifyOAuthState, commCorsHeaders } from '../_shared/comm-utils.ts'

const SLACK_CLIENT_ID = Deno.env.get('SLACK_CLIENT_ID')!
const SLACK_CLIENT_SECRET = Deno.env.get('SLACK_CLIENT_SECRET')!
const SLACK_REDIRECT_URI = Deno.env.get('SLACK_REDIRECT_URI')
  ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/slack-callback`
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:5173'

const redirectBack = (status: 'success' | 'error', detail?: string) => {
  const url = new URL(`${APP_URL}/`)
  url.searchParams.set('view', 'communications')
  url.searchParams.set('connect', `slack_${status}`)
  if (detail) url.searchParams.set('detail', detail.slice(0, 200))
  return Response.redirect(url.toString(), 302)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: commCorsHeaders })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  if (oauthError) return redirectBack('error', oauthError)
  if (!code || !state) return redirectBack('error', 'missing code or state')

  const verified = await verifyOAuthState(state)
  if (!verified) return redirectBack('error', 'invalid or expired state')

  try {
    // Exchange code for tokens.
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        redirect_uri: SLACK_REDIRECT_URI,
      }).toString(),
    })
    const data = await tokenRes.json()
    if (!data.ok) return redirectBack('error', `slack: ${data.error}`)

    const teamId = data.team?.id
    const teamName = data.team?.name
    const botToken = data.access_token         // xoxb-...
    const botUserId = data.bot_user_id
    const scope = data.scope

    if (!teamId || !botToken) return redirectBack('error', 'missing team or bot token')

    const admin = adminClient()
    const { data: existing } = await admin
      .from('integration_tokens')
      .select('id')
      .eq('tenant_id', verified.tenant_id)
      .eq('platform', 'slack')
      .eq('slack_team_id', teamId)
      .maybeSingle()

    if (existing) {
      const { error } = await admin.from('integration_tokens').update({
        access_token: botToken,
        slack_bot_token: botToken,
        slack_bot_user_id: botUserId,
        slack_team_name: teamName,
        scope,
        is_active: true,
      }).eq('id', existing.id)
      if (error) return redirectBack('error', error.message.slice(0, 80))
    } else {
      const { error } = await admin.from('integration_tokens').insert({
        tenant_id: verified.tenant_id,
        platform: 'slack',
        access_token: botToken,
        slack_bot_token: botToken,
        slack_bot_user_id: botUserId,
        slack_team_id: teamId,
        slack_team_name: teamName,
        scope,
        is_active: true,
        created_by: verified.user_id,
      })
      if (error) return redirectBack('error', error.message.slice(0, 80))
    }

    return redirectBack('success', teamName)
  } catch (err) {
    return redirectBack('error', (err as Error).message.slice(0, 100))
  }
})

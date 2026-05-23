// @ts-nocheck
// inbox-digest — Genera un resumen ejecutivo del inbox (Slack + Gmail) usando
// las últimas N classifications. NO re-llama al LLM por cada mensaje — los
// agarra ya pre-clasificados por comm-classify y los CLUSTERIZA en temas.
//
// Llamada:
//   POST /inbox-digest { tenant_id, since_hours?, limit? }
//
// Output:
//   {
//     headline: "Tenés 12 mensajes nuevos. 3 piden respuesta hoy.",
//     stats: { total, unread, urgent, follow_ups, info_only },
//     themes: [
//       { label: "Mobilita feedback", count: 4, sample_ids: [...], priority: 'high' },
//       { label: "Sunnyside copy review", count: 3, sample_ids: [...], priority: 'medium' },
//     ],
//     priorities: [
//       { message_id, channel, from, summary, intent, suggested_action }
//     ],
//     cost_usd: 0.0001,
//     generated_at: ISO
//   }
//
// verify_jwt=true — solo users autenticados con tenant válido pueden pedir digest.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''

const SYSTEM_PROMPT = `You are a productivity assistant building an executive digest of someone's communications inbox (Slack channels + Gmail). The input is an array of recent messages, each pre-classified by another AI with intent/summary/matched_client.

Your job: cluster these messages into 3-6 themes, surface the top priorities (things that need action), and write a 1-line headline. Be brutally concise — this is for a busy founder who has 20 seconds.

Return ONLY valid JSON with this shape:
{
  "headline": "Single sentence: count + most important takeaway. Match input language.",
  "themes": [
    {
      "label": "Short topic name (3-5 words)",
      "count": 4,
      "sample_message_ids": ["uuid1", "uuid2"],
      "priority": "high" | "medium" | "low"
    }
  ],
  "priorities": [
    {
      "message_id": "uuid",
      "summary": "1-sentence what they want",
      "suggested_action": "Reply with X" | "Create task: Y" | "FYI only, no action"
    }
  ]
}

Rules:
- Themes cluster by topic/project/client — NOT by sender. Group "all Mobilita feedback" together regardless of who sent it.
- Limit themes to 3-6. Skip themes with only 1 message unless that message is high-priority.
- priorities[] = top 3-5 messages that need response or decision TODAY. Skip info_only / FYI / newsletters.
- suggested_action: actionable verb-first ("Reply confirming timeline", "Create task: send invoice", "Decide and reply by EOD").
- Language: detect from message bodies and match (es/en).
- Be concise. No markdown. No filler ("here's the digest").`

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Verify auth — user must belong to the tenant they're asking about.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const token = authHeader.replace('Bearer ', '')

  let body: any
  try { body = await req.json() }
  catch { return new Response('invalid json', { status: 400, headers: cors }) }
  const tenantId: string | undefined = body.tenant_id
  const sinceHours = Number(body.since_hours) || 72
  const limit = Math.min(40, Number(body.limit) || 20)

  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'tenant_id required' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const admin = adminClient()

  // Auth check: user belongs to the requested tenant
  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const { data: profile } = await admin.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
  let allowed = profile?.tenant_id === tenantId
  if (!allowed) {
    const { data: membership } = await admin
      .from('tenant_members').select('tenant_id')
      .eq('user_id', user.id).eq('tenant_id', tenantId).maybeSingle()
    allowed = !!membership
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'You do not belong to that tenant' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await generateDigest(admin, tenantId, sinceHours, limit)
    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[inbox-digest]', err)
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

async function generateDigest(admin: any, tenantId: string, sinceHours: number, limit: number) {
  const sinceIso = new Date(Date.now() - sinceHours * 3600_000).toISOString()

  // Fetch recent messages WITH classifications (skip raw unclassified — they
  // won't have summary yet).
  const { data: messages, error: msgErr } = await admin
    .from('communication_messages')
    .select('id, platform, from_name, from_email, channel_name, subject, body_text, received_at, status, ai_classification, matched_client_id, matched_project_id')
    .eq('tenant_id', tenantId)
    .gte('received_at', sinceIso)
    .eq('ai_processed', true)
    .not('ai_classification', 'is', null)
    .neq('status', 'archived')
    .order('received_at', { ascending: false })
    .limit(limit)
  if (msgErr) throw msgErr

  // Stats calculation
  const stats = {
    total: messages.length,
    unread: messages.filter((m: any) => m.status === 'pending').length,
    urgent: messages.filter((m: any) => m.ai_classification?.intent === 'urgent').length,
    new_requests: messages.filter((m: any) => m.ai_classification?.intent === 'new_request').length,
    follow_ups: messages.filter((m: any) => m.ai_classification?.intent === 'follow_up').length,
    info_only: messages.filter((m: any) => m.ai_classification?.intent === 'info_only').length,
  }

  // If no messages, return empty digest without burning AI quota
  if (messages.length === 0) {
    return {
      headline: 'Sin mensajes nuevos en las últimas ' + sinceHours + 'h.',
      stats,
      themes: [],
      priorities: [],
      cost_usd: 0,
      generated_at: new Date().toISOString(),
      message_count: 0,
    }
  }

  // Build LLM input — strip down to essentials, drop bodies if too long
  const llmInput = messages.map((m: any) => ({
    id: m.id,
    platform: m.platform,
    channel: m.channel_name || m.subject || '(direct)',
    from: m.from_name || m.from_email || 'unknown',
    body: (m.body_text || '').slice(0, 280),
    intent: m.ai_classification?.intent || 'unknown',
    summary: m.ai_classification?.summary || '',
    has_request: m.ai_classification?.should_create_task || false,
    matched_client_id: m.matched_client_id,
    matched_project_id: m.matched_project_id,
  }))

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(llmInput) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1500,
    }),
  })

  if (!openaiRes.ok) {
    const errText = await openaiRes.text()
    console.error('[inbox-digest] openai error', openaiRes.status, errText)
    throw new Error(`openai ${openaiRes.status}: ${errText.slice(0, 200)}`)
  }
  const openaiData = await openaiRes.json()
  const rawContent = openaiData?.choices?.[0]?.message?.content || '{}'
  const tokensIn = openaiData?.usage?.prompt_tokens || 0
  const tokensOut = openaiData?.usage?.completion_tokens || 0
  const cost = (tokensIn * 0.15 + tokensOut * 0.60) / 1_000_000

  let parsed: any
  try { parsed = JSON.parse(rawContent) }
  catch { parsed = { headline: 'No se pudo generar el digest.', themes: [], priorities: [] } }

  return {
    headline: parsed.headline || `${stats.total} mensajes nuevos.`,
    stats,
    themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 6) : [],
    priorities: Array.isArray(parsed.priorities) ? parsed.priorities.slice(0, 5) : [],
    cost_usd: +cost.toFixed(5),
    generated_at: new Date().toISOString(),
    message_count: messages.length,
    since_hours: sinceHours,
  }
}

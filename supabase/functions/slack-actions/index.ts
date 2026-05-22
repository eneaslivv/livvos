// @ts-nocheck
// slack-actions — Handler único para slash commands + Block Kit interactivity.
//
// Slack envía dos tipos de payloads acá:
//   1. Slash command POST (Content-Type: application/x-www-form-urlencoded):
//      body: command=/livv&text=<args>&user_id=...&team_id=...&channel_id=...
//      Soportados: /livv {task | done | brief | help}
//
//   2. Interactivity payload POST (form-encoded con `payload` field):
//      payload = URL-encoded JSON con type='block_actions' | 'view_submission'
//      Acciones: accept_task_proposal, dismiss_proposal, view_in_app
//
// Setup en Slack app dashboard:
//   • Slash Commands → /livv → Request URL: .../functions/v1/slack-actions
//   • Interactivity & Shortcuts → ON → Request URL: .../functions/v1/slack-actions
//
// Seguridad: HMAC verification con SLACK_SIGNING_SECRET. Sin la firma, 401.
//
// verify_jwt=false porque Slack no manda JWT.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-slack-signature, x-slack-request-timestamp',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SLACK_SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET') || ''

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// HMAC verification — same impl as slack-events.
async function verifySlackSignature(rawBody: string, timestamp: string, signature: string): Promise<boolean> {
  if (!SLACK_SIGNING_SECRET) return false
  const ts = parseInt(timestamp, 10)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false
  const baseString = `v0:${timestamp}:${rawBody}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SLACK_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(baseString))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  const expected = `v0=${hex}`
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

// Parse form-urlencoded body into a plain object.
function parseForm(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of raw.split('&')) {
    const [k, v] = part.split('=')
    if (!k) continue
    out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent((v || '').replace(/\+/g, ' '))
  }
  return out
}

// Ephemeral Slack message — only visible to the invoking user.
function ephemeral(text: string, blocks?: any[]) {
  return new Response(JSON.stringify({
    response_type: 'ephemeral',
    text,
    ...(blocks ? { blocks } : {}),
  }), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

// In-channel Slack message — visible to everyone.
function inChannel(text: string, blocks?: any[]) {
  return new Response(JSON.stringify({
    response_type: 'in_channel',
    text,
    ...(blocks ? { blocks } : {}),
  }), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('X-Slack-Signature') || ''
  const timestamp = req.headers.get('X-Slack-Request-Timestamp') || ''
  if (!await verifySlackSignature(rawBody, timestamp, signature)) {
    return new Response('invalid signature', { status: 401, headers: cors })
  }

  const form = parseForm(rawBody)
  const admin = adminClient()

  // Branch 1: slash command (has `command` field).
  if (form.command) {
    return await handleSlashCommand(admin, form)
  }

  // Branch 2: interactivity (has `payload` field — JSON string).
  if (form.payload) {
    let payload: any
    try { payload = JSON.parse(form.payload) } catch {
      return new Response('invalid payload', { status: 400, headers: cors })
    }
    return await handleInteractivity(admin, payload)
  }

  return new Response('unknown body shape', { status: 400, headers: cors })
})

// ============================================================================
// Slash command handler
// ============================================================================
async function handleSlashCommand(admin: SupabaseClient, form: Record<string, string>) {
  const { command, text, user_id, user_name, team_id, channel_id, channel_name } = form
  if (command !== '/livv') {
    return ephemeral(`Unknown command: ${command}`)
  }

  const args = (text || '').trim()
  const [sub, ...rest] = args.split(/\s+/)
  const subRest = rest.join(' ').trim()

  // Resolve tenant_id from slack_team_id.
  const { data: tok } = await admin
    .from('integration_tokens')
    .select('id, tenant_id')
    .eq('platform', 'slack').eq('slack_team_id', team_id).eq('is_active', true).maybeSingle()
  if (!tok) return ephemeral('LivvOS is not connected for this workspace. Ask an admin to install it.')

  const tenantId = tok.tenant_id

  // Resolve livv user from slack_user_id (may be null — user hasn't linked).
  const { data: profile } = await admin
    .from('profiles').select('id, full_name, email').eq('slack_user_id', user_id).maybeSingle()

  switch ((sub || 'help').toLowerCase()) {
    case 'help':
    case '':
      return ephemeral(buildHelpText())

    case 'task': {
      if (!subRest) return ephemeral('Usage: `/livv task <title> | due <date> | assign <@user>`')
      const parsed = parseTaskCommand(subRest)
      if (!parsed.title) return ephemeral('Need a task title. Try `/livv task Diseñar landing | due 2026-05-25`')
      return await createSlashTask(admin, tenantId, profile, parsed, channel_name)
    }

    case 'done': {
      if (!subRest) return ephemeral('Usage: `/livv done <task-id-or-title-search>`')
      return await markTaskDone(admin, tenantId, subRest)
    }

    case 'brief': {
      // Async work — ack quickly, send DM later via response_url.
      const responseUrl = form.response_url
      // Fire-and-forget brief generation
      if (responseUrl) generateBriefAndPost(admin, tenantId, profile, responseUrl).catch(err =>
        console.error('[slack-actions] brief fail:', err))
      return ephemeral('🌅 Generando tu brief diario, llega en unos segundos…')
    }

    default:
      return ephemeral(`Unknown subcommand: \`${sub}\`. Try \`/livv help\`.`)
  }
}

function buildHelpText() {
  return [
    '*LivvBot commands*',
    '',
    '`/livv task <title> | due <YYYY-MM-DD> | assign <@user>` — create a task',
    '   _Example:_ `/livv task Diseñar landing | due 2026-05-25 | assign @maria`',
    '',
    '`/livv done <task-id-or-title-search>` — mark task as completed',
    '   _Example:_ `/livv done Diseñar landing`',
    '',
    '`/livv brief` — get your daily briefing (sent as ephemeral message)',
    '',
    '`/livv help` — this help message',
    '',
    '_You can also `@LivvBot` me in any monitored channel for triage and context._',
  ].join('\n')
}

// "title | due 2026-05-25 | assign @maria" → { title, due, assignee }
function parseTaskCommand(text: string): { title: string; due?: string; assignee?: string } {
  const parts = text.split('|').map(p => p.trim())
  const out: any = { title: parts[0] || '' }
  for (const p of parts.slice(1)) {
    const m = p.match(/^(due|assign)\s+(.+)$/i)
    if (!m) continue
    const key = m[1].toLowerCase()
    if (key === 'due') out.due = m[2].trim()
    else if (key === 'assign') out.assignee = m[2].trim().replace(/^@/, '')
  }
  return out
}

async function createSlashTask(admin: SupabaseClient, tenantId: string, profile: any, parsed: any, channelName: string) {
  // Resolve owner_id (use slash user if linked, else tenant owner)
  let ownerId = profile?.id
  if (!ownerId) {
    const { data: tenant } = await admin.from('tenants').select('owner_id').eq('id', tenantId).maybeSingle()
    ownerId = tenant?.owner_id
  }
  if (!ownerId) return ephemeral('Could not resolve task owner. Link your Slack to LivvOS first.')

  // Validate due_date
  let dueDate: string | null = null
  if (parsed.due) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed.due)) dueDate = parsed.due
    else return ephemeral(`Due date must be YYYY-MM-DD (got "${parsed.due}").`)
  }

  // Resolve assignee (by slack handle → profiles.slack_user_id, or by name fragment)
  let assigneeId: string | null = null
  if (parsed.assignee) {
    // Slack mentions come as <@U123>; strip
    const handle = parsed.assignee.replace(/^<@/, '').replace(/>$/, '').split('|')[0]
    const { data: byId } = await admin
      .from('profiles').select('id, full_name')
      .eq('slack_user_id', handle).maybeSingle()
    if (byId) assigneeId = byId.id
    else {
      const { data: byName } = await admin
        .from('profiles').select('id, full_name')
        .ilike('full_name', `%${parsed.assignee}%`).limit(1).maybeSingle()
      if (byName) assigneeId = byName.id
    }
  }

  const { data: task, error } = await admin
    .from('tasks').insert({
      tenant_id: tenantId,
      owner_id: ownerId,
      title: parsed.title,
      description: `_Created via /livv from #${channelName}._`,
      status: 'Pending',
      priority: 'Medium',
      due_date: dueDate,
      assignee_id: assigneeId,
      completed: false,
    }).select('id, title').single()

  if (error) return ephemeral(`❌ Could not create task: ${error.message}`)

  const dueLabel = dueDate ? ` · due ${dueDate}` : ''
  const assigneeLabel = assigneeId ? ` · assigned` : ''
  return ephemeral(`✅ Created task *${task.title}*${dueLabel}${assigneeLabel}`)
}

async function markTaskDone(admin: SupabaseClient, tenantId: string, query: string) {
  // Try UUID first
  let task: any = null
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
    const { data } = await admin.from('tasks').select('id, title').eq('id', query).eq('tenant_id', tenantId).maybeSingle()
    task = data
  }
  if (!task) {
    // Fuzzy title search among non-completed tasks
    const { data } = await admin
      .from('tasks').select('id, title')
      .eq('tenant_id', tenantId).eq('completed', false)
      .ilike('title', `%${query}%`).order('created_at', { ascending: false }).limit(2)
    if (data && data.length === 1) task = data[0]
    else if (data && data.length > 1) {
      return ephemeral(`Found multiple matches for "${query}":\n${data.map((t: any) => `• ${t.title} (${t.id})`).join('\n')}\nTry the task id.`)
    }
  }
  if (!task) return ephemeral(`No task matches "${query}".`)

  const { error } = await admin
    .from('tasks').update({ completed: true, status: 'Completed' }).eq('id', task.id).eq('tenant_id', tenantId)
  if (error) return ephemeral(`❌ Could not mark done: ${error.message}`)
  return ephemeral(`✅ Marked *${task.title}* as done.`)
}

async function generateBriefAndPost(admin: SupabaseClient, tenantId: string, profile: any, responseUrl: string) {
  // Build a quick brief from DB (no AI needed for v1 — keep cheap)
  const today = new Date().toISOString().slice(0, 10)
  const inWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  const userId = profile?.id || null
  let dueToday: any[] = []
  let overdue: any[] = []
  if (userId) {
    const { data: dueTodayRows } = await admin
      .from('tasks').select('title, priority').eq('tenant_id', tenantId).eq('completed', false)
      .eq('assignee_id', userId).eq('due_date', today).limit(10)
    dueToday = dueTodayRows || []
    const { data: overdueRows } = await admin
      .from('tasks').select('title, priority, due_date').eq('tenant_id', tenantId).eq('completed', false)
      .eq('assignee_id', userId).lt('due_date', today).limit(10)
    overdue = overdueRows || []
  } else {
    const { data: dueTodayRows } = await admin
      .from('tasks').select('title, priority').eq('tenant_id', tenantId).eq('completed', false)
      .eq('due_date', today).limit(10)
    dueToday = dueTodayRows || []
  }

  const lines: string[] = ['🌅 *Brief diario*', '']
  if (overdue.length > 0) {
    lines.push(`🔥 *${overdue.length} vencidas:*`)
    lines.push(...overdue.slice(0, 5).map((t: any) => `   • ${t.title} _(${t.due_date})_`))
    lines.push('')
  }
  if (dueToday.length > 0) {
    lines.push(`📅 *Hoy (${dueToday.length}):*`)
    lines.push(...dueToday.slice(0, 5).map((t: any) => `   • ${t.title}`))
    lines.push('')
  }
  if (overdue.length === 0 && dueToday.length === 0) {
    lines.push('_Sin tasks asignadas para hoy ni vencidas. Buen día._')
  }

  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: 'ephemeral',
      text: lines.join('\n'),
    }),
  })
}

// ============================================================================
// Interactivity handler — Block Kit buttons / select menus
// ============================================================================
async function handleInteractivity(admin: SupabaseClient, payload: any) {
  // Resolve tenant
  const teamId = payload.team?.id
  const { data: tok } = await admin
    .from('integration_tokens').select('id, tenant_id')
    .eq('platform', 'slack').eq('slack_team_id', teamId).eq('is_active', true).maybeSingle()
  if (!tok) return new Response('no tenant', { status: 200, headers: cors })

  if (payload.type === 'block_actions') {
    const action = payload.actions?.[0]
    if (!action) return new Response('', { status: 200, headers: cors })

    switch (action.action_id) {
      case 'accept_task_proposal': {
        // value contains the communication_messages.id
        const messageId = action.value
        const { data: msg } = await admin
          .from('communication_messages').select('id, ai_classification, matched_client_id, matched_project_id, tenant_id, channel_name')
          .eq('id', messageId).maybeSingle()
        if (!msg) return new Response('', { status: 200, headers: cors })

        const sug = msg.ai_classification?.suggested_task
        if (!sug?.title) return new Response('', { status: 200, headers: cors })

        const { data: tenant } = await admin.from('tenants').select('owner_id').eq('id', msg.tenant_id).maybeSingle()
        const { data: task } = await admin.from('tasks').insert({
          tenant_id: msg.tenant_id,
          owner_id: tenant?.owner_id,
          title: sug.title,
          description: (sug.description || '') + `\n\n_Created from Slack #${msg.channel_name} (accepted from inbox)._`,
          status: 'Pending',
          priority: 'Medium',
          due_date: sug.due_date,
          project_id: msg.matched_project_id,
          client_id: msg.matched_client_id,
          completed: false,
        }).select('id').single()

        if (task) {
          await admin.from('communication_messages').update({
            task_id: task.id, status: 'auto_resolved',
          }).eq('id', messageId)
        }
        return new Response(JSON.stringify({
          replace_original: true,
          text: `✅ Task *${sug.title}* creada. Abrila en LivvOS para asignar y darle prioridad.`,
        }), { headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      case 'dismiss_proposal': {
        const messageId = action.value
        await admin.from('communication_messages').update({ status: 'archived' }).eq('id', messageId)
        return new Response(JSON.stringify({
          replace_original: true,
          text: '🗑️ Propuesta descartada.',
        }), { headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      case 'snooze_task': {
        // value = "<task_id>|24h" or "<task_id>|tomorrow"
        const [taskId] = (action.value || '').split('|')
        if (!taskId) return new Response('', { status: 200, headers: cors })
        const newDue = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
        await admin.from('tasks').update({ due_date: newDue }).eq('id', taskId).eq('tenant_id', tok.tenant_id)
        return new Response(JSON.stringify({
          replace_original: true,
          text: `😴 Snoozed para ${newDue}.`,
        }), { headers: { ...cors, 'Content-Type': 'application/json' } })
      }

      default:
        return new Response('', { status: 200, headers: cors })
    }
  }

  return new Response('', { status: 200, headers: cors })
}

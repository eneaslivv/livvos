// @ts-nocheck
// task-assignee-dm — Reverse flow: OS → Slack DM cuando alguien se asigna
// una task. Disparado por trigger Postgres on tasks.assignee_id change.
//
// Flow:
//   1. Recibe { task_id }
//   2. Lee task + project + client + assignee profile
//   3. Si profiles.slack_user_id está null → skip (in-app notif ya se
//      crea via trigger_notify_task_assignment_v2 que existe). Sin Slack ID
//      no se puede mandar DM.
//   4. Lee slack_bot_token del tenant.
//   5. Envía chat.postMessage con channel=<user_slack_id> (Slack auto-DM)
//      con block kit:
//        - Header: "Te asignó una tarea"
//        - Body: title, due, priority, project, client
//        - Buttons: ✅ Aceptar | 😴 Snooze 24h | 🔗 Ver en LivvOS
//        action_id values: "accept_assigned_task|<task_id>", etc.
//        slack-actions ya tiene handler para snooze_task.
//
// verify_jwt=false porque lo invoca el trigger Postgres.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') || 'https://app.livv.systems'

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function slackPost(botToken: string, payload: any): Promise<any> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack: ${data.error}`)
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return new Response('POST required', { status: 405, headers: cors })

  let body: any
  try { body = await req.json() } catch { return new Response('invalid json', { status: 400, headers: cors }) }
  const taskId: string | undefined = body.task_id
  if (!taskId) return new Response(JSON.stringify({ error: 'task_id required' }), {
    status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
  })

  const admin = adminClient()
  try {
    const result = await sendDM(admin, taskId)
    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[task-assignee-dm]', taskId, err)
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

async function sendDM(admin: SupabaseClient, taskId: string) {
  // 1. Load task
  const { data: task } = await admin
    .from('tasks')
    .select('id, tenant_id, title, description, due_date, priority, project_id, client_id, assignee_id, owner_id')
    .eq('id', taskId).maybeSingle()
  if (!task) return { ok: true, skipped: 'task_not_found' }
  if (!task.assignee_id) return { ok: true, skipped: 'no_assignee' }

  // 2. Assignee profile
  const { data: assignee } = await admin
    .from('profiles').select('id, full_name, email, slack_user_id')
    .eq('id', task.assignee_id).maybeSingle()
  if (!assignee) return { ok: true, skipped: 'assignee_profile_not_found' }
  if (!assignee.slack_user_id) return { ok: true, skipped: 'assignee_no_slack_linked' }

  // 3. Slack token for tenant
  const { data: tok } = await admin
    .from('integration_tokens')
    .select('slack_bot_token, access_token')
    .eq('platform', 'slack').eq('tenant_id', task.tenant_id).eq('is_active', true).maybeSingle()
  if (!tok) return { ok: true, skipped: 'no_slack_token_for_tenant' }
  const botToken = tok.slack_bot_token || tok.access_token

  // 4. Optional context: project + client + assigned_by
  let projectName: string | null = null
  let clientName: string | null = null
  if (task.project_id) {
    const { data: p } = await admin.from('projects').select('title').eq('id', task.project_id).maybeSingle()
    projectName = p?.title || null
  }
  if (task.client_id) {
    const { data: c } = await admin.from('clients').select('name').eq('id', task.client_id).maybeSingle()
    clientName = c?.name || null
  }

  // 5. Build block kit
  const dueLine = task.due_date ? `📅 Vence: *${task.due_date}*` : '📅 Sin fecha'
  const priorityLine = task.priority ? `🎯 Prioridad: *${task.priority}*` : ''
  const projectLine = projectName ? `📁 Proyecto: *${projectName}*` : ''
  const clientLine = clientName ? `👤 Cliente: *${clientName}*` : ''
  const meta = [dueLine, priorityLine, projectLine, clientLine].filter(Boolean).join('  ·  ')

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🎯 *Te asignaron una tarea*\n\n*${task.title}*`,
      },
    },
    ...(task.description ? [{
      type: 'section',
      text: { type: 'mrkdwn', text: `_${(task.description || '').slice(0, 300)}_` },
    }] : []),
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: meta }],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Aceptar' },
          style: 'primary',
          action_id: 'accept_assigned_task',
          value: task.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '😴 Snooze 24h' },
          action_id: 'snooze_task',
          value: `${task.id}|24h`,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '🔗 Ver en LivvOS' },
          url: `${APP_URL}/?task=${task.id}`,
        },
      ],
    },
  ]

  // 6. Post DM to Slack (channel = user_id auto-opens IM)
  await slackPost(botToken, {
    channel: assignee.slack_user_id,
    text: `Te asignaron: ${task.title}`,  // fallback text for notifications
    blocks,
  })

  return { ok: true, sent_to: assignee.full_name || assignee.email, task_id: taskId }
}

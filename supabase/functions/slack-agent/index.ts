// @ts-nocheck
// slack-agent — bot conversacional que responde en Slack cuando alguien
// menciona al bot (@LivvBot) o le manda DM. Sigue el patrón de aurora-chat
// pero simplificado: tool-calling loop hasta MAX_LOOPS=4, herramientas
// focused en triage (crear task, leer contexto de proyecto, postear reply).
//
// Flujo:
//   1. slack-events detecta event.type='app_mention' y dispara slack-agent
//      via pg_net (fire-and-forget) con { message_id }.
//   2. slack-agent carga el mensaje + thread context + clients + projects.
//   3. Llama OpenAI gpt-4o-mini con tool calling.
//   4. El agent decide:
//        - Solo responder (info_only, question) → post_reply
//        - Crear task + responder → create_task + post_reply
//        - Pedir más info → post_reply con clarifying question
//   5. La respuesta se postea en el thread Slack via chat.postMessage.
//   6. Marca communication_messages.replied=true + reply_sent=true.
//
// verify_jwt=false porque lo invoca el trigger Postgres o slack-events.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''

const OPENAI_MODEL = 'gpt-4o-mini'
const MAX_LOOPS = 4

const SYSTEM_PROMPT = `You are LivvBot, the AI triage assistant for a creative agency, embedded in Slack.

You only speak when someone @-mentions you in a channel or DMs you. Your job is to be helpful and brief: read the thread, understand what they want, and either:
  • Answer their question concisely (1-3 sentences), OR
  • Create a task in the agency's project management system if they ask you to, OR
  • Pull project context (recent tasks, status) and summarize it back, OR
  • Ask one clarifying question if their ask is ambiguous.

Use the available tools to look up project context BEFORE answering questions about specific projects. Use create_task ONLY when the user explicitly asks to track something as a task (e.g. "create a task for X", "remind us to do Y", "add to do list").

Tone: friendly, professional, brief. Always respond in the same language as the user. Use plain text (no markdown headings) since this is Slack. You can use *bold*, _italic_, and \`code\` (Slack markdown).

When you're ready to respond, call post_reply with your final message. Do NOT call post_reply multiple times. If you created a task, mention the title in the reply.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_project_context',
      description: 'Get recent tasks and status for a specific project. Use BEFORE answering questions about a project.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'The project UUID from the projects[] list in the system message.' },
        },
        required: ['project_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new task in the agency system. Only call when explicitly asked.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short imperative title.' },
          description: { type: 'string', description: '1-3 sentences with context.' },
          due_date: { type: ['string', 'null'], description: 'YYYY-MM-DD or null.' },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High'] },
          project_id: { type: ['string', 'null'], description: 'project UUID or null' },
          client_id: { type: ['string', 'null'], description: 'client UUID or null' },
        },
        required: ['title', 'description', 'due_date', 'priority', 'project_id', 'client_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_reply',
      description: 'Post your final reply to the Slack thread. Call this ONCE when you are ready to respond.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Your reply text. Slack markdown supported.' },
        },
        required: ['text'],
        additionalProperties: false,
      },
    },
  },
]

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function slackFetch<T = any>(botToken: string, method: string, payload: any, isPost = true): Promise<T> {
  const url = `https://slack.com/api/${method}`
  const opts: any = {
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  }
  if (isPost) {
    opts.method = 'POST'
    opts.body = JSON.stringify(payload)
  }
  const res = await fetch(url, opts)
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error || 'unknown'}`)
  return data as T
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

  let body: any
  try { body = await req.json() } catch { return new Response('invalid json', { status: 400, headers: cors }) }
  const messageId: string | undefined = body.message_id
  const dryRun: boolean = !!body.dry_run
  if (!messageId) {
    return new Response(JSON.stringify({ error: 'message_id required' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const admin = adminClient()
  try {
    const result = await respond(admin, messageId, dryRun)
    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[slack-agent]', messageId, err)
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

async function respond(admin: SupabaseClient, messageId: string, dryRun = false) {
  // 1. Load message + tenant
  const { data: msg, error: msgErr } = await admin
    .from('communication_messages')
    .select('id, tenant_id, platform, from_id, from_name, body_text, channel_id, channel_name, thread_id, thread_context, matched_project_id, matched_client_id, ai_classification, replied_at, reply_sent')
    .eq('id', messageId)
    .maybeSingle()
  if (msgErr) throw msgErr
  if (!msg) return { ok: true, skipped: 'not_found' }
  if (msg.platform !== 'slack') return { ok: true, skipped: 'not_slack' }
  if (msg.reply_sent) return { ok: true, skipped: 'already_replied' }

  // 2. Load slack token
  const { data: tok } = await admin
    .from('integration_tokens')
    .select('slack_bot_token, access_token, slack_bot_user_id')
    .eq('platform', 'slack')
    .eq('tenant_id', msg.tenant_id)
    .eq('is_active', true)
    .maybeSingle()
  if (!tok) return { ok: false, skipped: 'no_slack_token' }
  const botToken = tok.slack_bot_token || tok.access_token

  // 3. Load context (clients, projects)
  const { data: tenant } = await admin.from('tenants').select('name, owner_id').eq('id', msg.tenant_id).maybeSingle()
  const { data: clients } = await admin.from('clients').select('id, name, email, company').eq('tenant_id', msg.tenant_id).limit(50)
  const { data: projects } = await admin.from('projects').select('id, title, status').eq('tenant_id', msg.tenant_id).limit(50)

  // 4. Build user message for the agent
  const threadLines = (msg.thread_context || []).map((m: any) => `- ${m.from}: ${m.body}`).join('\n')
  const userContent = JSON.stringify({
    agency: tenant?.name || 'this agency',
    from: msg.from_name,
    channel: msg.channel_name,
    message: msg.body_text,
    thread_context: threadLines || '(none)',
    matched_project_id: msg.matched_project_id,
    matched_client_id: msg.matched_client_id,
    available_clients: clients || [],
    available_projects: projects || [],
  })

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]

  // 5. Tool-calling loop
  let finalReply: string | null = null
  let createdTaskId: string | null = null
  let projectContextCache: Record<string, any> = {}

  for (let i = 0; i < MAX_LOOPS && !finalReply; i++) {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 1200,
      }),
    })
    if (!openaiRes.ok) throw new Error(`openai ${openaiRes.status}: ${(await openaiRes.text()).slice(0, 200)}`)
    const data = await openaiRes.json()
    const choice = data.choices?.[0]
    if (!choice) throw new Error('no choices from openai')
    const assistantMsg = choice.message
    messages.push(assistantMsg)

    const toolCalls = assistantMsg.tool_calls || []
    if (toolCalls.length === 0) {
      // Model gave a final text without calling post_reply — use it as fallback.
      if (assistantMsg.content) finalReply = assistantMsg.content
      break
    }

    for (const tc of toolCalls) {
      const name = tc.function.name
      let args: any = {}
      try { args = JSON.parse(tc.function.arguments || '{}') } catch {}

      let result: any = { ok: true }
      if (name === 'get_project_context') {
        const pid = args.project_id
        if (projectContextCache[pid]) {
          result = projectContextCache[pid]
        } else {
          const { data: tasks } = await admin
            .from('tasks')
            .select('id, title, status, priority, due_date')
            .eq('tenant_id', msg.tenant_id)
            .eq('project_id', pid)
            .order('created_at', { ascending: false })
            .limit(10)
          const { data: proj } = await admin
            .from('projects').select('title, status, description')
            .eq('id', pid).eq('tenant_id', msg.tenant_id).maybeSingle()
          result = { project: proj, recent_tasks: tasks || [] }
          projectContextCache[pid] = result
        }
      } else if (name === 'create_task') {
        const ownerId = tenant?.owner_id
        if (!ownerId) { result = { ok: false, error: 'no_owner' } }
        else if (dryRun) {
          // Simulate: tell the model the task "was created" so it can mention it
          // in the final reply, but don't actually persist.
          result = { ok: true, dry_run: true, task_title: args.title }
          createdTaskId = 'dry-run-task-id'
        }
        else {
          const { data: created, error } = await admin
            .from('tasks').insert({
              tenant_id: msg.tenant_id,
              owner_id: ownerId,
              title: args.title,
              description: (args.description || '') + `\n\n_Created from Slack #${msg.channel_name} by @LivvBot._`,
              status: 'Pending',
              priority: args.priority || 'Medium',
              due_date: args.due_date,
              project_id: args.project_id || msg.matched_project_id,
              client_id: args.client_id || msg.matched_client_id,
              completed: false,
            }).select('id').single()
          if (error) result = { ok: false, error: error.message }
          else { result = { ok: true, task_id: created.id, task_title: args.title }; createdTaskId = created.id }
        }
      } else if (name === 'post_reply') {
        finalReply = args.text || ''
        result = { ok: true, posted: true }
      } else {
        result = { ok: false, error: 'unknown_tool' }
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      })
    }
  }

  // 6. Post to Slack (skipped in dry_run)
  if (!finalReply) finalReply = 'Listo, lo registré. Si querés que arme una tarea, pedímelo explícitamente.'

  let postOk = false
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      reply: finalReply,
      task_would_create: createdTaskId !== null,
      iterations: messages.filter((m: any) => m.role === 'assistant').length,
    }
  }
  try {
    await slackFetch(botToken, 'chat.postMessage', {
      channel: msg.channel_id,
      thread_ts: msg.thread_id || undefined,
      text: finalReply,
    })
    postOk = true
  } catch (err) {
    console.error('[slack-agent] chat.postMessage failed:', err)
  }

  // 7. Mark replied. reply_sent is text (not boolean) — convention here: 'agent'
  // for slack-agent automated replies, distinguishable from human 'manual' later.
  const updates: any = {
    status: postOk ? 'replied' : 'pending',
  }
  if (postOk) {
    updates.replied_at = new Date().toISOString()
    updates.reply_sent = 'agent'
  }
  if (createdTaskId) updates.task_id = createdTaskId

  await admin.from('communication_messages').update(updates).eq('id', messageId)

  return {
    ok: postOk,
    reply: finalReply,
    task_created: createdTaskId,
    iterations: messages.filter((m: any) => m.role === 'assistant').length,
  }
}

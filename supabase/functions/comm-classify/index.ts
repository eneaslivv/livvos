// @ts-nocheck
// comm-classify — AI classifier dedicado para communication_messages.
//
// Delega el call al modelo a la edge fn `gemini` con type='comm_classify',
// para mantener una sola fuente del prompt + quotas + retries.
//
// Flujo:
//   1. Recibe { message_id: uuid }.
//   2. Lee el mensaje + tenant + clients + projects.
//   3. Si ai_processed=true: idempotent skip.
//   4. Si platform='slack': lee slack_monitored_channels.inbound_mode.
//        - ignore: marca ai_processed=true y sale.
//        - notify_only: marca ai_processed=true sin AI.
//        - classify_and_propose / classify_and_auto_create: continúa.
//   5. Invoca gemini fn con type='comm_classify'.
//   6. Deriva confidence heurístico.
//   7. UPDATE communication_messages con ai_classification + matched_*.
//   8. Si mode=auto_create AND should_create_task AND confidence>=0.85: crea task.
//   9. Else si should_create_task AND confidence>=0.50: crea notification.
//
// verify_jwt=false porque lo invoca trigger Postgres via pg_net y scripts de backfill.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',').map((s) => s.trim()).filter(Boolean)
const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0] || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Optional shared secret. When set (this env var + the matching
// app.comm_classify_secret GUC that queue_comm_classify forwards), the endpoint
// rejects any caller that doesn't present it. Unset → no enforcement, so the
// pipeline keeps working until both halves are configured (back-compat).
const INTERNAL_SECRET = Deno.env.get('COMM_CLASSIFY_SECRET') || ''

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const AUTO_CREATE_THRESHOLD = 0.85
const PROPOSE_THRESHOLD = 0.50
const GEMINI_FN_URL = `${SUPABASE_URL}/functions/v1/gemini`

function deriveConfidence(result: any): number {
  let score = 0.25
  if (result.should_create_task) score += 0.10
  if (result.matched_client_id) score += 0.25
  if (result.matched_project_id) score += 0.20
  if (result.match_reason) score += 0.05
  const strongIntents = ['new_request', 'urgent']
  if (strongIntents.includes(result.intent)) score += 0.15
  if (result.intent === 'feedback') score += 0.05
  if (result.suggested_task?.title && result.suggested_task?.description) score += 0.05
  return Math.min(0.95, +score.toFixed(2))
}

function adminClient(): SupabaseClient {
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

  // Soft internal-auth gate (see INTERNAL_SECRET above). message_ids are
  // unguessable UUIDs and processing is idempotent, but when the secret is
  // configured this closes the publicly-callable hole entirely.
  if (INTERNAL_SECRET && (req.headers.get('x-internal-secret') || '') !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let body: any
  try { body = await req.json() }
  catch { return new Response('invalid json', { status: 400, headers: cors }) }

  const messageId: string | undefined = body.message_id
  if (!messageId) {
    return new Response(JSON.stringify({ error: 'message_id required' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const admin = adminClient()
  try {
    const result = await classify(admin, messageId)
    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[comm-classify]', messageId, err)
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

async function classify(admin: SupabaseClient, messageId: string) {
  const { data: msg, error: msgErr } = await admin
    .from('communication_messages')
    .select('id, tenant_id, platform, from_id, from_name, from_email, subject, body_text, channel_id, channel_name, thread_id, thread_context, ai_processed, matched_project_id, ai_classification, received_at')
    .eq('id', messageId)
    .maybeSingle()
  if (msgErr) throw msgErr
  if (!msg) return { ok: true, skipped: 'not_found' }
  if (msg.ai_processed) return { ok: true, skipped: 'already_processed' }

  let mode: 'ignore' | 'notify_only' | 'classify_and_propose' | 'classify_and_auto_create' = 'classify_and_propose'
  if (msg.platform === 'slack' && msg.channel_id) {
    const { data: ch } = await admin
      .from('slack_monitored_channels')
      .select('inbound_mode')
      .eq('tenant_id', msg.tenant_id)
      .eq('channel_id', msg.channel_id)
      .maybeSingle()
    if (ch?.inbound_mode) mode = ch.inbound_mode as any
  }

  if (mode === 'ignore') {
    await admin.from('communication_messages')
      .update({ ai_processed: true, ai_classification: { skipped: 'ignore_mode' } })
      .eq('id', messageId)
    return { ok: true, skipped: 'ignore_mode' }
  }
  if (mode === 'notify_only') {
    await admin.from('communication_messages')
      .update({ ai_processed: true, ai_classification: { skipped: 'notify_only_mode' } })
      .eq('id', messageId)
    return { ok: true, skipped: 'notify_only_mode' }
  }

  // Circuit breaker: si las últimas 5 clasificaciones del tenant fallaron,
  // pausamos. Esto previene quemar OpenAI quota durante outages upstream.
  const { data: recentErrs } = await admin
    .from('communication_messages')
    .select('ai_classification')
    .eq('tenant_id', msg.tenant_id)
    .eq('platform', msg.platform)
    .not('ai_classification', 'is', null)
    .order('received_at', { ascending: false })
    .limit(5)
  const failureCount = (recentErrs || []).filter((m: any) => m.ai_classification?.error).length
  if (failureCount >= 3) {
    await admin.from('communication_messages')
      .update({ ai_classification: { error: 'circuit_breaker_active', detail: `${failureCount}/5 recent failures` } })
      .eq('id', messageId)
    await maybeNotifyCircuitBreaker(admin, msg.tenant_id, failureCount)
    return { ok: false, skipped: 'circuit_breaker_active', recent_failures: failureCount }
  }

  const { data: tenantRow } = await admin
    .from('tenants').select('name').eq('id', msg.tenant_id).maybeSingle()
  const { data: clientsList } = await admin
    .from('clients').select('id, name, email, company').eq('tenant_id', msg.tenant_id).limit(100)
  const { data: projectsList } = await admin
    .from('projects').select('id, title, client_id, clients(name)').eq('tenant_id', msg.tenant_id).limit(100)

  // Pull thread context from DB if missing — esto resuelve el caso del
  // mensaje "este también asap" donde el classifier no sabe qué es "este"
  // porque thread_context viene vacío en muchos mensajes que vienen via
  // slack-events sin batch context.
  let threadCtx: any[] = Array.isArray(msg.thread_context) ? msg.thread_context : []
  if (threadCtx.length === 0 && msg.thread_id) {
    const { data: priorMsgs } = await admin
      .from('communication_messages')
      .select('from_name, body_text, received_at')
      .eq('tenant_id', msg.tenant_id)
      .eq('thread_id', msg.thread_id)
      .neq('id', msg.id)
      .lte('received_at', msg.received_at || new Date().toISOString())
      .order('received_at', { ascending: true })
      .limit(8)
    threadCtx = (priorMsgs || []).map((m: any) => ({
      from: m.from_name || 'unknown',
      body: (m.body_text || '').slice(0, 400),
      date: m.received_at,
    }))
  }

  const classifyInput = {
    platform: msg.platform,
    from_name: msg.from_name || '',
    from_email: msg.from_email || '',
    subject: msg.subject || (msg.channel_name ? `#${msg.channel_name}` : ''),
    body: (msg.body_text || '').slice(0, 4000),
    thread_context: threadCtx,
    agency_name: tenantRow?.name || 'this agency',
    clients: (clientsList || []).map((c: any) => ({
      id: c.id, name: c.name || '', email: c.email || '', company: c.company || ''
    })),
    projects: (projectsList || []).map((p: any) => ({
      id: p.id, title: p.title || '', client_id: p.client_id || null, client_name: p.clients?.name || null
    })),
  }

  // Delegamos al gemini fn — single source of prompt + model + quota tracking.
  // Auth con service_role: la gemini fn no requiere JWT pero el SR garantiza
  // que pasamos cualquier verify_jwt si en el futuro lo activamos.
  const geminiRes = await fetch(GEMINI_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      type: 'comm_classify',
      input: JSON.stringify(classifyInput),
    }),
  })

  if (!geminiRes.ok) {
    const errText = await geminiRes.text()
    console.error('[comm-classify] gemini error', geminiRes.status, errText.slice(0, 500))
    await admin.from('communication_messages')
      .update({ ai_classification: { error: 'gemini_call_failed', status: geminiRes.status, detail: errText.slice(0, 500) } })
      .eq('id', messageId)
    throw new Error(`gemini ${geminiRes.status}: ${errText.slice(0, 200)}`)
  }
  const geminiData = await geminiRes.json()
  const result: any = geminiData?.result
  if (!result) {
    console.error('[comm-classify] gemini returned no result', JSON.stringify(geminiData).slice(0, 300))
    await admin.from('communication_messages')
      .update({ ai_classification: { error: 'gemini_no_result', raw: geminiData } })
      .eq('id', messageId)
    throw new Error('gemini_no_result')
  }

  // Sanity: ensure required fields exist; if not, mark and exit.
  if (!result.intent && !result.summary) {
    await admin.from('communication_messages')
      .update({ ai_classification: { error: 'schema_invalid', raw: result } })
      .eq('id', messageId)
    return { ok: true, action: 'invalid_schema' }
  }

  const confidence = deriveConfidence(result)
  result.confidence = confidence

  const updates: any = {
    ai_processed: true,
    ai_classification: result,
  }
  if (result.matched_client_id) {
    const { data: c } = await admin.from('clients')
      .select('id').eq('id', result.matched_client_id).eq('tenant_id', msg.tenant_id).maybeSingle()
    if (c) updates.matched_client_id = result.matched_client_id
  }
  if (result.matched_project_id && !msg.matched_project_id) {
    const { data: p } = await admin.from('projects')
      .select('id').eq('id', result.matched_project_id).eq('tenant_id', msg.tenant_id).maybeSingle()
    if (p) updates.matched_project_id = result.matched_project_id
  }

  await admin.from('communication_messages').update(updates).eq('id', messageId)

  const shouldTask = !!result.should_create_task && !!result.suggested_task?.title
  const finalProjectId = updates.matched_project_id || msg.matched_project_id || null
  const finalClientId = updates.matched_client_id || null

  if (shouldTask && mode === 'classify_and_auto_create' && confidence >= AUTO_CREATE_THRESHOLD) {
    const taskId = await createTaskFromMessage(admin, msg, result, finalClientId, finalProjectId)
    if (taskId) {
      await admin.from('communication_messages')
        .update({ task_id: taskId, status: 'auto_resolved' }).eq('id', messageId)
      return { ok: true, action: 'task_created', task_id: taskId, confidence, intent: result.intent }
    }
  }

  if (shouldTask && confidence >= PROPOSE_THRESHOLD) {
    await createProposalNotification(admin, msg, result, finalClientId, finalProjectId, confidence)
    return { ok: true, action: 'proposal_notified', confidence, intent: result.intent }
  }

  return { ok: true, action: 'classified_no_action', confidence, intent: result.intent }
}

async function createTaskFromMessage(
  admin: SupabaseClient, msg: any, result: any,
  clientId: string | null, projectId: string | null,
): Promise<string | null> {
  const sug = result.suggested_task
  if (!sug?.title) return null

  const { data: tenant } = await admin
    .from('tenants').select('owner_id').eq('id', msg.tenant_id).maybeSingle()
  const ownerId = tenant?.owner_id
  if (!ownerId) {
    console.warn('[comm-classify] no tenant owner for', msg.tenant_id)
    return null
  }

  const sourceFooter = msg.platform === 'slack' && msg.channel_name
    ? `\n\n_Auto-created from Slack message in #${msg.channel_name} on ${new Date().toISOString().slice(0,10)}._`
    : `\n\n_Auto-created from ${msg.platform} message on ${new Date().toISOString().slice(0,10)}._`
  const description = (sug.description || result.summary || '') + sourceFooter

  let dueDate: string | null = null
  if (sug.due_date && /^\d{4}-\d{2}-\d{2}$/.test(sug.due_date)) {
    const d = new Date(sug.due_date)
    if (!isNaN(d.getTime()) && d.getTime() > Date.now() - 86400000) dueDate = sug.due_date
  }

  const { data: created, error } = await admin
    .from('tasks')
    .insert({
      tenant_id: msg.tenant_id,
      owner_id: ownerId,
      title: sug.title,
      description,
      status: 'Pending',
      priority: result.priority === 'high' ? 'High' : result.priority === 'low' ? 'Low' : 'Medium',
      due_date: dueDate,
      project_id: projectId,
      client_id: clientId,
      completed: false,
    })
    .select('id').single()
  if (error) {
    console.error('[comm-classify] task insert failed', error)
    return null
  }
  return created.id
}

async function createProposalNotification(
  admin: SupabaseClient, msg: any, result: any,
  clientId: string | null, projectId: string | null, confidence: number,
) {
  const { data: tenant } = await admin
    .from('tenants').select('owner_id').eq('id', msg.tenant_id).maybeSingle()
  const ownerId = tenant?.owner_id
  if (!ownerId) return

  const sug = result.suggested_task
  const channelLabel = msg.channel_name ? `#${msg.channel_name}` : (msg.platform === 'gmail' ? 'email' : msg.platform)
  const fromLabel = msg.from_name || 'someone'

  const title = sug?.title
    ? `📥 ${fromLabel} en ${channelLabel}: "${sug.title}"`
    : `📥 ${fromLabel} en ${channelLabel} (${result.intent || 'message'})`

  const message = result.summary || sug?.description || 'Click to review and create the task.'

  const notifPriority =
    result.intent === 'urgent' ? 'urgent'
    : result.priority === 'high' ? 'high'
    : result.priority === 'low' ? 'low'
    : 'medium'

  const { error: notifErr } = await admin.from('notifications').insert({
    user_id: ownerId,
    tenant_id: msg.tenant_id,
    type: 'mention',  // closest allowed value — see notifications_type_check
    category: 'communications',
    title,
    message: message.slice(0, 500),
    link: `/?communications=open&message=${msg.id}`,
    priority: notifPriority,
    action_required: true,
    action_url: `/?communications=open&message=${msg.id}&action=create_task`,
    action_text: 'Review & create task',
    metadata: {
      message_id: msg.id,
      suggested_task: sug,
      confidence,
      intent: result.intent,
      matched_client_id: clientId,
      matched_project_id: projectId,
      platform: msg.platform,
      channel: msg.channel_name,
    },
  })
  if (notifErr) console.error('[comm-classify] notification insert failed', notifErr)
}

// ---------- circuit breaker notification (rate-limited 1/hour) ----------------
async function maybeNotifyCircuitBreaker(admin: SupabaseClient, tenantId: string, failureCount: number) {
  const { data: tenant } = await admin
    .from('tenants').select('owner_id').eq('id', tenantId).maybeSingle()
  if (!tenant?.owner_id) return

  // De-dupe: si ya hubo una notif de tipo system en la última hora, skip
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('type', 'system')
    .eq('category', 'communications')
    .ilike('title', '%circuit breaker%')
    .gte('created_at', since)
  if ((count ?? 0) > 0) return

  await admin.from('notifications').insert({
    user_id: tenant.owner_id,
    tenant_id: tenantId,
    type: 'system',
    category: 'communications',
    title: '🚨 Slack agent — circuit breaker active',
    message: `Las últimas ${failureCount} clasificaciones de mensajes Slack fallaron consecutivamente. El clasificador está pausado para evitar quemar quota de OpenAI. Verificá el dashboard de Master · Slack agent.`,
    priority: 'high',
    action_required: true,
    action_url: '/?master=true&page=platform_slack_agent',
    action_text: 'Open dashboard',
    metadata: { failure_count: failureCount },
  })
}

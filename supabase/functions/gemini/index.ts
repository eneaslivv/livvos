// @ts-nocheck
// Supabase Edge Function: Gemini proxy
// Requires GEMINI_API_KEY in function environment

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildSystemPrompt } from './prompts.ts'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-custom-version, apikey, content-type',
}

const DAILY_QUOTA = 200 // max AI calls per tenant per day (safe with paid tier ~$0.002/call)

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

type TaskResponse = {
  title: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  tag?: string
}

type TasksBulkResponse = {
  phases: {
    name: string
    startDate?: string
    endDate?: string
    budget?: number
    tasks: { title: string; priority: 'low' | 'medium' | 'high'; dueDate?: string; assignee?: string | null; subtasks?: { title: string }[] }[]
  }[]
}

type ProposalResponse = {
  summary: string
  content: string
  timeline: { week: number; title: string; detail: string }[]
  language?: 'en' | 'es'
}

type BlogResponse = {
  title: string
  excerpt: string
  content: string
  language?: 'en' | 'es'
}

type WeeklySummaryResponse = {
  objectives: string[]
  focus_tasks: string[]
  recommendations: string[]
}

type AdvisorResponse = {
  insights: { area: string; icon: string; title: string; body: string; priority: 'high' | 'medium' | 'low' }[]
  greeting: string
}

type PlanPeriodResponse = {
  changes: {
    taskId: string
    taskTitle: string
    currentDate?: string
    newDate?: string
    currentTime?: string
    newTime?: string
    currentAssignee?: string
    newAssignee?: string
    currentPriority?: string
    newPriority?: string
    reason: string
  }[]
  summary: string
}

type StandupAction = {
  type: 'complete' | 'create' | 'update_status' | 'flag_blocked'
  taskId?: string
  taskTitle: string
  newTask?: { title: string; priority: 'low' | 'medium' | 'high'; dueDate?: string; projectName?: string }
  updates?: { status?: string; priority?: string }
  reason: string
}

type StandupResponse = {
  summary: string
  actions: StandupAction[]
  risks: { type: string; title: string; description: string; severity: 'low' | 'medium' | 'high' }[]
}

type FinanceEntryResponse = {
  kind: 'income' | 'expense'
  concept: string
  amount: number
  date: string // YYYY-MM-DD
  client_id?: string | null
  client_name?: string | null
  project_id?: string | null
  project_name?: string | null
  category?: string | null   // expense only — must match one of the provided EXPENSE_CATEGORIES
  vendor?: string | null     // expense only
  num_installments?: number  // income only — defaults to 1
  status?: 'paid' | 'pending'
  recurring?: boolean
  questions?: string[]       // open questions to ask the user before saving
  confidence: number         // 0..1 — how sure the model is
  notes?: string | null
}

type FinanceBatchResponse = {
  entries: FinanceEntryResponse[]
  // Names found in the input that did not match any existing client/project.
  // The frontend can then offer to create them.
  unknown_clients?: string[]
  unknown_projects?: string[]
  summary?: string
}

// ─── Simple in-memory rate limiter (per edge function instance) ──
const rateLimiter = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10     // max requests per window
const RATE_WINDOW = 60000 // 1 minute window

async function hashString(s: string): Promise<string> {
  const data = new TextEncoder().encode(s)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimiter.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Extract user from auth header for rate limiting
    const authHeader = req.headers.get('authorization') || ''
    const userKey = authHeader.slice(-16) || 'anon' // last 16 chars as user identifier
    if (!checkRateLimit(userKey)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment before trying again.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve user and tenant from JWT
    const supabaseAdmin = getSupabaseAdmin()
    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user: authUser } } = await supabaseAdmin.auth.getUser(jwt)
    const userId = authUser?.id || null
    let tenantId: string | null = null

    if (userId) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('tenant_id')
        .eq('id', userId)
        .single()
      tenantId = profile?.tenant_id || null
    }

    // Check if tenant has AI feature enabled. Features live in tenant_config (one row per tenant),
    // not in tenants. Fail-open if no config row exists or features is null — only block when
    // ai_assistant is explicitly set to false.
    if (tenantId) {
      const { data: config } = await supabaseAdmin
        .from('tenant_config')
        .select('features')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (config?.features && config.features.ai_assistant === false) {
        return new Response(JSON.stringify({ error: 'AI no está habilitado para este equipo.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Daily quota check per tenant
    if (tenantId) {
      const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      const { count } = await supabaseAdmin
        .from('ai_usage_log')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', `${today}T00:00:00Z`)
      if ((count || 0) >= DAILY_QUOTA) {
        return new Response(JSON.stringify({ error: 'Límite diario de AI alcanzado. Intenta mañana.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const body = await req.json()
    const { type, input, profile: clientProfile } = body || {}

    if (!input || typeof input !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing input' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── Load tenant AI profile ─────────────────────────────────────
    // Source-of-truth precedence: client-provided profile (fresh from frontend)
    // overrides DB row only if explicitly passed; otherwise we fetch from DB.
    // Server-fetched is canonical because clients can't fabricate tenant_id.
    type AIProfile = {
      business_description?: string | null
      industry?: string | null
      target_audience?: string | null
      brand_voice?: string | null
      tone?: string | null
      primary_language?: string | null
      goals?: string[] | null
      constraints?: string | null
      custom_instructions?: string | null
      last_active_projects_summary?: string | null
      last_finance_summary?: string | null
    }
    let aiProfile: AIProfile | null = null
    if (tenantId) {
      const { data } = await supabaseAdmin
        .from('tenant_ai_profile')
        .select('business_description, industry, target_audience, brand_voice, tone, primary_language, goals, constraints, custom_instructions, last_active_projects_summary, last_finance_summary')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      aiProfile = (data as AIProfile) || null
    }
    // Allow client to enrich with fields it knows that the DB doesn't (e.g. live counters)
    if (clientProfile && typeof clientProfile === 'object') {
      aiProfile = { ...(aiProfile || {}), ...clientProfile } as AIProfile
    }

    function buildProfileBlock(p: AIProfile | null): string {
      if (!p) return ''
      const lines: string[] = []
      if (p.business_description) lines.push(`Business: ${p.business_description}`)
      if (p.industry) lines.push(`Industry: ${p.industry}`)
      if (p.target_audience) lines.push(`Target audience: ${p.target_audience}`)
      if (p.brand_voice) lines.push(`Brand voice: ${p.brand_voice}`)
      if (p.tone) lines.push(`Tone preference: ${p.tone}`)
      if (p.primary_language) lines.push(`Preferred response language: ${p.primary_language}`)
      if (p.goals && p.goals.length) lines.push(`Current goals: ${p.goals.map((g) => `"${g}"`).join('; ')}`)
      if (p.constraints) lines.push(`Constraints: ${p.constraints}`)
      if (p.last_active_projects_summary) lines.push(`Active work snapshot: ${p.last_active_projects_summary}`)
      if (p.last_finance_summary) lines.push(`Finance snapshot: ${p.last_finance_summary}`)
      if (p.custom_instructions) lines.push(`User custom instructions: ${p.custom_instructions}`)
      if (!lines.length) return ''
      return `<TENANT_PROFILE>
${lines.join('\n')}
</TENANT_PROFILE>

Use the profile above to personalize tone, language, and recommendations. The user's custom_instructions are HIGHER priority than your defaults — respect them. Never contradict the brand_voice or constraints. If profile data conflicts with the user input, the user input wins for the immediate task but profile still drives style/tone.

`
    }
    const profileBlock = buildProfileBlock(aiProfile)

    // For plan_period / standup: limit task lines to avoid MAX_TOKENS on output
    let processedInput = input
    if (type === 'standup') {
      // Limit active tasks context to 30 lines
      const lines = input.split('\n')
      let taskCount = 0
      const filtered: string[] = []
      let inTaskSection = false
      for (const line of lines) {
        if (line.startsWith('Active tasks:')) {
          inTaskSection = true
          filtered.push(line)
          continue
        }
        if (inTaskSection && line.startsWith('- [')) {
          taskCount++
          if (taskCount <= 30) filtered.push(line)
          continue
        }
        if (inTaskSection && !line.startsWith('- [')) {
          inTaskSection = false
        }
        filtered.push(line)
      }
      processedInput = filtered.join('\n')
      if (taskCount > 30) {
        console.log(`[gemini] standup: truncated ${taskCount} tasks to 30`)
      }
    } else if (type === 'plan_period') {
      const lines = input.split('\n')
      let taskCount = 0
      const filtered: string[] = []
      let inTaskSection = false
      for (const line of lines) {
        if (line.startsWith('Tasks:') || line.startsWith('Unscheduled')) {
          inTaskSection = true
          filtered.push(line)
          continue
        }
        if (inTaskSection && line.startsWith('- [')) {
          taskCount++
          if (taskCount <= 20) filtered.push(line)
          continue
        }
        if (inTaskSection && !line.startsWith('- [')) {
          inTaskSection = false
        }
        filtered.push(line)
      }
      processedInput = filtered.join('\n')
      if (taskCount > 20) {
        console.log(`[gemini] plan_period: truncated ${taskCount} tasks to 20`)
      }
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('GEMINI_API_KEY')
    const useOpenAI = !!Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY (or GEMINI_API_KEY as fallback)' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── Few-shot retrieval: embed the input and pull top-3 high-rated past
    // outputs of the same type from the same tenant. Inject them as examples.
    // Only runs when OpenAI is the active provider (embeddings need OpenAI key).
    // Skipped for advisor_chat (each turn is unique, retrieval adds noise).
    let queryEmbedding: number[] | null = null
    let examplesBlock = ''
    const RETRIEVAL_TYPES = new Set(['task', 'proposal', 'blog', 'weekly_summary', 'advisor', 'tasks_bulk'])
    if (useOpenAI && tenantId && RETRIEVAL_TYPES.has(type)) {
      try {
        const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'text-embedding-3-small', input: processedInput.slice(0, 8000) }),
        })
        if (embedRes.ok) {
          const embedData = await embedRes.json()
          queryEmbedding = embedData?.data?.[0]?.embedding || null
        } else {
          console.log(`[ai] embedding skipped: status ${embedRes.status}`)
        }
      } catch (e) {
        console.log('[ai] embedding error:', String(e))
      }

      if (queryEmbedding) {
        try {
          const { data: similar } = await supabaseAdmin.rpc('search_similar_ai_outputs', {
            p_tenant_id: tenantId,
            p_request_type: type,
            p_query_embedding: queryEmbedding,
            p_limit: 3,
          })
          if (similar && Array.isArray(similar) && similar.length > 0) {
            const examples = similar.map((row: any, idx: number) => {
              const out = typeof row.output_json === 'string' ? row.output_json : JSON.stringify(row.output_json)
              return `Example ${idx + 1} (similarity ${Number(row.similarity).toFixed(2)}, avg rating ${Number(row.avg_rating).toFixed(1)}):
Input: ${row.input_text.slice(0, 800)}
Output: ${out.slice(0, 1500)}`
            }).join('\n\n---\n\n')
            examplesBlock = `<PAST_EXAMPLES>
The following are past responses from this tenant that received positive user feedback. Use them to calibrate tone, structure, and depth — NOT to copy. The current input may differ; respect its specifics.

${examples}
</PAST_EXAMPLES>

`
            console.log(`[ai] injected ${similar.length} few-shot examples for type=${type}`)
          }
        } catch (e) {
          console.log('[ai] retrieval error:', String(e))
        }
      }
    }

    const baseSystemPrompt = buildSystemPrompt(type)

    const systemPrompt = profileBlock + examplesBlock + baseSystemPrompt

    const maxTokens = type === 'proposal' ? 2400 : type === 'blog' ? 2400 : type === 'tasks_bulk' ? 4500 : type === 'plan_period' ? 16384 : type === 'weekly_summary' ? 1600 : type === 'advisor' ? 2400 : type === 'advisor_chat' ? 1200 : type === 'advisor_chat_actions' ? 2400 : type === 'finance_chat' ? 1500 : type === 'standup' ? 4096 : type === 'finance_entry' ? 800 : type === 'finance_entries_batch' ? 12000 : type === 'content_strategy_suggest' ? 2400 : type === 'member_weekly_summary' ? 1200 : type === 'comm_classify' ? 1200 : type === 'comm_reply_compose' ? 1500 : type === 'train_brand_style' ? 3200 : type === 'generate_content' ? 2800 : type === 'generate_outreach' ? 2200 : type === 'generate_case_study' ? 2400 : type === 'suggest_content' ? 2400 : type === 'ad_generator' ? 2400 : 512
    const temperature = type === 'tasks_bulk' || type === 'plan_period' || type === 'standup' ? 0.4 : type === 'weekly_summary' ? 0.5 : type === 'advisor' ? 0.6 : type === 'advisor_chat' ? 0.6 : type === 'advisor_chat_actions' ? 0.5 : type === 'finance_chat' ? 0.3 : type === 'finance_entry' || type === 'finance_entries_batch' ? 0 : type === 'content_strategy_suggest' ? 0.7 : type === 'member_weekly_summary' ? 0.5 : type === 'comm_classify' ? 0.2 : type === 'comm_reply_compose' ? 0.4 : type === 'train_brand_style' ? 0.4 : type === 'generate_content' ? 0.75 : type === 'generate_outreach' ? 0.7 : type === 'generate_case_study' ? 0.55 : type === 'suggest_content' ? 0.8 : type === 'ad_generator' ? 0.75 : 0.3

    // ─── Request: OpenAI (preferred) or Gemini fallback ─────────────
    const MAX_RETRIES = 3
    let response: Response | null = null
    let rawText = ''

    if (useOpenAI) {
      // Model chain: mini first, 4o as fallback on 5xx
      const MODELS = ['gpt-4o-mini', 'gpt-4o']
      const openaiBody = (model: string) => JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: processedInput },
        ],
        response_format: { type: 'json_object' },
        temperature,
        max_tokens: Math.min(maxTokens, 16384),
      })

      for (let modelIdx = 0; modelIdx < MODELS.length; modelIdx++) {
        const model = MODELS[modelIdx]
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: openaiBody(model),
          })
          if (response.status !== 429 || attempt === MAX_RETRIES) break
          const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10)
          const baseDelay = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt + 2) * 1000
          const jitter = Math.floor(Math.random() * 2000)
          const delay = baseDelay + jitter
          console.log(`[ai] openai 429 on ${model}, retry in ${delay}ms (${attempt + 1}/${MAX_RETRIES})`)
          await new Promise(r => setTimeout(r, delay))
        }
        if (response!.ok || response!.status === 400) break // 400 = bad request, don't fallback
        if (modelIdx < MODELS.length - 1) {
          console.log(`[ai] ${model} failed (${response!.status}), falling back to ${MODELS[modelIdx + 1]}`)
        }
      }

      if (!response!.ok) {
        const text = await response!.text()
        console.error(`[ai] openai error ${response!.status} for type=${type}:`, text.slice(0, 500))
        const userMessage = response!.status === 429
          ? 'API rate limit exceeded. Please wait a minute and try again.'
          : response!.status === 401
          ? 'AI provider authentication failed. Check OPENAI_API_KEY.'
          : text || 'OpenAI request failed'
        return new Response(JSON.stringify({ error: userMessage }), {
          status: response!.status === 429 ? 429 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const data = await response!.json()
      rawText = data?.choices?.[0]?.message?.content || ''
      const finishReason = data?.choices?.[0]?.finish_reason || 'unknown'
      console.log(`[ai] openai type=${type} finish=${finishReason} len=${rawText.length}`)

      // Save usage for logging (remapped to Gemini-style fields further down)
      ;(response as any)._usage = {
        promptTokenCount: data?.usage?.prompt_tokens || 0,
        candidatesTokenCount: data?.usage?.completion_tokens || 0,
      }
    } else {
      // ─── Legacy Gemini path ──────────────────────────────────────
      const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']
      const generationConfig: Record<string, any> = {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      }
      const geminiBody = JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: processedInput }] }],
        generationConfig,
      })

      for (let modelIdx = 0; modelIdx < MODELS.length; modelIdx++) {
        const model = MODELS[modelIdx]
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: geminiBody,
          })
          if (response.status !== 429 || attempt === MAX_RETRIES) break
          const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10)
          const baseDelay = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt + 2) * 1000
          const jitter = Math.floor(Math.random() * 2000)
          await new Promise(r => setTimeout(r, baseDelay + jitter))
        }
        if (response!.status !== 429) break
      }

      if (!response!.ok) {
        const text = await response!.text()
        console.error(`[ai] gemini error ${response!.status}:`, text.slice(0, 500))
        return new Response(JSON.stringify({
          error: response!.status === 429 ? 'API rate limit exceeded. Please wait a minute and try again.' : (text || 'Gemini request failed'),
        }), {
          status: response!.status === 429 ? 429 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const data = await response!.json()
      if (!data?.candidates?.length) {
        const feedback = data?.promptFeedback || data?.blockReason || 'no candidates returned'
        return new Response(JSON.stringify({ error: 'AI returned empty response', details: feedback }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const parts = data?.candidates?.[0]?.content?.parts || []
      rawText = parts.filter((p: any) => !p.thought && !p.thoughtSignature).map((p: any) => p.text || '').join('')
      ;(response as any)._usage = {
        promptTokenCount: data?.usageMetadata?.promptTokenCount || 0,
        candidatesTokenCount: data?.usageMetadata?.candidatesTokenCount || 0,
      }
    }

    // ─── Parse JSON from rawText (works for both providers) ────────
    let json: TaskResponse | TasksBulkResponse | ProposalResponse | BlogResponse | WeeklySummaryResponse | AdvisorResponse | PlanPeriodResponse | StandupResponse | FinanceEntryResponse | FinanceBatchResponse | null = null
    const trimmed = rawText.trim()
    if (trimmed) {
      try { json = JSON.parse(trimmed) } catch {}
      if (!json) {
        const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (codeBlock) { try { json = JSON.parse(codeBlock[1].trim()) } catch {} }
      }
      if (!json) {
        const match = trimmed.match(/\{[\s\S]*\}/)
        if (match) { try { json = JSON.parse(match[0]) } catch {} }
      }
    }

    const finishReason = 'unknown'
    const rawDebug = rawText.slice(0, 1500)

    if (type === 'tasks_bulk') {
      const bulk = json as TasksBulkResponse
      if (!bulk || !Array.isArray(bulk.phases) || bulk.phases.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'proposal') {
      const proposal = json as ProposalResponse
      if (!proposal || !proposal.content) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'blog') {
      const blog = json as BlogResponse
      if (!blog || !blog.title || !blog.content) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'weekly_summary') {
      const summary = json as WeeklySummaryResponse
      if (!summary || !Array.isArray(summary.objectives) || !Array.isArray(summary.focus_tasks) || !Array.isArray(summary.recommendations)) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'advisor') {
      const advisor = json as AdvisorResponse
      if (!advisor || !Array.isArray(advisor.insights)) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'plan_period') {
      const plan = json as PlanPeriodResponse
      if (!plan || !Array.isArray(plan.changes)) {
        console.error(`[gemini] plan_period validation failed. finishReason=${finishReason}, json is ${json === null ? 'null' : typeof json}, keys: ${json ? Object.keys(json).join(',') : 'N/A'}, rawDebug: ${rawDebug}`)
        return new Response(JSON.stringify({ error: 'Invalid AI response', finishReason, raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'standup') {
      const standup = json as StandupResponse
      if (!standup || !standup.summary || !Array.isArray(standup.actions)) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'advisor_chat') {
      // Salvage: gpt-4o-mini sometimes returns a JSON object with a different key
      // (e.g., {"priorities":[...]}). Coerce any string/array value into a reply.
      let chat = json as { reply?: string }
      if (json && (!chat?.reply || typeof chat.reply !== 'string')) {
        const obj = json as Record<string, unknown>
        const stringField = Object.values(obj).find((v) => typeof v === 'string') as string | undefined
        if (stringField) {
          chat = { reply: stringField }
        } else {
          const arrayField = Object.values(obj).find((v) => Array.isArray(v)) as unknown[] | undefined
          if (arrayField && arrayField.every((x) => typeof x === 'string')) {
            chat = { reply: (arrayField as string[]).map((s) => `• ${s}`).join('\n') }
          }
        }
        if (chat.reply) json = chat
      }
      if (!chat?.reply || typeof chat.reply !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'finance_chat' || type === 'advisor_chat_actions' || type === 'comm_reply_compose') {
      // Same salvage logic as advisor_chat for the reply field; actions[] stays
      // as-is. We don't reject when actions is missing — many turns are
      // pure-Q&A and shouldn't carry actions. Covers BOTH finance_chat and
      // advisor_chat_actions because they share the {reply, actions[]?} shape.
      let chat = json as { reply?: string; actions?: unknown[] }
      if (json && (!chat?.reply || typeof chat.reply !== 'string')) {
        const obj = json as Record<string, unknown>
        const stringField = Object.values(obj).find((v) => typeof v === 'string') as string | undefined
        if (stringField) chat = { ...chat, reply: stringField }
        else {
          // Last resort: walk array values and synthesize a bullet list.
          const arrayField = Object.values(obj).find((v) => Array.isArray(v)) as unknown[] | undefined
          if (arrayField && arrayField.every((x) => typeof x === 'string' || (x && typeof x === 'object'))) {
            const lines = arrayField.map((x) => typeof x === 'string' ? `• ${x}` : `• ${JSON.stringify(x)}`).join('\n')
            chat = { ...chat, reply: lines }
          }
        }
      }
      if (!chat?.reply || typeof chat.reply !== 'string') {
        console.error(`[gemini] ${type} validation failed. finishReason=${finishReason}, json keys: ${json ? Object.keys(json as object).join(',') : 'N/A'}, rawDebug: ${rawDebug?.slice(0, 500)}`)
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (chat.actions && !Array.isArray(chat.actions)) chat.actions = []
      json = chat
    } else if (type === 'finance_entry') {
      const entry = json as FinanceEntryResponse
      if (
        !entry ||
        (entry.kind !== 'income' && entry.kind !== 'expense') ||
        typeof entry.concept !== 'string' ||
        typeof entry.amount !== 'number' ||
        typeof entry.date !== 'string'
      ) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'finance_entries_batch') {
      const batch = json as FinanceBatchResponse
      if (!batch || !Array.isArray(batch.entries)) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'train_brand_style') {
      // Brand training — must return a non-trivial brand_prompt string
      const out = json as { brand_prompt?: string }
      if (!out || typeof out.brand_prompt !== 'string' || out.brand_prompt.length < 50) {
        return new Response(JSON.stringify({ error: 'Invalid AI response — brand_prompt missing or too short', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'generate_content') {
      // Content generation — must return variations[]
      const out = json as { variations?: unknown[] }
      if (!out || !Array.isArray(out.variations) || out.variations.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid AI response — variations[] missing', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'generate_outreach') {
      const out = json as { body?: string; loom_script?: string }
      if (!out || typeof out.body !== 'string' || typeof out.loom_script !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid AI response — outreach missing body/loom_script', raw: rawDebug }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'generate_case_study') {
      const out = json as { problem?: string; solution?: string; result?: string }
      if (!out || typeof out.problem !== 'string' || typeof out.solution !== 'string' || typeof out.result !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid AI response — case study missing problem/solution/result', raw: rawDebug }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'suggest_content') {
      const out = json as { ideas?: unknown[] }
      if (!out || !Array.isArray(out.ideas) || out.ideas.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid AI response — ideas[] missing', raw: rawDebug }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'ad_generator') {
      const out = json as { variations?: unknown[] }
      if (!out || !Array.isArray(out.variations) || out.variations.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid AI response — ad variations[] missing', raw: rawDebug }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (!json || !(json as TaskResponse).title) {
      return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log usage (non-blocking)
    const usage = (response as any)?._usage
    if (tenantId) {
      supabaseAdmin.from('ai_usage_log').insert({
        tenant_id: tenantId,
        user_id: userId,
        request_type: type,
        tokens_input: usage?.promptTokenCount || 0,
        tokens_output: usage?.candidatesTokenCount || 0,
      }).then(() => {})
    }

    // ─── Log output for retrieval + feedback ────────────────────────
    // We compute input_hash on the server so frontend can't fake collisions.
    // We persist the embedding we already computed for retrieval (no extra
    // API call). If embedding wasn't computed (Gemini fallback or error), the
    // row is still inserted without it; can be backfilled later.
    let outputId: string | null = null
    if (tenantId && RETRIEVAL_TYPES.has(type)) {
      const inputHash = await hashString(processedInput)
      const { data: logRow, error: logErr } = await supabaseAdmin
        .from('ai_output_log')
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          request_type: type,
          input_text: processedInput.slice(0, 16000),
          input_hash: inputHash,
          output_json: json,
          embedding: queryEmbedding,
          tokens_input: usage?.promptTokenCount || 0,
          tokens_output: usage?.candidatesTokenCount || 0,
        })
        .select('id')
        .single()
      if (logErr) {
        console.log('[ai] output log insert error:', logErr.message)
      } else {
        outputId = (logRow as { id: string })?.id || null
      }
    }

    return new Response(JSON.stringify({ result: json, output_id: outputId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

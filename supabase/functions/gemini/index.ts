// @ts-nocheck
// Supabase Edge Function: Gemini proxy
// Requires GEMINI_API_KEY in function environment

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// ─── Simple in-memory rate limiter (per edge function instance) ──
const rateLimiter = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10     // max requests per window
const RATE_WINDOW = 60000 // 1 minute window

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

    // Check if tenant has AI feature enabled
    if (tenantId) {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('features')
        .eq('id', tenantId)
        .single()
      if (tenant?.features && tenant.features.ai_assistant === false) {
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
    const { type, input } = body || {}

    if (!input || typeof input !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing input' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

    const systemPrompt =
      type === 'task'
        ? 'You are a task creation assistant. Return ONLY valid JSON with keys: title (string), priority (low|medium|high|urgent), tag (string). Keep title concise.'
        : type === 'tasks_bulk'
        ? `You are a senior project planning assistant for a creative agency. Given a project description and context, break it into phases with tasks, realistic delivery dates, and budget estimates.
Return ONLY valid JSON with this structure:
{"phases":[{"name":"Phase Name","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","budget":0,"tasks":[{"title":"Task title","priority":"low|medium|high","dueDate":"YYYY-MM-DD","assignee":"team member name or null","subtasks":[{"title":"Subtask title"}]}]}]}
Rules:
- Create 2-5 phases with clear, professional names
- Each phase should have 2-4 HIGH-LEVEL parent tasks (NOT more — quality over quantity, never a long flat list)
- HEAVILY prefer nesting detail as subtasks. Each parent task should have 3-6 subtasks when the work has multiple concrete steps. Only leave 0 subtasks for truly atomic work (e.g., "Send approval email").
- NEVER emit a parent task that is actually a step of another parent — merge it in as a subtask instead. Group related small items under one parent (e.g., "Website Build" with subtasks "Hero section", "About page", "Contact form", "Footer" — NOT 4 separate parent tasks).
- IMPORTANT: Each PARENT task MUST have its own "dueDate" (YYYY-MM-DD) staggered within the phase date range. Space parent tasks evenly — do NOT give all tasks the same date. Subtasks inherit roughly from parent.
- If a list of team members is provided in the input, assign tasks to specific people by name using the "assignee" field. Distribute work evenly across the team based on task type. If no team is provided, set assignee to null.
- Priorities: high for critical-path/blocking tasks, medium for standard, low for nice-to-have
- Task titles should be concise and actionable (start with a verb)
- If a project deadline is provided, ALL phase end dates and task due dates MUST be before that deadline. Work backwards from the deadline.
- Estimate a reasonable budget for each phase in USD based on typical agency rates ($80-150/hr) — set budget to 0 if no cost info is provided
- Respond in the same language as the input
- Be specific and detailed — avoid generic tasks like "review" or "finalize"
- Focus on QUALITY: fewer well-defined tasks > many vague tasks`
        : type === 'proposal'
        ? 'You are a proposal writer. Return ONLY valid JSON with keys: summary (string), content (string, structured with headings), timeline (array of objects with week:number, title:string, detail:string), language (en|es). Keep tone professional and clear.'
        : type === 'blog'
        ? 'You are a blog writer. Return ONLY valid JSON with keys: title (string), excerpt (string), content (string with headings), language (en|es). Keep it readable and structured.'
        : type === 'weekly_summary'
        ? `You are a professional productivity coach and project manager. Analyze the user's weekly calendar data (events, tasks, deadlines) and any custom instructions they provide.
Return ONLY valid JSON with this structure:
{"objectives":["objective 1","objective 2",...],"focus_tasks":["task 1","task 2",...],"recommendations":["recommendation 1","recommendation 2",...]}
Rules:
- objectives: 2-4 clear, actionable weekly goals derived from the calendar data
- focus_tasks: 3-5 specific tasks the user should prioritize this week
- recommendations: 2-4 personalized tips (time management, scheduling gaps, workload balance, etc.)
- Be concise: each item should be 1-2 sentences max
- Respond in the SAME language as the input (Spanish if input is in Spanish, English if in English)
- If the user provides custom instructions or extra context, incorporate them into the analysis`
        : type === 'plan_period'
        ? `You are a senior project manager and scheduling optimizer for a creative agency. Given a set of tasks, team members with workload data, calendar events, and user preferences, reorganize and replan tasks for optimal productivity.
Return ONLY valid JSON with this structure:
{"summary":"Brief explanation of your planning rationale (1-2 sentences)","changes":[{"taskId":"exact-uuid-from-input","taskTitle":"task name","currentDate":"YYYY-MM-DD","newDate":"YYYY-MM-DD","currentTime":"HH:MM or null","newTime":"HH:MM or null","currentAssignee":"name or null","newAssignee":"name or null","currentPriority":"low|medium|high|urgent","newPriority":"low|medium|high|urgent","reason":"Brief reason for this change"}]}
Rules:
- ONLY return changes for tasks that actually need modification. If a task is already well-placed, OMIT it completely.
- NEVER move tasks with status "done" or "in-progress" — they are locked.
- Respect blocked_by dependencies: a blocked task MUST be scheduled AFTER its blocker task's date.
- Balance workload across team members — use the open task counts provided to redistribute fairly.
- ADAPTIVE DISTRIBUTION: Use the "Productivity data" section to determine each person's real daily capacity. Assign tasks proportionally to their historical average. Never exceed 1.5x their daily average on any single day. If no productivity data is provided, default to max 4 tasks per person per day.
- CRITICAL: Spread tasks EVENLY across ALL available working days (Mon-Fri) in the period. NEVER put more than 4 tasks on a single day for any person. If there are 20 tasks and 5 working days, that's 4 per day MAX — distribute them evenly.
- Schedule high-priority and urgent tasks earlier in the period, but still spread them out.
- Avoid scheduling tasks on weekends unless absolutely necessary.
- Avoid scheduling tasks during calendar events (use the event times provided).
- Respect user planning preferences (provided as context) — these are the user's personal scheduling rules.
- Each change MUST include the exact taskId as provided in the input — do NOT generate new IDs.
- Include "current*" fields to show the before state and "new*" fields for the after state.
- Only include field pairs that are actually changing (e.g., if only date changes, omit assignee and priority fields).
- Keep the total number of changes reasonable (max ~20 changes per request).
- CRITICAL: NEVER assign or move tasks to dates in the past. The "Today" date is provided in the input — all newDate values MUST be today or later. If a task is currently scheduled for a past date, move it to today or a future date.
- Respond in the SAME language as the input.`
        : type === 'standup'
        ? `You are a PM standup assistant. The user is reporting what they worked on today. You receive their freeform standup update along with their current active task list (with real database IDs).

Your job: analyze their update and propose task actions.

Return ONLY valid JSON with this structure:
{"summary":"1-2 sentence standup summary","actions":[{"type":"complete|create|update_status|flag_blocked","taskId":"exact-uuid-from-task-list","taskTitle":"task name","newTask":{"title":"...","priority":"low|medium|high","dueDate":"YYYY-MM-DD","projectName":"..."},"updates":{"status":"in-progress|todo"},"reason":"Why this action"}],"risks":[{"type":"deadline_risk|blocker|scope_creep|overload","title":"Short title","description":"1 sentence","severity":"low|medium|high"}]}

Rules:
- For "complete" and "update_status" and "flag_blocked" actions: use ONLY taskId values from the provided task list. NEVER invent IDs.
- Match the user's natural language to task titles using fuzzy matching. If the user says "finished the homepage" and there's a task "[abc-123] Homepage redesign", match to that task.
- For "create" actions: only create new tasks when the user mentions work NOT covered by any existing task. Include newTask object with title, priority, and optional dueDate/projectName.
- For "update_status": use when user mentions starting or progressing on a task (set status to "in-progress").
- For "flag_blocked": use when user mentions being stuck or blocked on something.
- Detect risks: if user mentions being overwhelmed (overload), deadline concerns (deadline_risk), new unplanned work (scope_creep), or being stuck (blocker).
- Keep summary concise and professional.
- If the user's update is vague and you can't match to specific tasks, return fewer actions and note it in the summary.
- Respond in the SAME language as the user's input.
- omit taskId for "create" actions, omit newTask for non-create actions, omit updates for non-update_status actions.`
        : type === 'advisor'
        ? `You are a senior business advisor and strategist for a creative agency / studio owner. You have access to a summary of the user's current projects, finances, team, and calendar.
Return ONLY valid JSON with this structure:
{"greeting":"A brief personalized greeting (1 sentence)","insights":[{"area":"projects|finance|marketing|team|planning","icon":"Briefcase|DollarSign|TrendingUp|Users|Target","title":"Short title","body":"Actionable insight in 1-2 sentences","priority":"high|medium|low"}]}
Rules:
- Generate 4-6 personalized, actionable insights based on the data provided
- Cover different areas: projects, finance, marketing strategy, team management, weekly planning
- Be specific - reference actual project names, amounts, deadlines from the data
- Priority: high = needs immediate attention, medium = this week, low = good to know
- Keep tone professional but friendly, like a trusted advisor
- Respond in the SAME language as the input (Spanish if input is in Spanish)
- If there are overdue items, low income, or stalled projects, flag them as high priority
- Always include at least one forward-looking recommendation`
        : type === 'advisor_chat'
        ? `You are a senior business advisor continuing a conversation with the user. The user's input is a JSON string with three fields: "context" (current business snapshot), "history" (prior turns as [{role, content}]), and "question" (the new user message).
Return ONLY valid JSON: {"reply":"your response text"}
Rules:
- Use the context (projects, finances, team) to give concrete, data-grounded answers.
- Keep replies concise: 2-5 sentences unless the user asks for detail.
- Respond in the SAME language as the user's question (Spanish if Spanish).
- No markdown code fences; plain text only in the reply field.
- If the context is missing data the user asked about, say so briefly and suggest what to check.`
        : 'You are a helpful assistant. Return ONLY valid JSON.'

    const maxTokens = type === 'proposal' ? 2400 : type === 'blog' ? 2400 : type === 'tasks_bulk' ? 4500 : type === 'plan_period' ? 16384 : type === 'weekly_summary' ? 1600 : type === 'advisor' ? 2400 : type === 'advisor_chat' ? 1200 : type === 'standup' ? 4096 : 512
    const temperature = type === 'tasks_bulk' || type === 'plan_period' || type === 'standup' ? 0.4 : type === 'weekly_summary' ? 0.5 : type === 'advisor' ? 0.6 : type === 'advisor_chat' ? 0.6 : 0.3

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
    let json: TaskResponse | TasksBulkResponse | ProposalResponse | BlogResponse | WeeklySummaryResponse | AdvisorResponse | PlanPeriodResponse | StandupResponse | null = null
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
      const chat = json as { reply?: string }
      if (!chat || typeof chat.reply !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: rawDebug }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    return new Response(JSON.stringify({ result: json }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

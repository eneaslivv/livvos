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

    const baseSystemPrompt =
      type === 'task'
        ? `You are a task creation assistant. Return ONLY valid JSON with keys: title (string), priority (low|medium|high|urgent), tag (string).
Rules:
- title: rephrase the user's input as a concise actionable task (start with a verb when natural). Do NOT add scope or context that wasn't in the input.
- priority: infer from urgency cues in the input (e.g. "asap", "hoy", "bloqueante" → urgent/high). If no cue, default to "medium".
- tag: a short single-word category derived from the input (e.g. "Design", "Marketing", "Compras"). Do NOT invent project names or assignees — those are not part of this schema.
- Respond in the SAME language as the input.`
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
        ? `You are a commercial proposal writer for a creative/services agency. Return ONLY valid JSON with keys: summary (string, 2-3 sentences), content (string, markdown-style structured with headings ##), timeline (array of {week:number, title:string, detail:string}), language (en|es).
Grounding rules — CRITICAL to avoid hallucination:
- USE ONLY information explicitly provided in the user input (client name, project type, budget, deadlines, scope, deliverables, team size).
- DO NOT invent: client names, specific monetary amounts, exact percentages/metrics, team member names, technologies/tools not mentioned, case studies, testimonials, or competitor comparisons.
- If a critical detail is missing (e.g., client name, budget, scope), use a clearly marked placeholder like [CLIENT NAME], [BUDGET TBD], [SCOPE TO CONFIRM]. Never fabricate to fill the gap.
- Timeline: derive week count from any deadline/duration mentioned in the input. If no duration is given, propose a reasonable default (4-8 weeks) and explicitly note it as an "estimated" timeline in the content.
- Tone: professional, concrete, action-oriented. Avoid filler ("we are passionate about...", "in today's fast-paced world...").
- Respond in the same language as the input.`
        : type === 'blog'
        ? `You are a blog writer. Return ONLY valid JSON with keys: title (string), excerpt (string, 1-2 sentences), content (string, HTML with <h1>/<h2>/<p> tags), language (en|es).
Grounding rules:
- Stay strictly within the topic and angle the user provided.
- DO NOT invent statistics, percentages, study results, quotes, expert names, company names, or product names. If you want to reference data, phrase it generically ("studies suggest", "many freelancers report") instead of citing fake numbers.
- DO NOT add unrelated tangents to pad length. A focused 4-section post beats a sprawling 8-section one.
- Tone: useful and direct. Avoid clickbait headlines and AI-tell phrases ("in today's fast-paced world", "let's dive in", "remember,").
- Respond in the same language as the input.`
        : type === 'weekly_summary'
        ? `You are a professional productivity coach and project manager. Analyze the user's weekly calendar data (events, tasks, deadlines) and any custom instructions they provide.
Return ONLY valid JSON with this structure:
{"objectives":["objective 1","objective 2",...],"focus_tasks":["task 1","task 2",...],"recommendations":["recommendation 1","recommendation 2",...]}
Grounding rules — CRITICAL:
- Every objective, focus_task and recommendation MUST be derived from the actual data in the input. DO NOT pad with generic advice that ignores the data.
- If the input is sparse (few events/tasks), return FEWER items rather than fabricating. Empty arrays are acceptable when the data truly doesn't support a section.
- focus_tasks: reference task titles or event names that actually appear in the input. NEVER invent task names.
- recommendations: must reference a specific observation from the data (e.g., "You have 3 back-to-back meetings Wednesday — block recovery time after"). Avoid generic productivity tips that could apply to anyone.
- Soft size guidance (only if data supports it): up to 4 objectives, up to 5 focus_tasks, up to 4 recommendations.
- Be concise: each item 1-2 sentences max.
- Respond in the SAME language as the input.
- If the user provided custom instructions, weight them above the defaults.`
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
Grounding rules — CRITICAL to avoid hallucination:
- Every insight MUST cite at least one concrete data point from the input (a project name, an amount, a date, a count). If the input does not contain enough data for an insight, OMIT it.
- DO NOT pad to hit a count. Better to return 2 sharp insights than 6 generic ones. Acceptable range: 2-6 insights based on what the data supports.
- DO NOT invent project names, client names, monetary amounts, deadlines, or team members. Only reference what appears in the input.
- If a section (e.g., finance) has no data in the input, do not generate insights for that area.
- Priority logic: high = overdue, blocking, or financial risk visible in the data | medium = this week, requires attention | low = optimization opportunity.
- The greeting must reference something specific from the data (e.g., a project name or count of active items). Avoid generic "Hope you're having a great week!" openers.
- Tone: trusted advisor — direct, data-grounded, no filler.
- Respond in the SAME language as the input.`
        : type === 'advisor_chat'
        ? `You are a senior business advisor continuing a conversation with the user. The user's input is a JSON string with three fields: "context" (current business snapshot), "history" (prior turns as [{role, content}]), and "question" (the new user message).
Return ONLY valid JSON: {"reply":"your response text"}
Rules:
- Use the context (projects, finances, team) to give concrete, data-grounded answers.
- Keep replies concise: 2-5 sentences unless the user asks for detail.
- Respond in the SAME language as the user's question (Spanish if Spanish).
- No markdown code fences; plain text only in the reply field.
- If the context is missing data the user asked about, say so briefly and suggest what to check.`
        : type === 'advisor_chat_actions'
        ? `You are a senior business advisor continuing a conversation with the user. The user's input is a JSON string with three fields: "context" (snapshot of projects, finances, team — every entity carries an "id" you can reference), "history" (prior turns), and "question" (the new user message).

Reply in plain language AND, when the user explicitly asks you to DO something (create a task, plan a week, break down a project, suggest delegation, log an expense or income, create or modify a budget, mark something paid), propose actions for the frontend to execute AFTER the user confirms. NEVER auto-execute. NEVER invent ids — only reference ids present in the context.

Return ONLY valid JSON with this shape:
{
  "reply": "1-5 sentence answer in the user's language",
  "actions": [
    {
      "kind":
        "create_task" | "create_project" | "create_tasks_batch" | "plan_week" | "suggest_delegate"
        | "create_expense" | "create_income" | "create_budget" | "update_budget"
        | "mark_expense_paid" | "mark_installment_paid",
      "summary": "human-readable description of what this action will do",
      "params": {
        // ─── PROJECT / TASK actions ───────────────────────────────────
        // create_task minimum: title
        "title": "short label",
        "description": "optional details",
        "project_id": "exact-id-from-context-or-null",
        "client_id": "exact-id-from-context-or-null",
        "assignee_id": "exact-id-from-context-or-null",
        "due_date": "YYYY-MM-DD",
        "priority": "low" | "medium" | "high" | "urgent",
        "status": "todo" | "in-progress" | "done" | "cancelled",

        // create_project minimum: title
        // (uses title, client_id, deadline, description, color)

        // create_tasks_batch minimum: tasks[]
        // { project_id, client_id, tasks: [{ title, description, assignee_id, due_date, priority, status }] }

        // plan_week minimum: week_start + goals
        // { week_start: "YYYY-MM-DD (Monday)", goals: ["..."], suggested_tasks: [{ title, day_offset (0-6), assignee_id, project_id }] }

        // suggest_delegate minimum: reason
        // { task_id, project_id, to_user_id, reason }

        // ─── FINANCE actions ──────────────────────────────────────────
        // create_expense minimum: amount, concept
        // { amount, concept, category ('Software'|'Talent'|'Marketing'|'Operations'|'Legal'),
        //   vendor, date, project_id, client_id, budget_id,
        //   status ('paid'|'pending'), recurring }

        // create_income minimum: amount, concept
        // { amount, concept, client_id, client_name, project_id,
        //   due_date, num_installments (default 1) }

        // create_budget minimum: name, allocated_amount
        // { name, allocated_amount, category, period ('monthly'|'quarterly'|'yearly'|'one-time'),
        //   color, start_date, end_date, description }

        // update_budget minimum: budget_id (must be in context.budgets), and at least one field
        // { budget_id, allocated_amount, name, is_active, end_date }

        // mark_expense_paid: { expense_id (must be in context.recent_expenses) }
        // mark_installment_paid: { installment_id (must be in context.upcoming_installments), paid_date }
      }
    }
  ]
}

Rules — CRITICAL:
- "actions" is OPTIONAL. Include it only when the user clearly asks to CHANGE or ADD something ("creá una tarea de…", "armame el plan de la semana", "delegá esto a Luis", "rompé este proyecto en tasks", "cargá un gasto de $500 a Marketing", "creá un budget de $5000 para Software", "subí el budget de Marketing a $8000", "marcá la cuota de Acme como pagada"). For pure questions ("¿cómo va el proyecto Acme?", "¿cuánto gasté en Software?") return actions: [] or omit it.
- Every id (project_id, client_id, assignee_id, task_id, to_user_id, budget_id, expense_id, installment_id) MUST come from context. If the user mentions a name that isn't in context, set the id to null (or use *_name when available) and explain in the reply that the entity wasn't found.
- For plan_week.week_start: pick the upcoming Monday (or the one explicitly mentioned). suggested_tasks should be 3-7 items spread across the week (use day_offset 0-6).
- For create_tasks_batch (e.g. breaking down a project), aim for 3-10 concrete tasks. Each MUST have a title; everything else is optional.
- For finance actions: amounts MUST be positive numbers (not strings). category for create_expense MUST be one of the EXPENSE_CATEGORIES present in context. update_budget MUST reference an existing budget_id from context.budgets.
- Keep "reply" concise (1-3 sentences) when proposing actions — the action card itself shows the details.
- If the user's request is ambiguous (e.g. "creá una tarea" without saying what, or "cargá un gasto" without amount), include in "reply" a clarifying question and DO NOT propose actions.
- Respond in the SAME language as the user's question.
- No markdown code fences; plain text only in the reply field.`
        : type === 'finance_chat'
        ? `You are a finance assistant continuing a conversation with the user. The user's input is a JSON string with three fields: "context" (finance snapshot — recent expenses, incomes, budgets, totals, available expense_categories, available clients, available projects — each row carries an "id" you can reference), "history" (prior turns), and "question" (the new user message).

Reply in plain language AND, when the user clearly asks to change or add something, propose actions for the frontend to execute after the user confirms. NEVER auto-execute. NEVER invent ids — only reference ids present in the context.

Return ONLY valid JSON with this shape:
{
  "reply": "1-5 sentence answer in the user's language",
  "actions": [
    {
      "kind": "expense" | "income" | "budget",
      "op": "mark_paid" | "mark_pending" | "update_amount" | "update_date" | "link_budget" | "delete" | "create_expense" | "create_income" | "update_budget",
      "target_id": "exact id from context (omit for create_expense/create_income — there is no target yet)",
      "params": {
        // Existing-row updates:
        "amount": number,           // update_amount  | create_expense | create_income | update_budget (allocated)
        "date": "YYYY-MM-DD",       // update_date    | create_expense | create_income
        "budget_id": "uuid",        // link_budget    | create_expense (optional)
        "budget_name": "string",    // optional helper for the UI
        // Create-only:
        "concept": "string",        // create_expense | create_income — short label
        "category": "string",       // create_expense — must come from context.expense_categories
        "vendor": "string",         // create_expense — optional
        "client_id": "uuid",        // create_expense | create_income — must come from context.clients
        "client_name": "string",    // create_income — falls back to a label if no id
        "project_id": "uuid",       // optional, must come from context.projects
        "status": "paid" | "pending",
        "recurring": boolean        // create_expense — optional, default false
      },
      "summary": "human-readable description like 'Marcar como paid el gasto de Figma ($89, 2026-04-12)' or 'Crear gasto de Software: Figma $89 el 2026-05-02'"
    }
  ]
}

Rules — CRITICAL:
- "actions" is OPTIONAL. Only include it when the user explicitly asks for a change or addition ("marcá como pagado", "agregá un gasto de", "cambiá el budget de Marketing a 5000", "creá un income de Coffe Payper por 2500"). For pure questions ("¿cuánto gasté?") return actions: [] or omit it.
- target_id MUST be an id present in the context for ops that target an existing row (mark_paid, mark_pending, update_amount, update_date, link_budget, delete, update_budget). Omit target_id for create_expense and create_income.
- For create_expense / create_income: params MUST include amount and concept at minimum. category for create_expense must come from context.expense_categories. client_id / project_id (when used) must come from context.clients / context.projects. If the user mentions a client/project name that doesn't exist in context, set client_name as a string and DO NOT fabricate an id.
- For update_budget: target_id is the budget id from context.active_budgets, and params.amount sets the new allocated total.
- params MUST only contain the fields relevant to op.
- If the user's request is ambiguous (e.g. "marcá Figma como pagado" but there are 3 Figma expenses), include in "reply" a clarifying question and DO NOT propose actions.
- Keep "reply" concise (1-3 sentences) when proposing actions — the action card itself shows the details.
- Respond in the SAME language as the user's question.
- No markdown code fences; plain text only in the reply field.`
        : type === 'finance_entries_batch'
        ? `You are a finance data-entry assistant. The user uploaded a spreadsheet (already parsed to JSON) and you must turn EACH ROW into a structured income or expense, RESOLVING references to existing clients and projects from the lists provided.

Each request processes rows from a single sheet (tab) of the workbook. The SHEET name is given in the input header and each row also carries source_sheet — echo it back unchanged. The user typically uses sheet names like "Marzo", "Gastos", "Income 2026"; treat those as organizational labels (you can mention them in summary) but do NOT use them as categories.

Return ONLY valid JSON with this shape:
{
  "summary": "1 sentence describing what was found in this sheet",
  "entries": [
    {
      "source_sheet": "exact sheet name from the input rows",
      "source_row": number,
      "kind": "income" | "expense",
      "concept": "short label",
      "amount": number,
      "amount_source_cell": "the column header from which amount was taken (e.g. 'Amount','Total','Importe')",
      "date": "YYYY-MM-DD",
      "date_inferred": boolean,
      "client_id": "exact-id-from-CLIENTS-or-null",
      "client_name": "matched-name-or-extracted-name-or-null",
      "project_id": "exact-id-from-PROJECTS-or-null",
      "project_name": "matched-title-or-null",
      "category": "EXPENSE_CATEGORY-if-expense-else-null",
      "vendor": "vendor-if-expense-else-null",
      "num_installments": number,
      "status": "paid" | "pending",
      "recurring": boolean,
      "confidence": 0..1,
      "needs_review": boolean,
      "notes": "anything-extra-from-the-row-or-null"
    }
  ],
  "unknown_clients": ["names from data not matching any CLIENTS row"],
  "unknown_projects": ["titles from data not matching any PROJECTS row"],
  "skipped_rows": [{"source_sheet": "name", "source_row": number, "reason": "header" | "total" | "blank" | "unparseable"}]
}

Rules — CRITICAL anti-hallucination:
- ONE entry per data row. Skip header / totals / blank rows by listing them in skipped_rows. Do NOT silently drop rows.
- USE EVERY CELL of the row. Don't just look at one column — every header gives you a field. Map them as follows (case + accent insensitive on header names):
    • Amount/Total/Importe/Monto/Valor/Precio/Price → amount
    • Date/Fecha/Día/Day → date
    • Concept/Concepto/Description/Descripción/Detalle/Item → concept
    • Vendor/Proveedor/Supplier/Provider/Pagado a/Para → vendor
    • Category/Categoría/Tipo/Type/Rubro → category
    • Client/Cliente/Customer → client_name
    • Project/Proyecto/Job → project_name
    • Notes/Notas/Comments/Comentarios/Observaciones → notes
    • Status/Estado/Pagado/Paid → status (true/yes/sí/paid → "paid", else "pending")
    • Recurring/Recurrente/Mensual/Monthly → recurring (true/yes/sí → true)
  Whatever cells don't fit a known field but carry useful context, append to "notes". Never throw away cell data.
- AMOUNT BINDING: the "amount" MUST be the literal numeric value present in one of the row's Amount-like cells. Strip currency symbols and thousand separators (parse "1.234,56" as 1234.56 and "$2,500" as 2500). If the row has NO amount cell, set amount=0 and needs_review=true. NEVER invent or infer amounts from concept/vendor.
- DATE BINDING: parse the row's date cell. If empty, set date=TODAY and date_inferred=true. NEVER invent a date that was not in the row.
- CATEGORY: pick from EXPENSE_CATEGORIES exactly (case-sensitive). If not obvious, default to "Operations" and set needs_review=true.
- IDs: never invent client_id / project_id. Only use IDs from CLIENTS / PROJECTS lists. Fuzzy match by name (case + accent insensitive). If no match, set id=null and add the raw name to unknown_clients / unknown_projects so the frontend can offer to create it.
- source_row MUST equal the source_row of the input ROW you derived this entry from. source_sheet MUST equal the input row's source_sheet. Do NOT reuse the (source_sheet, source_row) pair across two entries.
- needs_review=true whenever ANY of: amount inferred, date inferred, kind ambiguous, category guessed.
- Respond strictly with the JSON object — no prose, no markdown fences.
- Match the user's language for concept/vendor/notes/summary text.`
        : type === 'finance_entry'
        ? `You are a finance data-entry assistant for a creative agency platform. The user describes an income or expense in natural language and you turn it into structured fields, RESOLVING references to existing clients and projects from the lists provided in the input.

Return ONLY valid JSON with this shape:
{
  "kind": "income" | "expense",
  "concept": "short label for the entry",
  "amount": number,
  "date": "YYYY-MM-DD",
  "client_id": "exact-id-from-CLIENTS-list-or-null",
  "client_name": "name-from-CLIENTS-list-or-null",
  "project_id": "exact-id-from-PROJECTS-list-or-null",
  "project_name": "title-from-PROJECTS-list-or-null",
  "category": "one of EXPENSE_CATEGORIES if kind is expense, otherwise null",
  "vendor": "vendor name if kind is expense, otherwise null",
  "num_installments": number (income only, default 1),
  "status": "paid" | "pending",
  "recurring": boolean,
  "questions": ["short question 1", "short question 2"],
  "confidence": 0..1,
  "notes": "any leftover context or null"
}

Rules — CRITICAL:
- kind: infer from semantics. Money the user RECEIVES from a client = income. Money the user PAYS = expense. If ambiguous, default to expense and ask a clarifying question.
- amount: extract numeric value (strip currency symbols, parse "2k" as 2000, "1.5k" as 1500).
- date: parse natural-language dates ("yesterday", "ayer", "el 15"). If none mentioned, use the TODAY date provided in the input. Always emit ISO YYYY-MM-DD.
- client_id / project_id: ONLY use IDs that appear in the CLIENTS / PROJECTS sections of the input. Match by fuzzy name (case + accent insensitive, partial OK). If no match, set both id and name to null. NEVER fabricate an id.
- If a project is matched and it has a client, also fill the client_id/client_name from that project's client.
- category (expenses only): pick from EXPENSE_CATEGORIES exactly as listed. If no clear match, pick the closest, OR add a question.
- num_installments: only when the user mentions splitting payments ("3 cuotas", "in 3 installments"). Otherwise 1.
- status: "paid" if user says "ya pagué/cobré", "paid", "received". "pending" if "voy a", "next month", future-tense. Default "pending".
- recurring: true if "cada mes", "monthly", "subscription", "suscripción". Otherwise false.
- questions: list ONLY genuinely missing critical info (max 3). Examples: "What's the amount?", "Which client?", "What date?". If everything is clear, return []. NEVER ask about fields that are optional.
- confidence: 0.9+ if all critical fields are unambiguous and matched. 0.6-0.8 if some inference. <0.5 if you had to guess heavily.
- concept: a short human label, NOT the full sentence. E.g. user says "pagué $50 a Figma de licencias", concept = "Figma licenses".
- Respond strictly with the JSON object — no prose, no markdown fences.
- Match the user's language for concept/vendor/notes/questions text.`
        : type === 'content_strategy_suggest'
        ? `You are a senior social-media strategist for a brand. The user gives you a JSON payload with their pinned strategy notes, weekly objectives, and reference documents. Use this context to propose concrete, ready-to-publish content ideas for the upcoming week.

Input shape:
{
  "tenant_name": "the brand name",
  "week_start": "YYYY-MM-DD (Monday of the week the user is planning)",
  "summary": "previously-generated recap, may be empty",
  "pinned_notes": "freeform strategy text the user wrote — pillars, tone, audience, do/don't",
  "objectives": [{ "text": "...", "done": bool, "week": "YYYY-MM-DD" | null }],
  "documents": [{ "name": "...", "url": "...", "kind": "upload"|"link"|"doc" }]
}

Return ONLY valid JSON with this shape:
{
  "summary": "1 sentence recap of the brand's current strategy + this week's focus, written in the user's language. If the input summary is good and still applies, return it unchanged or refined slightly.",
  "items": [
    {
      "title": "short headline of the post idea — max 8 words",
      "body": "2-4 sentence description: what the post says, who it's for, and why it ties to an objective or pillar",
      "suggested_date": "YYYY-MM-DD inside the week_start..week_start+6 range, or null if undated",
      "format": "reel | carousel | story | post | video | short | live | thread (lowercase)",
      "hook": "the first line / opening hook the post should use to stop scroll — max 12 words"
    }
  ]
}

Rules:
- Generate 4-6 items, varied across formats — don't propose 6 reels.
- Each item MUST tie back to either a pillar from pinned_notes or a non-done objective. If you can't find a tie, skip it.
- suggested_date should spread across the week (don't pile 5 posts on Monday). Prefer Tue/Wed/Thu for high-value content; Mon/Fri for lighter formats.
- hook MUST be punchy and concrete — never "Tips for X" or "Did you know". Real openers like "Compré Figma por error 3 veces. Hoy te ahorro $89/mes."
- If pinned_notes and documents are EMPTY, return items: [] and a summary like "Cargá la estrategia y referencias para que pueda proponer posts" (in user's language).
- Match the user's language (Spanish if pinned_notes is in Spanish).
- No markdown fences. Plain JSON only.`
        : type === 'member_weekly_summary'
        ? `You are an engineering manager writing a weekly recap of a single team member's work. The user gives you a JSON snapshot of one person's period (this week / last week / this month).

Input shape:
{
  "member": { "name": "...", "id": "..." },
  "period": "Esta semana" | "Semana pasada" | "Este mes",
  "period_range": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "completed_count": int,
  "completed": [{ "title": "...", "project": "...", "client": "...", "completed_at": "ISO", "priority": "low|medium|high|urgent" }],
  "open_count": int,
  "open_high_priority": [{ "title": "...", "priority": "...", "project": "..." }],
  "overdue_count": int,
  "delegated_count": int,
  "login_count": int,
  "activity_count": int
}

Return ONLY valid JSON with this shape:
{
  "headline": "1 sentence summary of the week (e.g. 'Solid week — shipped 8 tasks across 3 projects with strong focus on Acme')",
  "wins": ["3-5 bullet wins, each 1 line, names the project/client when relevant"],
  "blockers": ["0-3 bullet blockers / risks — overdue tasks, high-priority pile-ups, low activity"],
  "next_focus": ["2-3 bullets on what they should prioritize next, derived from open_high_priority + overdue"]
}

Rules — IMPORTANT:
- Be SPECIFIC and concrete. Reference task titles, project names, numbers. Don't write fluff like "great work this week" — say WHAT was great and WHY.
- If completed_count = 0, the headline should reflect that honestly (e.g. "Quiet week — no tasks completed; X open"), not invent wins.
- If overdue_count > 0 OR open_high_priority is non-empty, blockers MUST surface them by name.
- next_focus must be actionable. Pick the 2-3 most pressing items from open_high_priority/overdue. NEVER invent tasks not in the input.
- If activity_count is very low (<5) AND completed_count is 0, mention as a possible disengagement signal in blockers — but tactfully ("low system activity this period").
- Match the input's language for the period field — Spanish "Esta semana" means write the recap in Spanish.
- Tone: factual, manager-to-self. Not cheerleader, not harsh.
- No markdown fences. Plain JSON only.`
        : 'You are a helpful assistant. Return ONLY valid JSON.'

    const systemPrompt = profileBlock + examplesBlock + baseSystemPrompt

    const maxTokens = type === 'proposal' ? 2400 : type === 'blog' ? 2400 : type === 'tasks_bulk' ? 4500 : type === 'plan_period' ? 16384 : type === 'weekly_summary' ? 1600 : type === 'advisor' ? 2400 : type === 'advisor_chat' ? 1200 : type === 'advisor_chat_actions' ? 2400 : type === 'finance_chat' ? 1500 : type === 'standup' ? 4096 : type === 'finance_entry' ? 800 : type === 'finance_entries_batch' ? 12000 : type === 'content_strategy_suggest' ? 2400 : type === 'member_weekly_summary' ? 1200 : 512
    const temperature = type === 'tasks_bulk' || type === 'plan_period' || type === 'standup' ? 0.4 : type === 'weekly_summary' ? 0.5 : type === 'advisor' ? 0.6 : type === 'advisor_chat' ? 0.6 : type === 'advisor_chat_actions' ? 0.5 : type === 'finance_chat' ? 0.3 : type === 'finance_entry' || type === 'finance_entries_batch' ? 0 : type === 'content_strategy_suggest' ? 0.7 : type === 'member_weekly_summary' ? 0.5 : 0.3

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
    } else if (type === 'finance_chat') {
      // Same salvage logic as advisor_chat for the reply field; actions[] stays
      // as-is. We don't reject when actions is missing — many turns are
      // pure-Q&A and shouldn't carry actions.
      let chat = json as { reply?: string; actions?: unknown[] }
      if (json && (!chat?.reply || typeof chat.reply !== 'string')) {
        const obj = json as Record<string, unknown>
        const stringField = Object.values(obj).find((v) => typeof v === 'string') as string | undefined
        if (stringField) chat = { ...chat, reply: stringField }
      }
      if (!chat?.reply || typeof chat.reply !== 'string') {
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

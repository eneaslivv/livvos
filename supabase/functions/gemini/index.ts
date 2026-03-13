// @ts-nocheck
// Supabase Edge Function: Gemini proxy
// Requires GEMINI_API_KEY in function environment

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAILY_QUOTA = 50 // max AI calls per tenant per day

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

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing GEMINI_API_KEY' }), {
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
- Each phase should have 3-6 concrete, actionable tasks (NOT more — quality over quantity)
- Each task should have 1-3 subtasks ONLY if the task is complex enough to warrant them. Simple tasks need 0 subtasks.
- IMPORTANT: Each task MUST have its own "dueDate" (YYYY-MM-DD) staggered within the phase date range. Space tasks evenly — do NOT give all tasks the same date.
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
- Stagger due dates logically — do NOT pile multiple tasks on the same day. Spread them across the period.
- Keep project-related tasks grouped on nearby days for focus.
- Schedule high-priority and urgent tasks earlier in the period.
- Avoid scheduling tasks during calendar events (use the event times provided).
- Respect user planning preferences (provided as context) — these are the user's personal scheduling rules.
- Each change MUST include the exact taskId as provided in the input — do NOT generate new IDs.
- Include "current*" fields to show the before state and "new*" fields for the after state.
- Only include field pairs that are actually changing (e.g., if only date changes, omit assignee and priority fields).
- Keep the total number of changes reasonable (max ~20 changes per request).
- Respond in the SAME language as the input.`
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
        : 'You are a helpful assistant. Return ONLY valid JSON.'

    const maxTokens = type === 'proposal' ? 2400 : type === 'blog' ? 2400 : type === 'tasks_bulk' ? 4500 : type === 'plan_period' ? 4500 : type === 'weekly_summary' ? 1600 : type === 'advisor' ? 2400 : 512

    const requestPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt },
            { text: input },
          ],
        },
      ],
      generationConfig: {
        temperature: type === 'tasks_bulk' || type === 'plan_period' ? 0.4 : type === 'weekly_summary' ? 0.5 : type === 'advisor' ? 0.6 : 0.3,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      return new Response(JSON.stringify({ error: text || 'Gemini request failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()
    // Extract text from content parts only (gemini-2.5 has thinking + content parts)
    const parts = data?.candidates?.[0]?.content?.parts || []
    // Filter out thinking parts — only keep actual content
    const contentParts = parts.filter((p: any) => !p.thought)
    const text = contentParts.map((p: any) => p.text || '').join('') || ''

    let json: TaskResponse | TasksBulkResponse | ProposalResponse | BlogResponse | WeeklySummaryResponse | AdvisorResponse | PlanPeriodResponse | null = null
    try {
      json = JSON.parse(text)
    } catch (_err) {
      // Try extracting JSON from markdown code blocks
      const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlock) {
        try { json = JSON.parse(codeBlock[1].trim()) } catch {}
      }
      // Fallback: extract first { ... } block
      if (!json) {
        const match = text.match(/\{[\s\S]*\}/)
        if (match) {
          try { json = JSON.parse(match[0]) } catch {}
        }
      }
    }

    if (type === 'tasks_bulk') {
      const bulk = json as TasksBulkResponse
      if (!bulk || !Array.isArray(bulk.phases) || bulk.phases.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: text }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'proposal') {
      const proposal = json as ProposalResponse
      if (!proposal || !proposal.content) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: text }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'blog') {
      const blog = json as BlogResponse
      if (!blog || !blog.title || !blog.content) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: text }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'weekly_summary') {
      const summary = json as WeeklySummaryResponse
      if (!summary || !Array.isArray(summary.objectives) || !Array.isArray(summary.focus_tasks) || !Array.isArray(summary.recommendations)) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: text }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'advisor') {
      const advisor = json as AdvisorResponse
      if (!advisor || !Array.isArray(advisor.insights)) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: text }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (type === 'plan_period') {
      const plan = json as PlanPeriodResponse
      if (!plan || !Array.isArray(plan.changes)) {
        return new Response(JSON.stringify({ error: 'Invalid AI response', raw: text }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (!json || !(json as TaskResponse).title) {
      return new Response(JSON.stringify({ error: 'Invalid AI response', raw: text }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log usage (non-blocking)
    const usage = data?.usageMetadata
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

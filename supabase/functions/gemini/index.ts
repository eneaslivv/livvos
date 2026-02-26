// @ts-nocheck
// Supabase Edge Function: Gemini proxy
// Requires GEMINI_API_KEY in function environment

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type TaskResponse = {
  title: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  tag?: string
}

type TasksBulkResponse = {
  phases: {
    name: string
    tasks: { title: string; priority: 'low' | 'medium' | 'high' }[]
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
        ? `You are a project planning assistant. Given a description of work, break it into phases and tasks.
Return ONLY valid JSON with this structure:
{"phases":[{"name":"Phase Name","tasks":[{"title":"Task title","priority":"low|medium|high"}]}]}
Rules:
- Create 2-6 phases with clear names
- Each phase should have 2-8 concrete, actionable tasks
- Priorities: high for critical/blocking tasks, medium for standard, low for nice-to-have
- Task titles should be concise and actionable (start with a verb)
- Respond in the same language as the input`
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

    const maxTokens = type === 'proposal' ? 1200 : type === 'blog' ? 1400 : type === 'tasks_bulk' ? 2000 : type === 'weekly_summary' ? 800 : type === 'advisor' ? 1200 : 256

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
        temperature: type === 'tasks_bulk' ? 0.4 : type === 'weekly_summary' ? 0.5 : type === 'advisor' ? 0.6 : 0.3,
        maxOutputTokens: maxTokens,
      },
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    let json: TaskResponse | TasksBulkResponse | ProposalResponse | BlogResponse | WeeklySummaryResponse | AdvisorResponse | null = null
    try {
      json = JSON.parse(text)
    } catch (_err) {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        json = JSON.parse(match[0])
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
    } else if (!json || !(json as TaskResponse).title) {
      return new Response(JSON.stringify({ error: 'Invalid AI response', raw: text }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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

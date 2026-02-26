import { supabase } from './supabase'

type TaskAIResult = {
  title: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  tag?: string
}

type ProposalAIResult = {
  summary: string
  content: string
  timeline: { week: number; title: string; detail: string }[]
  language?: 'en' | 'es'
}

type BlogAIResult = {
  title: string
  excerpt: string
  content: string
  language?: 'en' | 'es'
}

export const generateTaskFromAI = async (input: string): Promise<TaskAIResult> => {
  const { data, error } = await supabase.functions.invoke('gemini', {
    body: {
      type: 'task',
      input,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.result?.title) {
    throw new Error('Invalid AI response')
  }

  return data.result as TaskAIResult
}

export const generateProposalFromAI = async (input: string): Promise<ProposalAIResult> => {
  const { data, error } = await supabase.functions.invoke('gemini', {
    body: {
      type: 'proposal',
      input,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.result?.content) {
    throw new Error('Invalid AI response')
  }

  return data.result as ProposalAIResult
}

type WeeklySummaryAIResult = {
  objectives: string[]
  focus_tasks: string[]
  recommendations: string[]
}

export const generateWeeklySummaryFromAI = async (input: string): Promise<WeeklySummaryAIResult> => {
  const { data, error } = await supabase.functions.invoke('gemini', {
    body: {
      type: 'weekly_summary',
      input,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.result?.objectives || !data?.result?.focus_tasks || !data?.result?.recommendations) {
    throw new Error('Invalid AI response')
  }

  return data.result as WeeklySummaryAIResult
}

export type AdvisorInsight = {
  area: string
  icon: string
  title: string
  body: string
  priority: 'high' | 'medium' | 'low'
}

export type AdvisorAIResult = {
  insights: AdvisorInsight[]
  greeting: string
}

export const generateAdvisorInsights = async (input: string): Promise<AdvisorAIResult> => {
  const { data, error } = await supabase.functions.invoke('gemini', {
    body: {
      type: 'advisor',
      input,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.result?.insights || !Array.isArray(data.result.insights)) {
    throw new Error('Invalid AI response')
  }

  return data.result as AdvisorAIResult
}

export const generateBlogFromAI = async (input: string): Promise<BlogAIResult> => {
  const { data, error } = await supabase.functions.invoke('gemini', {
    body: {
      type: 'blog',
      input,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.result?.title || !data?.result?.content) {
    throw new Error('Invalid AI response')
  }

  return data.result as BlogAIResult
}

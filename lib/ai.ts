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

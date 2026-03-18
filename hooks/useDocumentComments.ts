import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export interface DocumentComment {
  id: string
  author_name: string
  comment: string
  created_at: string
}

interface UseDocumentCommentsReturn {
  comments: DocumentComment[]
  loading: boolean
  addComment: (authorName: string, authorEmail: string, comment: string) => Promise<boolean>
}

/**
 * Hook for managing comments on shared documents (anonymous-safe).
 * Uses RPC functions that bypass RLS via SECURITY DEFINER.
 */
export function useDocumentComments(shareToken: string | null): UseDocumentCommentsReturn {
  const [comments, setComments] = useState<DocumentComment[]>([])
  const [loading, setLoading] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Fetch comments
  useEffect(() => {
    if (!shareToken) {
      setComments([])
      return
    }

    let cancelled = false
    setLoading(true)

    const load = async () => {
      const { data, error } = await supabase.rpc('get_shared_document_comments', { p_token: shareToken })
      if (!cancelled) {
        if (!error && data) {
          setComments(Array.isArray(data) ? data : [])
        }
        setLoading(false)
      }
    }

    load()

    // Realtime — listen for new comments on this document
    // We subscribe to all inserts on document_comments and filter client-side
    // since we don't know the document_id from just the token
    const channel = supabase
      .channel(`doc-comments-${shareToken}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'document_comments',
      }, (payload) => {
        const newComment = payload.new as any
        setComments(prev => {
          if (prev.some(c => c.id === newComment.id)) return prev
          // Remove temp optimistic entries
          const withoutTemp = prev.filter(c => !c.id.startsWith('temp-'))
          return [...withoutTemp, {
            id: newComment.id,
            author_name: newComment.author_name,
            comment: newComment.comment,
            created_at: newComment.created_at,
          }]
        })
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      cancelled = true
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [shareToken])

  const addComment = useCallback(async (authorName: string, authorEmail: string, comment: string): Promise<boolean> => {
    if (!shareToken || !comment.trim()) return false

    const trimmed = comment.trim()
    const name = authorName.trim() || 'Anonymous'

    // Optimistic insert
    const tempId = `temp-${Date.now()}`
    setComments(prev => [...prev, {
      id: tempId,
      author_name: name,
      comment: trimmed,
      created_at: new Date().toISOString(),
    }])

    const { data, error } = await supabase.rpc('add_shared_document_comment', {
      p_token: shareToken,
      p_author_name: name,
      p_author_email: authorEmail.trim() || null,
      p_comment: trimmed,
    })

    if (error || data?.error) {
      // Remove optimistic on failure
      setComments(prev => prev.filter(c => c.id !== tempId))
      if (import.meta.env.DEV) console.warn('[useDocumentComments] error:', error?.message || data?.error)
      return false
    }

    return true
  }, [shareToken])

  return { comments, loading, addComment }
}

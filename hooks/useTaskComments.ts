import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useTenant } from '../context/TenantContext';
import { useTeam } from '../context/TeamContext';

export interface TaskComment {
  id: string;
  task_id: string;
  tenant_id: string;
  user_id: string | null;
  user_name: string | null;
  user_avatar_url: string | null;
  is_internal: boolean;
  comment: string;
  created_at: string;
}

interface UseTaskCommentsReturn {
  comments: TaskComment[];
  loading: boolean;
  addComment: (text: string, isInternal: boolean) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
}

export function useTaskComments(taskId: string | null): UseTaskCommentsReturn {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { members } = useTeam();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Get current user's display info
  const currentMember = members.find(m => m.id === user?.id);
  const userName = currentMember?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const userAvatar = currentMember?.avatar_url || user?.user_metadata?.avatar_url || null;

  // Fetch comments for task
  useEffect(() => {
    if (!taskId) {
      setComments([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetch = async () => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (!cancelled) {
        if (!error && data) setComments(data);
        setLoading(false);
      }
    };

    fetch();

    // Realtime subscription
    const channel = supabase
      .channel(`task-comments-${taskId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'task_comments',
        filter: `task_id=eq.${taskId}`,
      }, (payload) => {
        const newComment = payload.new as TaskComment;
        setComments(prev => {
          // Deduplicate (in case of optimistic + realtime)
          if (prev.some(c => c.id === newComment.id)) return prev;
          // Replace temp optimistic message if exists
          const withoutTemp = prev.filter(c => !c.id.startsWith('temp-'));
          return [...withoutTemp, newComment];
        });
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'task_comments',
        filter: `task_id=eq.${taskId}`,
      }, (payload) => {
        const deleted = payload.old as { id: string };
        setComments(prev => prev.filter(c => c.id !== deleted.id));
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [taskId]);

  const addComment = useCallback(async (text: string, isInternal: boolean) => {
    if (!taskId || !user?.id || !currentTenant?.id || !text.trim()) return;

    const trimmed = text.trim();

    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const optimistic: TaskComment = {
      id: tempId,
      task_id: taskId,
      tenant_id: currentTenant.id,
      user_id: user.id,
      user_name: userName,
      user_avatar_url: userAvatar,
      is_internal: isInternal,
      comment: trimmed,
      created_at: new Date().toISOString(),
    };
    setComments(prev => [...prev, optimistic]);

    const { error } = await supabase
      .from('task_comments')
      .insert({
        task_id: taskId,
        tenant_id: currentTenant.id,
        user_id: user.id,
        user_name: userName,
        user_avatar_url: userAvatar,
        is_internal: isInternal,
        comment: trimmed,
      });

    if (error) {
      // Remove optimistic on failure
      setComments(prev => prev.filter(c => c.id !== tempId));
      if (import.meta.env.DEV) console.warn('[useTaskComments] insert error:', error.message);
    }
  }, [taskId, user?.id, currentTenant?.id, userName, userAvatar]);

  const deleteComment = useCallback(async (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));

    const { error } = await supabase
      .from('task_comments')
      .delete()
      .eq('id', commentId);

    if (error && import.meta.env.DEV) {
      console.warn('[useTaskComments] delete error:', error.message);
    }
  }, []);

  return { comments, loading, addComment, deleteComment };
}

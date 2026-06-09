import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useTenant } from '../context/TenantContext';
import { useTeam } from '../context/TeamContext';
import { notifyTaskCommentToSlack } from '../lib/communications/slack';

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
  /** Set when a comment saved but couldn't be mirrored to a configured Slack
   *  channel (e.g. the bot isn't in it). null when all good / no channel set. */
  slackHint: string | null;
  dismissSlackHint: () => void;
}

interface TaskNotifyInfo {
  title: string;
  owner_id?: string;
  assignee_id?: string;
  project_id?: string | null;
}

export function useTaskComments(taskId: string | null, taskInfo?: TaskNotifyInfo): UseTaskCommentsReturn {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { members } = useTeam();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [slackHint, setSlackHint] = useState<string | null>(null);
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
    } else {
      // Best-effort: mirror the comment into the project's connected Slack
      // channel as a per-task thread. Never blocks the comment — but surface a
      // hint when a channel IS configured and the post failed (e.g. the bot
      // isn't in the channel) so it doesn't fail silently.
      notifyTaskCommentToSlack({
        tenantId: currentTenant.id,
        task: { id: taskId, title: taskInfo?.title || 'Task', project_id: taskInfo?.project_id ?? null },
        comment: trimmed,
        authorName: userName,
        isInternal,
      }).then((r) => {
        setSlackHint(r.error
          ? "Saved — but couldn't post to the linked Slack channel. The bot may need to be invited to it."
          : null);
      }).catch(() => {});
    }
    // Notifications (owner, assignee, @mentions) are handled by the
    // notify_on_task_comment DB trigger — see migration
    // 2026-05-06_task_mentions_and_updates.sql. Doing it server-side keeps
    // the link/priority/mention-parsing rules in one place and prevents the
    // double-notification bug (one from frontend + one from trigger).
  }, [taskId, user?.id, currentTenant?.id, userName, userAvatar, taskInfo]);

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

  return { comments, loading, addComment, deleteComment, slackHint, dismissSlackHint: () => setSlackHint(null) };
}

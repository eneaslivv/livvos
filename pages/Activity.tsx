import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { useSupabase } from '../hooks/useSupabase';
import { useAuth } from '../hooks/useAuth';
import { useRBAC } from '../context/RBACContext';
import { useTenant } from '../context/TenantContext';
import { useTeam } from '../context/TeamContext';
import { supabase } from '../lib/supabase';

type TabType = 'All Activity' | 'My Updates' | 'Comments' | 'Files';

interface TransformedActivity {
  id: string;
  userName: string;
  userId: string;
  userAvatar: string;
  action: string;
  displayAction: string;
  target: string;
  projectTitle: string | null;
  type: string;
  details: string | null;
  rawDetails: any;
  timestamp: string;
  relativeTime: string;
  dateKey: string;
  likes: string[];
  commentCount: number;
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getInitials(name: string | null | undefined): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
    'bg-rose-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-pink-600',
    'bg-teal-600', 'bg-orange-600'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// Tiny chip per activity type — rendered next to the action verb.
type ActivityBadge = { icon: React.ComponentType<{ size?: number; className?: string }>; tone: string };
function getActivityBadge(type: string): ActivityBadge | null {
  switch (type) {
    case 'task_completed':  return { icon: Icons.CheckCircle, tone: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400' };
    case 'task_assigned':   return { icon: Icons.User,        tone: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400' };
    case 'task_created':    return { icon: Icons.Plus,        tone: 'text-violet-500 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-400' };
    case 'task_reopened':   return { icon: Icons.RefreshCw,   tone: 'text-amber-500 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400' };
    case 'task_deleted':    return { icon: Icons.Trash,       tone: 'text-rose-500 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400' };
    case 'project_created': return { icon: Icons.Briefcase,   tone: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-400' };
    case 'file_uploaded':   return { icon: Icons.Paperclip,   tone: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 dark:text-cyan-400' };
    case 'status_change':   return { icon: Icons.Flag,        tone: 'text-amber-500 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400' };
    default: return null;
  }
}

function extractContent(details: any): string | null {
  if (!details) return null;
  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details);
      return parsed.content || details;
    } catch {
      return details;
    }
  }
  if (typeof details === 'object' && details.content) return details.content;
  return null;
}

export const Activity: React.FC = () => {
  const { user: authUser } = useAuth();
  const { user: profileUser, isLoading: profileLoading } = useRBAC();
  const { currentTenant, isLoading: tenantLoading } = useTenant();
  // Only fetch after tenant is ready to avoid empty results from RLS policies
  const tenantReady = !tenantLoading && !!currentTenant;
  const { data: rawActivities, loading, error: fetchError, refresh } = useSupabase<any>('activity_logs', {
    enabled: tenantReady,
    subscribe: true,
  });
  const { data: allTasks } = useSupabase<any>('tasks', {
    enabled: tenantReady,
    subscribe: true,
    select: 'id,title,assignee_id,completed,completed_at,completed_by,priority',
  });
  const { members } = useTeam();

  const [activeTab, setActiveTab] = useState<TabType>('All Activity');
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [optimisticPosts, setOptimisticPosts] = useState<any[]>([]);

  // Sidebar state
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [optimisticReplies, setOptimisticReplies] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Leaderboard toggle + drill-down
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [drillDownPersonId, setDrillDownPersonId] = useState<string | null>(null);

  // Likes in-flight tracking
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);

  const effectiveUser = useMemo(() => {
    if (profileUser) return { id: profileUser.id, name: profileUser.name, email: profileUser.email };
    if (!authUser) return null;
    const fallbackName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || null;
    return { id: authUser.id, name: fallbackName, email: authUser.email ?? '' };
  }, [profileUser, authUser]);

  const userInitials = useMemo(() => getInitials(effectiveUser?.name), [effectiveUser?.name]);
  const userAvatarColor = useMemo(() => getAvatarColor(effectiveUser?.name || effectiveUser?.email || 'U'), [effectiveUser]);

  // Member lookup
  const memberMap = useMemo(() => {
    const map: Record<string, { name: string; avatar_url: string | null }> = {};
    members.forEach(m => {
      map[m.id] = { name: m.name || m.email, avatar_url: m.avatar_url };
    });
    return map;
  }, [members]);

  // Weekly per-person stats from real tasks data
  const weeklyStats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday start

    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeekByPerson: Record<string, number> = {};
    const lastWeekByPerson: Record<string, number> = {};
    let thisWeekTotal = 0;
    let lastWeekTotal = 0;

    (allTasks || []).forEach((task: any) => {
      if (!task.completed || !task.completed_at || !task.assignee_id) return;
      const completedDate = new Date(task.completed_at);

      if (completedDate >= weekStart) {
        thisWeekTotal++;
        thisWeekByPerson[task.assignee_id] = (thisWeekByPerson[task.assignee_id] || 0) + 1;
      } else if (completedDate >= lastWeekStart && completedDate < weekStart) {
        lastWeekTotal++;
        lastWeekByPerson[task.assignee_id] = (lastWeekByPerson[task.assignee_id] || 0) + 1;
      }
    });

    const velocity = lastWeekTotal > 0
      ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
      : (thisWeekTotal > 0 ? 100 : 0);

    // Top performer
    let topPerformerId: string | null = null;
    let topPerformerCount = 0;
    Object.entries(thisWeekByPerson).forEach(([personId, count]) => {
      if (count > topPerformerCount) {
        topPerformerCount = count;
        topPerformerId = personId;
      }
    });
    const topPerformerName = topPerformerId ? (memberMap[topPerformerId]?.name || 'Team Member') : null;

    // Ranking sorted by this week completions
    const ranking = Object.entries(thisWeekByPerson)
      .map(([personId, thisWeekCount]) => ({
        id: personId,
        name: memberMap[personId]?.name || 'Team Member',
        avatar_url: memberMap[personId]?.avatar_url || null,
        thisWeek: thisWeekCount,
        lastWeek: lastWeekByPerson[personId] || 0,
      }))
      .sort((a, b) => b.thisWeek - a.thisWeek);

    // Add active non-agent members with 0 completions
    const rankedIds = new Set(ranking.map(r => r.id));
    members.forEach(m => {
      if (!rankedIds.has(m.id) && m.status === 'active' && !m.is_agent) {
        ranking.push({
          id: m.id,
          name: m.name || m.email,
          avatar_url: m.avatar_url,
          thisWeek: 0,
          lastWeek: lastWeekByPerson[m.id] || 0,
        });
      }
    });

    return { thisWeekTotal, lastWeekTotal, velocity, topPerformerName, topPerformerCount, ranking };
  }, [allTasks, memberMap, members]);

  // Thread count from activity_logs (for DISCUSSIONS card)
  const threadCount = useMemo(() => {
    if (!rawActivities) return 0;
    const topLevel = rawActivities.filter((a: any) => !a.parent_id);
    const replies = rawActivities.filter((a: any) => a.parent_id);
    return topLevel.filter((a: any) => a.type === 'comment' || a.type === 'status').length + replies.length;
  }, [rawActivities]);

  // Transform and filter activities
  const allActivities = useMemo(() => {
    const dbActivities = rawActivities || [];
    const combined = [...dbActivities, ...optimisticPosts.filter(op => !dbActivities.some((d: any) => d.id === op.id))];

    return combined
      .filter((a: any) => !a.parent_id)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((a: any): TransformedActivity => {
        const commentCount = combined.filter((c: any) => c.parent_id === a.id).length;
        return {
          id: a.id,
          userName: a.user_name || a.metadata?.user_name || 'Team Member',
          userId: a.user_id || a.owner_id,
          userAvatar: a.user_avatar || getInitials(a.user_name || a.metadata?.user_name),
          action: a.action,
          displayAction: a.action === 'posted update' ? 'shared an update in' :
                        a.type === 'task_completed' ? 'completed' :
                        a.type === 'task_reopened' ? 'reopened' :
                        a.type === 'task_assigned' ? 'assigned' :
                        a.type === 'task_created' ? 'added task' :
                        a.type === 'task_deleted' ? 'removed task' :
                        a.type === 'file_uploaded' ? 'uploaded' :
                        a.type === 'status_change' ? 'changed status of' :
                        a.type === 'project_created' ? 'created project' :
                        (a.action || 'updated'),
          target: a.target || 'General',
          projectTitle: a.project_title,
          type: a.type,
          details: extractContent(a.details),
          rawDetails: a.details,
          timestamp: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          relativeTime: getRelativeTime(new Date(a.created_at)),
          dateKey: new Date(a.created_at).toDateString() === new Date().toDateString() ? 'TODAY' :
                   new Date(a.created_at).toDateString() === new Date(Date.now() - 86400000).toDateString() ? 'YESTERDAY' :
                   new Date(a.created_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
          likes: Array.isArray(a.likes) ? a.likes : [],
          commentCount
        };
      });
  }, [rawActivities, optimisticPosts]);

  // Tab filtering
  const filteredActivities = useMemo(() => {
    switch (activeTab) {
      case 'My Updates':
        return allActivities.filter(a => a.userId === effectiveUser?.id);
      case 'Comments':
        return allActivities.filter(a => a.type === 'comment' || a.commentCount > 0);
      case 'Files':
        return allActivities.filter(a => a.type === 'file_uploaded');
      default:
        return allActivities;
    }
  }, [allActivities, activeTab, effectiveUser?.id]);

  // Group by date
  const groupedActivities = useMemo(() => {
    const groups: Record<string, TransformedActivity[]> = {};
    filteredActivities.forEach(act => {
      if (!groups[act.dateKey]) groups[act.dateKey] = [];
      groups[act.dateKey].push(act);
    });
    return groups;
  }, [filteredActivities]);

  // Tab counts
  const tabCounts = useMemo(() => ({
    'All Activity': allActivities.length,
    'My Updates': allActivities.filter(a => a.userId === effectiveUser?.id).length,
    'Comments': allActivities.filter(a => a.type === 'comment' || a.commentCount > 0).length,
    'Files': allActivities.filter(a => a.type === 'file_uploaded').length,
  }), [allActivities, effectiveUser?.id]);

  // Post update
  const handlePost = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    setPostError(null);
    if (!newPost.trim()) return;
    if (!effectiveUser) { setPostError('You must be logged in to post.'); return; }
    if (!currentTenant && !contextTimedOut) { setPostError('System is initializing, please wait...'); return; }

    const content = newPost.trim();
    const userName = effectiveUser.name || effectiveUser.email;

    // Optimistic insert
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticEntry = {
      id: optimisticId,
      user_id: effectiveUser.id,
      user_name: userName,
      user_avatar: getInitials(userName),
      action: 'posted update',
      target: 'Team Feed',
      type: 'comment',
      details: { content },
      created_at: new Date().toISOString(),
      likes: [],
      _optimistic: true
    };
    setOptimisticPosts(prev => [optimisticEntry, ...prev]);
    setNewPost('');
    setPosting(true);

    try {
      const tenantId = currentTenant?.id;
      if (!tenantId) { throw new Error('No active tenant. Try refreshing the page.'); }
      const { error: insertError } = await supabase.from('activity_logs').insert({
        user_id: effectiveUser.id,
        tenant_id: tenantId,
        user_name: userName,
        user_avatar: getInitials(userName),
        action: 'posted update',
        target: 'Team Feed',
        entity_type: 'status',
        type: 'comment',
        details: { content },
        metadata: { user_name: userName }
      });

      if (insertError) throw insertError;
      await refresh();
      setOptimisticPosts(prev => prev.filter(p => p.id !== optimisticId));
    } catch (err: any) {
      console.error('Error posting activity:', err);
      setPostError(err.message || 'Failed to post update.');
      setOptimisticPosts(prev => prev.filter(p => p.id !== optimisticId));
      setNewPost(content); // Restore the text
    } finally {
      setPosting(false);
    }
  }, [newPost, effectiveUser, currentTenant, tenantLoading, profileLoading, refresh]);

  // Keyboard shortcut: Ctrl/Cmd+Enter to post
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePost();
    }
  }, [handlePost]);

  // Like toggle
  const handleLike = useCallback(async (activityId: string, currentLikes: string[]) => {
    if (!effectiveUser || likingIds.has(activityId)) return;
    setLikingIds(prev => new Set(prev).add(activityId));

    const userId = effectiveUser.id;
    const alreadyLiked = currentLikes.includes(userId);
    const newLikes = alreadyLiked ? currentLikes.filter(id => id !== userId) : [...currentLikes, userId];

    try {
      const { error: updateError } = await supabase
        .from('activity_logs')
        .update({ likes: newLikes })
        .eq('id', activityId);
      if (updateError) throw updateError;
      await refresh();
    } catch (err) {
      console.error('Error toggling like:', err);
    } finally {
      setLikingIds(prev => { const next = new Set(prev); next.delete(activityId); return next; });
    }
  }, [effectiveUser, likingIds, refresh]);

  // Open sidebar
  const openDetail = useCallback((id: string) => {
    setSelectedActivityId(id);
    setSidebarOpen(true);
    setReplyText('');
    setOptimisticReplies([]);
  }, []);

  // Close sidebar
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    setTimeout(() => setSelectedActivityId(null), 300);
  }, []);

  // Selected activity data
  const selectedActivity = useMemo(() => {
    if (!selectedActivityId || !rawActivities) return null;
    return rawActivities.find((a: any) => a.id === selectedActivityId);
  }, [selectedActivityId, rawActivities]);

  // Comments for selected activity
  const comments = useMemo(() => {
    if (!selectedActivityId || !rawActivities) return [];
    const dbComments = rawActivities
      .filter((a: any) => a.parent_id === selectedActivityId)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const optComments = optimisticReplies.filter(r =>
      r.parent_id === selectedActivityId && !dbComments.some((d: any) => d.id === r.id)
    );
    return [...dbComments, ...optComments];
  }, [selectedActivityId, rawActivities, optimisticReplies]);

  // Auto-scroll to bottom of comments when new ones arrive
  useEffect(() => {
    if (sidebarContentRef.current && comments.length > 0) {
      const el = sidebarContentRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [comments.length]);

  // Focus reply input when sidebar opens
  useEffect(() => {
    if (sidebarOpen && replyInputRef.current) {
      setTimeout(() => replyInputRef.current?.focus(), 350);
    }
  }, [sidebarOpen]);

  // Reply
  const handleReply = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !effectiveUser || !currentTenant || !selectedActivityId) return;

    const content = replyText.trim();
    const userName = effectiveUser.name || effectiveUser.email;

    // Optimistic reply
    const optimisticId = `opt-reply-${Date.now()}`;
    const optimisticReply = {
      id: optimisticId,
      user_id: effectiveUser.id,
      user_name: userName,
      user_avatar: getInitials(userName),
      parent_id: selectedActivityId,
      action: 'replied',
      target: selectedActivity?.target || 'Activity',
      type: 'comment',
      details: { content },
      created_at: new Date().toISOString(),
      _optimistic: true
    };
    setOptimisticReplies(prev => [...prev, optimisticReply]);
    setReplyText('');
    setIsReplying(true);

    try {
      const { error: insertError } = await supabase.from('activity_logs').insert({
        user_id: effectiveUser.id,
        tenant_id: currentTenant.id,
        parent_id: selectedActivityId,
        user_name: userName,
        user_avatar: getInitials(userName),
        action: 'replied',
        target: selectedActivity?.target || 'Activity',
        entity_type: 'comment',
        type: 'comment',
        details: { content },
        metadata: { user_name: userName }
      });

      if (insertError) throw insertError;
      await refresh();
      setOptimisticReplies(prev => prev.filter(r => r.id !== optimisticId));
    } catch (err: any) {
      console.error('Error replying:', err);
      setOptimisticReplies(prev => prev.filter(r => r.id !== optimisticId));
      setReplyText(content);
    } finally {
      setIsReplying(false);
    }
  }, [replyText, effectiveUser, currentTenant, selectedActivityId, selectedActivity, refresh]);

  // Delete post (own only)
  const handleDelete = useCallback(async (activityId: string) => {
    if (!effectiveUser) return;
    try {
      const { error: deleteError } = await supabase
        .from('activity_logs')
        .delete()
        .eq('id', activityId)
        .eq('user_id', effectiveUser.id);
      if (deleteError) throw deleteError;
      if (selectedActivityId === activityId) closeSidebar();
      await refresh();
    } catch (err) {
      console.error('Error deleting:', err);
    }
  }, [effectiveUser, selectedActivityId, closeSidebar, refresh]);

  // Auto-resize textarea
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewPost(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  const isReady = !tenantLoading && !profileLoading && !!effectiveUser;

  // Timeout: if loading for more than 8s, stop showing spinner and show empty state
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const loadingStartRef = useRef(Date.now());
  useEffect(() => {
    if (!loading && tenantReady) {
      setLoadingTimedOut(false);
      loadingStartRef.current = Date.now();
      return;
    }
    // Use elapsed time since first mount to avoid resetting on loading flicker
    const elapsed = Date.now() - loadingStartRef.current;
    const remaining = Math.max(0, 8000 - elapsed);
    const timer = setTimeout(() => setLoadingTimedOut(true), remaining);
    return () => clearTimeout(timer);
  }, [loading, tenantReady]);

  // Also timeout for context loading so textarea doesn't stay disabled forever
  const [contextTimedOut, setContextTimedOut] = useState(false);
  useEffect(() => {
    if (isReady) { setContextTimedOut(false); return; }
    const timer = setTimeout(() => setContextTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, [isReady]);

  const canPost = isReady || contextTimedOut;

  return (
    <div className="max-w-5xl mx-auto pt-3 pb-6 space-y-3 font-sans">
      {/* Compact header — h2 instead of h3, inline KPI strip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Activity</h1>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold uppercase tracking-wider">
            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
        <button
          onClick={() => refresh()}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition"
        >
          <Icons.RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* KPI strip — denser, single-row inline */}
      <div className="grid grid-cols-3 gap-2">
        <div className="px-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-lg flex items-center gap-2.5">
          <div className="p-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10">
            <Icons.CheckCircle size={12} className="text-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold">Completed</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{weeklyStats.thisWeekTotal}</span>
              <span className="text-[10px] text-zinc-500">tasks</span>
              {weeklyStats.topPerformerName && (
                <span className="text-[10px] text-zinc-400 truncate">· top {weeklyStats.topPerformerName} ({weeklyStats.topPerformerCount})</span>
              )}
            </div>
          </div>
        </div>
        <div className="px-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-lg flex items-center gap-2.5">
          <div className="p-1 rounded-md bg-blue-50 dark:bg-blue-500/10">
            <Icons.Zap size={12} className="text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold">Velocity</div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-sm font-semibold tabular-nums ${weeklyStats.velocity >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {weeklyStats.velocity >= 0 ? '+' : ''}{weeklyStats.velocity}%
              </span>
              <span className="text-[10px] text-zinc-400 truncate">{weeklyStats.thisWeekTotal} vs {weeklyStats.lastWeekTotal} last wk</span>
            </div>
          </div>
        </div>
        <div className="px-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-lg flex items-center gap-2.5">
          <div className="p-1 rounded-md bg-violet-50 dark:bg-violet-500/10">
            <Icons.Message size={12} className="text-violet-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold">Discussions</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{threadCount}</span>
              <span className="text-[10px] text-zinc-500">threads</span>
            </div>
          </div>
        </div>
      </div>

      {/* Team Performance — compact roster with click-to-drill-down */}
      {weeklyStats.ranking.length > 0 && (
        <div className="bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowLeaderboard(prev => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <Icons.Users size={11} />
              Team
              <span className="text-[10px] font-normal normal-case tracking-normal text-zinc-400">· this week</span>
            </div>
            <Icons.ChevronDown size={12} className={`text-zinc-400 transition-transform ${showLeaderboard ? 'rotate-180' : ''}`} />
          </button>

          {showLeaderboard && (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {weeklyStats.ranking.map((member, idx) => {
                const maxTasks = weeklyStats.ranking[0]?.thisWeek || 1;
                const barWidth = maxTasks > 0 ? (member.thisWeek / maxTasks) * 100 : 0;
                const weekDelta = member.thisWeek - member.lastWeek;
                const isOpen = drillDownPersonId === member.id;

                // Tasks for this person, split open vs completed
                const personTasks = (allTasks || []).filter((t: any) => t.assignee_id === member.id);
                const openTasks = personTasks.filter((t: any) => !t.completed);
                const completedTasks = personTasks
                  .filter((t: any) => t.completed)
                  .sort((a: any, b: any) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());

                return (
                  <div key={member.id}>
                    <button
                      onClick={() => setDrillDownPersonId(prev => prev === member.id ? null : member.id)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 transition ${isOpen ? 'bg-zinc-50/80 dark:bg-zinc-800/40' : 'hover:bg-zinc-50/40 dark:hover:bg-zinc-800/20'}`}
                    >
                      <span className={`w-4 text-[10px] font-semibold text-center tabular-nums ${
                        idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-zinc-400' : idx === 2 ? 'text-amber-700' : 'text-zinc-300 dark:text-zinc-600'
                      }`}>{idx + 1}</span>
                      <div className={`h-5 w-5 rounded-full ${getAvatarColor(member.name)} text-white flex items-center justify-center text-[9px] font-bold shrink-0`}>
                        {member.avatar_url
                          ? <img src={member.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                          : getInitials(member.name)}
                      </div>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200 w-24 truncate text-left">{member.name}</span>
                      <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 tabular-nums w-5 text-right">{member.thisWeek}</span>
                      {weekDelta !== 0 ? (
                        <span className={`text-[9px] font-medium w-7 tabular-nums text-right ${weekDelta > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {weekDelta > 0 ? '+' : ''}{weekDelta}
                        </span>
                      ) : <span className="w-7" />}
                      <Icons.ChevronDown size={11} className={`text-zinc-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-2 pt-1 bg-zinc-50/40 dark:bg-zinc-800/20 space-y-2">
                        {personTasks.length === 0 && (
                          <p className="text-[10px] text-zinc-400 italic px-1">No tasks assigned to this person.</p>
                        )}

                        {openTasks.length > 0 && (
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-1 px-1">
                              Open · {openTasks.length}
                            </div>
                            <div className="space-y-0.5">
                              {openTasks.slice(0, 8).map((t: any) => (
                                <div key={t.id} className="flex items-center gap-1.5 px-1 py-0.5 text-[11px]">
                                  <span className="w-3 h-3 rounded border border-zinc-300 dark:border-zinc-600 shrink-0" />
                                  <span className="flex-1 text-zinc-700 dark:text-zinc-200 truncate">{t.title || 'Untitled'}</span>
                                  {t.priority && (
                                    <span className={`text-[9px] px-1 py-0 rounded uppercase font-semibold tracking-wider ${
                                      t.priority === 'high' ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'
                                      : t.priority === 'medium' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                                    }`}>{t.priority}</span>
                                  )}
                                </div>
                              ))}
                              {openTasks.length > 8 && (
                                <p className="text-[9px] text-zinc-400 px-1">+{openTasks.length - 8} more</p>
                              )}
                            </div>
                          </div>
                        )}

                        {completedTasks.length > 0 && (
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-1 px-1">
                              Completed · {completedTasks.length}
                            </div>
                            <div className="space-y-0.5">
                              {completedTasks.slice(0, 8).map((t: any) => {
                                const completedById = t.completed_by || t.assignee_id;
                                const completedByName = memberMap[completedById]?.name || 'Team Member';
                                const sameAsAssignee = completedById === t.assignee_id;
                                return (
                                  <div key={t.id} className="flex items-center gap-1.5 px-1 py-0.5 text-[11px]">
                                    <Icons.CheckCircle size={10} className="text-emerald-500 shrink-0" />
                                    <span className="flex-1 text-zinc-500 dark:text-zinc-400 line-through truncate">{t.title || 'Untitled'}</span>
                                    <span className="text-[9px] text-zinc-400 whitespace-nowrap">
                                      {sameAsAssignee ? 'self' : `by ${completedByName}`}
                                      {t.completed_at && ` · ${getRelativeTime(new Date(t.completed_at))}`}
                                    </span>
                                  </div>
                                );
                              })}
                              {completedTasks.length > 8 && (
                                <p className="text-[9px] text-zinc-400 px-1">+{completedTasks.length - 8} more</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tabs — compact */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-5">
          {(['All Activity', 'My Updates', 'Comments', 'Files'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-1.5 text-[12px] font-medium transition-colors relative flex items-center gap-1.5 ${
                activeTab === tab
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
              }`}
            >
              {tab}
              {tabCounts[tab] > 0 && (
                <span className={`text-[9px] px-1 py-0 rounded-full font-bold tabular-nums ${
                  activeTab === tab
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                }`}>
                  {tabCounts[tab]}
                </span>
              )}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Input Area — compact */}
      <Card className="p-3 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-lg">
        <div className="flex gap-2.5">
          <div className={`h-8 w-8 rounded-full ${userAvatarColor} text-white flex items-center justify-center font-bold text-[10px] shrink-0`}>
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={newPost}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              placeholder={canPost ? "Share an update..." : "Loading..."}
              disabled={!canPost}
              className="w-full bg-transparent border-none focus:ring-0 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none text-sm p-0 min-h-[36px] disabled:opacity-50 outline-none"
              rows={1}
            />
            <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-1.5">
              <div className="flex gap-3 text-zinc-400">
                <button type="button" className="hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors" title="Attach file"><Icons.Paperclip size={14} /></button>
                <button type="button" className="hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors" title="Add image"><Icons.Image size={14} /></button>
                <button type="button" className="hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors" title="Add document"><Icons.Docs size={14} /></button>
              </div>
              <div className="flex items-center gap-2">
                {newPost.trim() && (
                  <span className="text-[9px] text-zinc-400 hidden sm:block">⌘+Enter</span>
                )}
                <button
                  onClick={handlePost}
                  disabled={posting || !newPost.trim() || !canPost}
                  className="bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white px-3 py-1 rounded-md text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  {posting ? (
                    <span className="flex items-center gap-1.5">
                      <Icons.Loader size={11} className="animate-spin" /> Posting
                    </span>
                  ) : 'Post'}
                </button>
              </div>
            </div>
            {postError && (
              <div className="mt-1.5 text-[11px] text-red-500 font-medium flex items-center gap-1">
                <Icons.AlertCircle size={11} /> {postError}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Fetch error */}
      {fetchError && !loading && allActivities.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Icons.AlertCircle size={32} className="text-red-400 mb-3" />
          <p className="text-red-500 text-sm font-medium mb-2">Error loading activity feed</p>
          <p className="text-zinc-400 text-xs max-w-md text-center mb-4">{fetchError}</p>
          <button
            onClick={() => refresh()}
            className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {(loading || !tenantReady) && !loadingTimedOut && allActivities.length === 0 && !fetchError && (
        <div className="flex flex-col items-center justify-center py-20">
          <Icons.Loader size={32} className="text-zinc-300 animate-spin mb-4" />
          <p className="text-zinc-500 text-sm">{!tenantReady ? 'Connecting...' : 'Loading activity feed...'}</p>
        </div>
      )}

      {/* Feed — compact rows, per-type icon badge */}
      <div className="space-y-3">
        {Object.entries(groupedActivities).map(([date, items]) => (
          <div key={date} className="relative">
            <div className="uppercase text-[10px] font-bold text-zinc-400 dark:text-zinc-500 tracking-wider mb-1.5 pl-10">
              {date}
            </div>

            <div className="space-y-0">
              {(items as TransformedActivity[]).map((act, idx) => {
                const isOwn = act.userId === effectiveUser?.id;
                const isLiked = effectiveUser ? act.likes.includes(effectiveUser.id) : false;
                const isOptimistic = (act as any)._optimistic;
                const badge = getActivityBadge(act.type);

                return (
                  <div key={act.id} className={`flex gap-2.5 group ${isOptimistic ? 'opacity-70' : ''}`}>
                    {/* Avatar Column with type badge overlay */}
                    <div className="w-7 flex flex-col items-center">
                      <div className="relative">
                        <div className={`h-7 w-7 rounded-full ${getAvatarColor(act.userName)} text-white flex items-center justify-center text-[9px] font-bold z-10 shrink-0`}>
                          {getInitials(act.userName)}
                        </div>
                        {badge && (
                          <div className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ${badge.tone} flex items-center justify-center ring-2 ring-white dark:ring-zinc-950`}>
                            <badge.icon size={8} />
                          </div>
                        )}
                      </div>
                      {idx < (items as TransformedActivity[]).length - 1 && (
                        <div className="w-px flex-1 bg-zinc-100 dark:bg-zinc-800/60 mt-1" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-2 min-w-0">
                      <div
                        className="cursor-pointer hover:bg-zinc-50/60 dark:hover:bg-zinc-800/20 rounded-md px-2 py-1 -mx-2 transition-colors"
                        onClick={() => openDetail(act.id)}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <p className="text-[13px] text-zinc-900 dark:text-zinc-100 leading-snug min-w-0">
                            <span className="font-semibold">{act.userName}</span>{' '}
                            <span className="text-zinc-500 dark:text-zinc-400">{act.displayAction}</span>{' '}
                            <span className="font-semibold">{act.target}</span>
                            {act.projectTitle && (
                              <span className="text-zinc-400 dark:text-zinc-500"> · {act.projectTitle}</span>
                            )}
                          </p>
                          <span className="text-[10px] text-zinc-400 whitespace-nowrap tabular-nums" title={act.timestamp}>
                            {act.relativeTime}
                          </span>
                        </div>

                        {act.details && (
                          <div className="mt-1 text-[12px] text-zinc-600 dark:text-zinc-300 pl-2 border-l border-zinc-200 dark:border-zinc-700 leading-snug whitespace-pre-wrap">
                            {act.details}
                          </div>
                        )}

                        {/* Inline action bar — appears on hover, kept tight */}
                        <div className="mt-1 flex gap-0.5 -ml-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); openDetail(act.id); }}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <Icons.Message size={11} />
                            {act.commentCount > 0 ? act.commentCount : ''}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleLike(act.id, act.likes); }}
                            disabled={likingIds.has(act.id)}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                              isLiked
                                ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20'
                                : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <Icons.Heart size={11} className={isLiked ? 'fill-current' : ''} />
                            {act.likes.length > 0 ? act.likes.length : ''}
                          </button>
                          {isOwn && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(act.id); }}
                              className="flex items-center px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Icons.Trash size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {(!loading || loadingTimedOut) && Object.keys(groupedActivities).length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 opacity-60">
            <Icons.Activity size={48} className="text-zinc-300 dark:text-zinc-600 mb-4" />
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">
              {activeTab === 'All Activity' ? 'No updates yet. Be the first to post!' :
               activeTab === 'My Updates' ? "You haven't posted any updates yet." :
               activeTab === 'Comments' ? 'No discussions started yet.' :
               'No files have been shared yet.'}
            </p>
          </div>
        )}
      </div>

      {/* Activity Details Sidebar */}
      {selectedActivityId && createPortal(
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className={`absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeSidebar}
          />
          <div className={`absolute inset-y-0 right-0 max-w-lg w-full max-h-screen bg-white dark:bg-zinc-900 shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Icons.Activity size={18} className="text-zinc-400" />
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Thread</h2>
                <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                  {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
                </span>
              </div>
              <button
                onClick={closeSidebar}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <Icons.X size={20} className="text-zinc-400" />
              </button>
            </div>

            {/* Content */}
            <div ref={sidebarContentRef} className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6">
              {selectedActivity && (
                <>
                  {/* Original Post */}
                  <div className="flex gap-3">
                    <div className={`h-10 w-10 rounded-full ${getAvatarColor(selectedActivity.user_name || 'U')} text-white flex items-center justify-center font-bold text-xs shrink-0`}>
                      {getInitials(selectedActivity.user_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{selectedActivity.user_name || 'Team Member'}</span>
                        <span className="text-xs text-zinc-400">{getRelativeTime(new Date(selectedActivity.created_at))}</span>
                      </div>
                      <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {extractContent(selectedActivity.details) || `${selectedActivity.action} on ${selectedActivity.target}`}
                      </div>

                      {/* Post actions */}
                      <div className="mt-3 flex gap-1">
                        <button
                          onClick={() => {
                            if (effectiveUser) handleLike(selectedActivity.id, Array.isArray(selectedActivity.likes) ? selectedActivity.likes : []);
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                            effectiveUser && Array.isArray(selectedActivity.likes) && selectedActivity.likes.includes(effectiveUser.id)
                              ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20'
                              : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <Icons.Heart size={13} className={effectiveUser && Array.isArray(selectedActivity.likes) && selectedActivity.likes.includes(effectiveUser.id) ? 'fill-current' : ''} />
                          {Array.isArray(selectedActivity.likes) && selectedActivity.likes.length > 0 ? selectedActivity.likes.length : 'Like'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Separator */}
                  {comments.length > 0 && (
                    <div className="border-t border-zinc-100 dark:border-zinc-800" />
                  )}

                  {/* Comments */}
                  <div className="space-y-4">
                    {comments.map((comment: any) => {
                      const isOptimistic = comment._optimistic;
                      return (
                        <div key={comment.id} className={`flex gap-3 ${isOptimistic ? 'opacity-60' : ''}`}>
                          <div className={`h-8 w-8 rounded-full ${getAvatarColor(comment.user_name || 'U')} text-white flex items-center justify-center font-bold text-[10px] shrink-0`}>
                            {getInitials(comment.user_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl px-4 py-3 border border-zinc-100 dark:border-zinc-800">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{comment.user_name || 'Team Member'}</span>
                                <span className="text-[10px] text-zinc-400">{getRelativeTime(new Date(comment.created_at))}</span>
                              </div>
                              <div className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
                                {extractContent(comment.details)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Reply Input */}
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <form onSubmit={handleReply} className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full ${userAvatarColor} text-white flex items-center justify-center font-bold text-[10px] shrink-0`}>
                  {userInitials}
                </div>
                <div className="flex-1 relative">
                  <input
                    ref={replyInputRef}
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a reply..."
                    disabled={!canPost}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-full pl-4 pr-12 py-2.5 text-sm focus:ring-0 focus:border-zinc-400 dark:focus:border-zinc-500 transition-all outline-none disabled:opacity-50"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleReply(e);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isReplying || !replyText.trim() || !canPost}
                    className="absolute right-1.5 top-1 p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-30 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {isReplying ? <Icons.Loader size={18} className="animate-spin" /> : <Icons.Send size={18} />}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

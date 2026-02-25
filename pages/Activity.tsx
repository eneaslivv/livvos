import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { useSupabase } from '../hooks/useSupabase';
import { useAuth } from '../hooks/useAuth';
import { useRBAC } from '../context/RBACContext';
import { useTenant } from '../context/TenantContext';
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
  const { data: rawActivities, loading, error: fetchError, refresh } = useSupabase<any>('activity_logs');

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

  // Stats
  const stats = useMemo(() => {
    if (!rawActivities) return { tasks: 0, threads: 0, velocity: 0 };
    const topLevel = rawActivities.filter((a: any) => !a.parent_id);
    const replies = rawActivities.filter((a: any) => a.parent_id);
    const taskCount = topLevel.filter((a: any) => a.type === 'task_completed').length;
    const threadCount = topLevel.filter((a: any) => a.type === 'comment' || a.type === 'status').length;

    // Velocity: posts this week vs last week
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
    const thisWeek = topLevel.filter((a: any) => new Date(a.created_at) >= weekAgo).length;
    const lastWeek = topLevel.filter((a: any) => {
      const d = new Date(a.created_at);
      return d >= twoWeeksAgo && d < weekAgo;
    }).length;
    const velocity = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : (thisWeek > 0 ? 100 : 0);

    return { tasks: taskCount, threads: threadCount + replies.length, velocity };
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
                        a.type === 'task_completed' ? 'completed a task in' :
                        a.type === 'file_uploaded' ? 'uploaded a file to' :
                        a.type === 'status_change' ? 'changed status in' :
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
    if (tenantLoading || profileLoading) { setPostError('Loading your profile...'); return; }
    if (!effectiveUser) { setPostError('You must be logged in to post.'); return; }
    if (!currentTenant) { setPostError('System is initializing...'); return; }

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
      const { error: insertError } = await supabase.from('activity_logs').insert({
        user_id: effectiveUser.id,
        owner_id: effectiveUser.id,
        tenant_id: currentTenant.id,
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
        owner_id: effectiveUser.id,
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

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Activity Feed</h1>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
        <button
          onClick={() => refresh()}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 transition-colors"
        >
          <Icons.RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 p-5 rounded-2xl flex flex-col justify-between h-32">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 mb-1">
            <Icons.CheckCircle size={18} />
            <span className="text-xs font-bold tracking-wider uppercase">COMPLETED</span>
          </div>
          <div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.tasks} Tasks</div>
            <div className="text-sm text-zinc-500 mt-1">Top performer: <span className="font-medium text-zinc-700 dark:text-zinc-300">{effectiveUser?.name || 'You'}</span></div>
          </div>
        </div>

        <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 p-5 rounded-2xl flex flex-col justify-between h-32">
          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-400 mb-1">
            <Icons.Zap size={18} />
            <span className="text-xs font-bold tracking-wider uppercase">VELOCITY</span>
          </div>
          <div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {stats.velocity >= 0 ? '+' : ''}{stats.velocity}%
            </div>
            <div className="text-sm text-zinc-500 mt-1">Vs last week</div>
          </div>
        </div>

        <div className="bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30 p-5 rounded-2xl flex flex-col justify-between h-32">
          <div className="flex items-center gap-2 text-purple-800 dark:text-purple-400 mb-1">
            <Icons.Message size={18} />
            <span className="text-xs font-bold tracking-wider uppercase">DISCUSSIONS</span>
          </div>
          <div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.threads} Threads</div>
            <div className="text-sm text-zinc-500 mt-1">
              {allActivities.length > 0
                ? <>Most active: <span className="font-medium text-zinc-700 dark:text-zinc-300">{allActivities[0]?.target || 'General'}</span></>
                : 'Start a conversation!'
              }
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-8">
          {(['All Activity', 'My Updates', 'Comments', 'Files'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
                activeTab === tab
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
              }`}
            >
              {tab}
              {tabCounts[tab] > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
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

      {/* Input Area */}
      <Card className="p-6 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-xl">
        <div className="flex gap-4">
          <div className={`h-10 w-10 rounded-full ${userAvatarColor} text-white flex items-center justify-center font-bold text-xs shrink-0`}>
            {userInitials}
          </div>
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={newPost}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              placeholder={isReady ? "What's on your mind? Share an update..." : "Loading..."}
              disabled={!isReady}
              className="w-full bg-transparent border-none focus:ring-0 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none text-base p-0 min-h-[60px] disabled:opacity-50 outline-none"
              rows={2}
            />
            <div className="flex justify-between items-center pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-2">
              <div className="flex gap-4 text-zinc-400">
                <button type="button" className="hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors" title="Attach file"><Icons.Paperclip size={18} /></button>
                <button type="button" className="hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors" title="Add image"><Icons.Image size={18} /></button>
                <button type="button" className="hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors" title="Add document"><Icons.Docs size={18} /></button>
              </div>
              <div className="flex items-center gap-3">
                {newPost.trim() && (
                  <span className="text-[10px] text-zinc-400 hidden sm:block">Ctrl+Enter to post</span>
                )}
                <button
                  onClick={handlePost}
                  disabled={posting || !newPost.trim() || !isReady}
                  className="bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  {posting ? (
                    <span className="flex items-center gap-2">
                      <Icons.Loader size={14} className="animate-spin" /> Posting...
                    </span>
                  ) : 'Post Update'}
                </button>
              </div>
            </div>
            {postError && (
              <div className="mt-2 text-xs text-red-500 font-medium flex items-center gap-1">
                <Icons.AlertCircle size={12} /> {postError}
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
      {loading && allActivities.length === 0 && !fetchError && (
        <div className="flex flex-col items-center justify-center py-20">
          <Icons.Loader size={32} className="text-zinc-300 animate-spin mb-4" />
          <p className="text-zinc-500 text-sm">Loading activity feed...</p>
        </div>
      )}

      {/* Feed */}
      <div className="space-y-8">
        {Object.entries(groupedActivities).map(([date, items]) => (
          <div key={date} className="relative">
            <div className="uppercase text-xs font-bold text-zinc-400 dark:text-zinc-500 tracking-wider mb-6 pl-14">
              {date}
            </div>

            <div className="space-y-1">
              {(items as TransformedActivity[]).map((act, idx) => {
                const isOwn = act.userId === effectiveUser?.id;
                const isLiked = effectiveUser ? act.likes.includes(effectiveUser.id) : false;
                const isOptimistic = (act as any)._optimistic;

                return (
                  <div key={act.id} className={`flex gap-4 group ${isOptimistic ? 'opacity-70' : ''}`}>
                    {/* Avatar Column */}
                    <div className="w-10 flex flex-col items-center">
                      <div className={`h-10 w-10 rounded-full ${getAvatarColor(act.userName)} text-white flex items-center justify-center text-xs font-bold z-10 shrink-0`}>
                        {getInitials(act.userName)}
                      </div>
                      {idx < (items as TransformedActivity[]).length - 1 && (
                        <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800 mt-2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-6">
                      <div
                        className="cursor-pointer hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 rounded-xl p-3 -mx-3 transition-colors"
                        onClick={() => openDetail(act.id)}
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-sm text-zinc-900 dark:text-zinc-100 leading-relaxed">
                            <span className="font-semibold">{act.userName}</span>{' '}
                            <span className="text-zinc-500 dark:text-zinc-400">{act.displayAction}</span>{' '}
                            <span className="font-semibold">{act.target}</span>
                          </p>
                          <span className="text-xs text-zinc-400 whitespace-nowrap ml-4" title={act.timestamp}>
                            {act.relativeTime}
                          </span>
                        </div>

                        {act.projectTitle && (
                          <div className="mt-2 text-xs flex items-center gap-1.5 text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 px-2.5 py-1 rounded-md w-fit border border-zinc-200/50 dark:border-zinc-700/50">
                            <Icons.Grid size={12} className="text-zinc-400" />
                            {act.projectTitle}
                          </div>
                        )}

                        {act.details && (
                          <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-300 pl-4 border-l-2 border-zinc-200 dark:border-zinc-700 py-1 leading-relaxed whitespace-pre-wrap">
                            {act.details}
                          </div>
                        )}
                      </div>

                      {/* Action Bar */}
                      <div className="mt-2 flex gap-1 ml-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); openDetail(act.id); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <Icons.Message size={14} />
                          {act.commentCount > 0 ? act.commentCount : 'Comment'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleLike(act.id, act.likes); }}
                          disabled={likingIds.has(act.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isLiked
                              ? 'text-rose-500 hover:text-rose-600 bg-rose-50 dark:bg-rose-900/20'
                              : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <Icons.Heart size={14} className={isLiked ? 'fill-current' : ''} />
                          {act.likes.length > 0 ? act.likes.length : 'Like'}
                        </button>
                        {isOwn && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(act.id); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Icons.Trash size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!loading && Object.keys(groupedActivities).length === 0 && (
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
      {selectedActivityId && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className={`absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeSidebar}
          />
          <div className={`absolute inset-y-0 right-0 max-w-lg w-full bg-white dark:bg-zinc-900 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
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
            <div ref={sidebarContentRef} className="flex-1 overflow-y-auto p-6 space-y-6">
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
                    disabled={!isReady}
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
                    disabled={isReplying || !replyText.trim() || !isReady}
                    className="absolute right-1.5 top-1 p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-30 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {isReplying ? <Icons.Loader size={18} className="animate-spin" /> : <Icons.Send size={18} />}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

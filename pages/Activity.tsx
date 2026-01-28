import React, { useState, useMemo, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { ActivityLog, ActivityType } from '../types';
import { useSupabase } from '../hooks/useSupabase';
import { useAuth } from '../hooks/useAuth';
import { useRBAC } from '../context/RBACContext';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabase';

export const Activity: React.FC = () => {
  const { user: authUser } = useAuth();
  const { user: profileUser, isLoading: profileLoading } = useRBAC();
  const { currentTenant, isLoading: tenantLoading } = useTenant();
  const { data: rawActivities, loading, error, refresh } = useSupabase<any>('activity_logs');

  const [activeTab, setActiveTab] = useState<'All Activity' | 'My Updates' | 'Comments' | 'Files'>('All Activity');
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Sidebar state
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  const effectiveUser = useMemo(() => {
    if (profileUser) {
      return {
        id: profileUser.id,
        name: profileUser.name,
        email: profileUser.email,
      };
    }

    if (!authUser) {
      return null;
    }

    const fallbackName =
      authUser.user_metadata?.full_name ||
      authUser.user_metadata?.name ||
      authUser.email?.split('@')[0] ||
      null;

    return {
      id: authUser.id,
      name: fallbackName,
      email: authUser.email ?? '',
    };
  }, [profileUser, authUser]);

  useEffect(() => {
    console.log('[Activity DEBUG] User:', effectiveUser?.id);
    console.log('[Activity DEBUG] CurrentTenant:', currentTenant?.id);
    console.log('[Activity DEBUG] TenantLoading:', tenantLoading);
    console.log('[Activity DEBUG] ProfileLoading:', profileLoading);
  }, [effectiveUser, currentTenant, tenantLoading, profileLoading]);

  // Stats (calculated from raw data for demo purposes, usually would be separate queries)
  const stats = useMemo(() => {
    if (!rawActivities) return { tasks: 0, threads: 0 };
    return {
      tasks: rawActivities.filter((a: any) => a.type === 'task_completed').length,
      threads: rawActivities.filter((a: any) => a.type === 'comment').length
    };
  }, [rawActivities]);

  // Transform and Group Activities
  const groupedActivities = useMemo(() => {
    if (!rawActivities) return {};

    // Sort by Date Desc
    const sorted = rawActivities
      .filter((a: any) => !a.parent_id) // ONLY TOP-LEVEL POSTS IN MAIN FEED
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((a: any) => ({
        id: a.id,
        userName: a.user_name || 'Team Member',
        userId: a.user_id,
        userAvatar: a.user_avatar,
        action: a.action,
        // Logic to determine action text based on type if action is generic
        displayAction: a.type === 'comment' ? 'commented on' : (a.action || 'updated'),
        target: a.target || 'General',
        projectTitle: a.project_title,
        type: a.type as ActivityType,
        details: a.details?.content || a.details,
        timestamp: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dateKey: new Date(a.created_at).toDateString() === new Date().toDateString() ? 'TODAY' : new Date(a.created_at).toLocaleDateString()
      }));

    // Group
    const groups: Record<string, typeof sorted> = {};
    sorted.forEach((act: any) => {
      if (!groups[act.dateKey]) groups[act.dateKey] = [];
      groups[act.dateKey].push(act);
    });

    return groups;
  }, [rawActivities]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostError(null);

    if (!newPost.trim()) return;

    if (tenantLoading || profileLoading) {
      setPostError('Loading your profile. Please wait a moment...');
      return;
    }

    if (!effectiveUser) {
      setPostError("You must be logged in to post.");
      return;
    }

    if (!currentTenant) {
      console.error("[Activity] Cannot post: No current tenant.");
      setPostError("System is initializing. Please wait a moment...");
      // Optionally trigger a refresh if tenant context exposes one
      return;
    }

    setPosting(true);
    try {
      const { data, error: insertError } = await supabase
        .from('activity_logs')
        .insert({
          user_id: effectiveUser.id,
          tenant_id: currentTenant.id,
          action: 'posted update',
          target: 'Team Feed', // Generic target for status updates
          entity_type: 'status',
          type: 'comment',
          details: { content: newPost },
          metadata: { user_name: effectiveUser.name || effectiveUser.email }
        });

      if (insertError) throw insertError;

      console.log('[Activity] Post success:', data);
      await refresh(); // Refresh the feed immediately
      setNewPost('');
    } catch (err: any) {
      console.error('Error posting activity:', err);
      setPostError(err.message || "Failed to post update.");
    } finally {
      setPosting(false);
    }
  };

  const selectedActivity = useMemo(() => {
    if (!selectedActivityId || !rawActivities) return null;
    return rawActivities.find((a: any) => a.id === selectedActivityId);
  }, [selectedActivityId, rawActivities]);

  const comments = useMemo(() => {
    if (!selectedActivityId || !rawActivities) return [];
    return rawActivities
      .filter((a: any) => a.parent_id === selectedActivityId)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [selectedActivityId, rawActivities]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !effectiveUser || !currentTenant || !selectedActivityId) return;

    setIsReplying(true);
    try {
      const { error: insertError } = await supabase
        .from('activity_logs')
        .insert({
          user_id: effectiveUser.id,
          tenant_id: currentTenant.id,
          parent_id: selectedActivityId,
          action: 'replied',
          target: selectedActivity?.target || 'Activity',
          entity_type: 'comment',
          type: 'comment',
          details: { content: replyText },
          user_name: effectiveUser.name || effectiveUser.email,
          user_avatar: effectiveUser.name?.substring(0, 2).toUpperCase() || 'U'
        });

      if (insertError) throw insertError;
      setReplyText('');
      await refresh();
    } catch (err: any) {
      console.error('Error replying:', err);
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8 font-sans">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Activity Feed</h1>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
            <Icons.Calendar size={14} /> All Time
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300">
            <Icons.Filter size={14} /> Filter
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Completed Tasks */}
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

        {/* Velocity */}
        <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 p-5 rounded-2xl flex flex-col justify-between h-32">
          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-400 mb-1">
            <Icons.Zap size={18} />
            <span className="text-xs font-bold tracking-wider uppercase">VELOCITY</span>
          </div>
          <div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">+24%</div>
            <div className="text-sm text-zinc-500 mt-1">Vs last week</div>
          </div>
        </div>

        {/* Discussions */}
        <div className="bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30 p-5 rounded-2xl flex flex-col justify-between h-32">
          <div className="flex items-center gap-2 text-purple-800 dark:text-purple-400 mb-1">
            <Icons.Message size={18} />
            <span className="text-xs font-bold tracking-wider uppercase">DISCUSSIONS</span>
          </div>
          <div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.threads} Threads</div>
            <div className="text-sm text-zinc-500 mt-1">Most active: <span className="font-medium text-zinc-700 dark:text-zinc-300">General</span></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-8">
          {['All Activity', 'My Updates', 'Comments', 'Files'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === tab
                ? 'text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                }`}
            >
              {tab}
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
          <div className="h-10 w-10 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
            ME
          </div>
          <div className="flex-1">
            <textarea
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder="What's on your mind? Share an update..."
              className="w-full bg-transparent border-none focus:ring-0 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none text-base p-0 min-h-[60px]"
            />
            <div className="flex justify-between items-center pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-2">
              <div className="flex gap-4 text-zinc-400">
                <button className="hover:text-zinc-600 dark:hover:text-zinc-200"><Icons.Paperclip size={18} /></button>
                <button className="hover:text-zinc-600 dark:hover:text-zinc-200"><Icons.Image size={18} /></button>
                <button className="hover:text-zinc-600 dark:hover:text-zinc-200"><Icons.Docs size={18} /></button>
              </div>
              <button
                onClick={handlePost}
                disabled={posting || !newPost.trim()}
                className="bg-zinc-600 hover:bg-zinc-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {posting ? 'Posting...' : 'Post Update'}
              </button>
            </div>
            {postError && (
              <div className="mt-2 text-xs text-red-500 font-medium">
                {postError}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Feed */}
      <div className="space-y-8">
        {Object.entries(groupedActivities).map(([date, items]) => (
          <div key={date} className="relative">
            {/* Date Label */}
            <div className="uppercase text-xs font-bold text-zinc-400 tracking-wider mb-6 pl-14">
              • {date}
            </div>

            <div className="space-y-8">
              {(items as any[]).map((act: any) => (
                <div key={act.id} className="flex gap-4 group">
                  {/* Avatar Column */}
                  <div className="w-10 flex flex-col items-center">
                    <div className="h-10 w-10 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-600 z-10">
                      {act.userName.substring(0, 2).toUpperCase()}
                    </div>
                    {/* Dotted Line */}
                    <div className="w-px h-full bg-zinc-200 dark:bg-zinc-800 border-l border-dotted border-zinc-300 -mt-2 -mb-8 group-last:hidden" />
                  </div>

                  {/* Content */}
                  <div
                    className="flex-1 pb-2 cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 rounded-lg p-2 transition-colors -m-2"
                    onClick={() => setSelectedActivityId(act.id)}
                  >
                    <div className="flex justify-between items-start">
                      <p className="text-sm text-zinc-900 dark:text-zinc-100 leading-relaxed">
                        <span className="font-semibold">{act.userName}</span> {act.displayAction} <span className="font-semibold">{act.target}</span>
                      </p>
                      <span className="text-xs text-zinc-400 whitespace-nowrap ml-4">{act.timestamp}</span>
                    </div>

                    {/* Project Tag */}
                    {act.projectTitle && (
                      <div className="mt-2 text-xs flex items-center gap-1.5 text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 px-2.5 py-1 rounded w-fit border border-zinc-200/50">
                        <Icons.Grid size={12} className="text-zinc-400" />
                        {act.projectTitle}
                      </div>
                    )}

                    {/* Comment/Details */}
                    {act.details && (
                      <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300 italic pl-4 border-l-2 border-zinc-200 dark:border-zinc-700 py-1">
                        "{typeof act.details === 'string' ? act.details : JSON.stringify(act.details)}"
                      </div>
                    )}

                    <div className="mt-3 flex gap-4 text-xs font-medium text-zinc-400">
                      <button className="flex items-center gap-1.5 hover:text-zinc-600 dark:hover:text-zinc-300">
                        <Icons.Message size={14} />
                        Comment
                      </button>
                      <button className="flex items-center gap-1.5 hover:text-zinc-600 dark:hover:text-zinc-300">
                        <Icons.Star size={14} />
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!loading && Object.keys(groupedActivities).length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 opacity-50">
            <Icons.Activity size={48} className="text-zinc-300 mb-4" />
            <p className="text-zinc-500">No updates yet. Be the first to post!</p>
          </div>
        )}
      </div>

      {/* Activity Details Sidebar */}
      {selectedActivityId && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedActivityId(null)}
          />
          <div className="absolute inset-y-0 right-0 max-w-lg w-full bg-white dark:bg-zinc-900 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Icons.Activity size={18} className="text-zinc-400" />
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Activity Details</h2>
              </div>
              <button
                onClick={() => setSelectedActivityId(null)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <Icons.X size={20} className="text-zinc-400" />
              </button>
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {selectedActivity && (
                <div className="space-y-6">
                  {/* Original Activity Info */}
                  <div className="flex gap-4">
                    <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-600 dark:text-zinc-300">
                      {(selectedActivity.user_name || 'U').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">{selectedActivity.user_name}</div>
                      <div className="text-xs text-zinc-500">{new Date(selectedActivity.created_at).toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Original Content Card */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl p-6 border border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="px-2 py-0.5 rounded bg-white dark:bg-zinc-900 text-[10px] font-bold text-zinc-400 border border-zinc-100 dark:border-zinc-800 tracking-wider">COMMENT</span>
                      <span className="text-xs text-zinc-500">in <span className="font-semibold text-zinc-700 dark:text-zinc-300">{selectedActivity.target}</span></span>
                    </div>
                    <div className="text-sm text-zinc-900 dark:text-zinc-100 leading-relaxed font-semibold mb-6">
                      {selectedActivity.action} on <span className="text-blue-500">{selectedActivity.target}</span>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-100 dark:border-zinc-800 text-sm text-zinc-600 dark:text-zinc-400 italic">
                      "{selectedActivity.details?.content || selectedActivity.details}"
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button className="flex-1 bg-zinc-900 dark:bg-white dark:text-zinc-900 text-white py-2.5 rounded-xl text-sm font-bold shadow-sm hover:opacity-90 transition-opacity">
                      Open Context
                    </button>
                    <button className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                      <Icons.Link size={20} />
                    </button>
                  </div>

                  {/* Comments/Replies List */}
                  <div className="pt-8 space-y-6">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">COMMENTS</h3>
                    <div className="space-y-6">
                      {comments.map((comment: any) => (
                        <div key={comment.id} className="flex gap-4">
                          <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-[10px] text-zinc-600 dark:text-zinc-300 shrink-0">
                            {(comment.user_name || 'U').substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800">
                            <div className="flex justify-between mb-1">
                              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{comment.user_name}</div>
                              <div className="text-[10px] text-zinc-400">{new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            <div className="text-sm text-zinc-600 dark:text-zinc-400">
                              {comment.details?.content || comment.details}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Input */}
            <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <form onSubmit={handleReply} className="relative">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Reply or add a note..."
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 rounded-xl pl-4 pr-12 py-3 text-sm focus:ring-0 focus:border-zinc-300 dark:focus:border-zinc-600 transition-all"
                />
                <button
                  type="submit"
                  disabled={isReplying || !replyText.trim()}
                  className="absolute right-2 top-1.5 p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-30"
                >
                  <Icons.Send size={20} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

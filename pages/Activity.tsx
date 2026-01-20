import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { ActivityLog, ActivityType, PageView } from '../types';
import { useSupabase } from '../hooks/useSupabase';

export const Activity: React.FC = () => {
  // Use 'any' here as the raw Supabase response won't match ActivityLog interface yet
  const { data: rawActivities, loading, error } = useSupabase<any>('activity_logs');
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [pageFilter, setPageFilter] = useState<PageView | 'all'>('all');

  const activities: ActivityLog[] = useMemo(() => {
    if (!rawActivities) return [];
    return rawActivities.map(a => ({
      id: a.id,
      userName: a.user_name || 'System',
      userId: a.owner_id || '', // No hay userId en la tabla, usamos owner_id
      userAvatar: a.user_avatar || 'SYS',
      action: a.action,
      target: a.target,
      projectTitle: a.project_title,
      type: a.type as ActivityType,
      details: a.details,
      timestamp: new Date(a.created_at).toLocaleString(), // Format timestamp
    }));
  }, [rawActivities]);

  const filtered = useMemo(() => {
    return activities.filter(a => {
      if (filter !== 'all' && a.type !== filter) return false;
      if (pageFilter !== 'all' && a.projectTitle?.toLowerCase().includes(pageFilter.toLowerCase())) return false;
      return true;
    });
  }, [activities, filter, pageFilter]);

  const getIcon = (type: ActivityType) => {
    switch (type) {
      case 'task_completed': return <Icons.Check size={16} className="text-emerald-500" />;
      case 'comment': return <Icons.Message size={16} className="text-blue-500" />;
      case 'project_created': return <Icons.Folder size={16} className="text-purple-500" />;
      case 'file_uploaded': return <Icons.Upload size={16} className="text-orange-500" />;
      case 'status_change': return <Icons.History size={16} className="text-indigo-500" />;
      default: return <Icons.Activity size={16} className="text-zinc-400" />;
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 dark:border-zinc-100"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg text-red-700 dark:text-red-400">
          Error loading activity: {error}
          <p className="text-xs mt-2">Make sure to run the migration for 'activity_logs'.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Activity</h1>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as ActivityType | 'all')}
            className="px-3 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
          >
            <option value="all">All Types</option>
            <option value="task_completed">Tasks</option>
            <option value="comment">Comments</option>
            <option value="project_created">Projects</option>
            <option value="file_uploaded">Files</option>
            <option value="status_change">Status</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {activities.length === 0 && (
          <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
            No activity recorded yet.
          </div>
        )}
        {filtered.map(act => (
          <Card key={act.id} className="flex items-start gap-4 p-4">
            <div className="mt-1">{getIcon(act.type)}</div>
            <div className="flex-1">
              <p className="text-sm text-zinc-900 dark:text-zinc-100">
                <span className="font-semibold">{act.userName}</span> {act.action} <span className="font-semibold">{act.target}</span>
                {act.projectTitle && <span className="text-zinc-500"> in <span className="font-medium">{act.projectTitle}</span></span>}
              </p>
              {act.details && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 italic">“{act.details}”</p>}
              <p className="text-xs text-zinc-400 mt-2">{act.timestamp}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

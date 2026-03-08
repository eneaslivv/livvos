import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Icons } from '../ui/Icons';
import { useTaskComments, TaskComment } from '../../hooks/useTaskComments';
import { useAuth } from '../../hooks/useAuth';

interface TaskCommentsSectionProps {
  taskId: string;
  taskTitle?: string;
  taskOwnerId?: string;
  taskAssigneeId?: string;
}

const formatTime = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const getDateLabel = (dateStr: string): string => {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const groupByDate = (comments: TaskComment[]): Map<string, TaskComment[]> => {
  const groups = new Map<string, TaskComment[]>();
  for (const c of comments) {
    const key = new Date(c.created_at).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  return groups;
};

export const TaskCommentsSection: React.FC<TaskCommentsSectionProps> = ({ taskId, taskTitle, taskOwnerId, taskAssigneeId }) => {
  const { user } = useAuth();
  const taskInfo = useMemo(() => taskTitle ? { title: taskTitle, owner_id: taskOwnerId, assignee_id: taskAssigneeId } : undefined, [taskTitle, taskOwnerId, taskAssigneeId]);
  const { comments, loading, addComment } = useTaskComments(taskId, taskInfo);
  const [activeTab, setActiveTab] = useState<'internal' | 'client'>('internal');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredComments = useMemo(
    () => comments.filter(c => activeTab === 'internal' ? c.is_internal : !c.is_internal),
    [comments, activeTab]
  );

  const internalCount = useMemo(() => comments.filter(c => c.is_internal).length, [comments]);
  const clientCount = useMemo(() => comments.filter(c => !c.is_internal).length, [comments]);

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredComments.length]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    const text = inputText;
    setInputText('');
    setSending(true);
    try {
      await addComment(text, activeTab === 'internal');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const dateGroups = groupByDate(filteredComments);

  return (
    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
      {/* Header + tabs */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Icons.Message size={12} className="text-zinc-400" />
          <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">Comments</span>
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab('internal')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
              activeTab === 'internal'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            Internal{internalCount > 0 ? ` (${internalCount})` : ''}
          </button>
          <button
            onClick={() => setActiveTab('client')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
              activeTab === 'client'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            Client{clientCount > 0 ? ` (${clientCount})` : ''}
          </button>
        </div>
      </div>

      {/* Comments list */}
      <div
        ref={scrollRef}
        className="max-h-52 overflow-y-auto space-y-1 mb-2 scroll-smooth"
      >
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
          </div>
        ) : filteredComments.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-zinc-400">
            <Icons.Message size={20} className="mb-1.5 opacity-40" />
            <span className="text-[11px]">No {activeTab} comments yet</span>
          </div>
        ) : (
          Array.from(dateGroups.entries()).map(([dateKey, dayComments]) => (
            <div key={dateKey}>
              {/* Date separator */}
              <div className="flex items-center gap-2 py-1.5">
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500">
                  {getDateLabel(dayComments[0].created_at)}
                </span>
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
              </div>
              {/* Comments for this date */}
              {dayComments.map(comment => {
                const isMe = comment.user_id === user?.id;
                return (
                  <div key={comment.id} className={`flex gap-2 py-1.5 px-1 rounded-lg ${
                    comment.id.startsWith('temp-') ? 'opacity-60' : ''
                  }`}>
                    {/* Avatar */}
                    {comment.user_avatar_url ? (
                      <img src={comment.user_avatar_url} alt="" className="w-6 h-6 rounded-full shrink-0 mt-0.5" />
                    ) : (
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold ${
                        isMe
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                      }`}>
                        {(comment.user_name || '?')[0]?.toUpperCase()}
                      </div>
                    )}
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                          {isMe ? 'You' : (comment.user_name || 'Unknown')}
                        </span>
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
                          {formatTime(comment.created_at)}
                        </span>
                      </div>
                      <p className={`text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 whitespace-pre-wrap break-words ${
                        activeTab === 'client' ? 'bg-blue-50/50 dark:bg-blue-900/10 rounded px-1.5 py-1 -mx-1.5' : ''
                      }`}>
                        {comment.comment}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          placeholder={activeTab === 'client' ? 'Write a client-visible comment...' : 'Write an internal comment...'}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`flex-1 px-3 py-1.5 border rounded-lg outline-none text-xs transition-all ${
            activeTab === 'client'
              ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 focus:border-blue-400 placeholder:text-blue-300 dark:placeholder:text-blue-700'
              : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 focus:border-blue-400 placeholder:text-zinc-400'
          } text-zinc-700 dark:text-zinc-300`}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || sending}
          className="px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-[10px] font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-30 transition-all"
        >
          {sending ? (
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Icons.Send size={12} />
          )}
        </button>
      </div>
    </div>
  );
};

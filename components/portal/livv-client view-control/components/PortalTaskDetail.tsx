import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Calendar, Flag, Clock, Send, MessageSquare } from 'lucide-react';
import { PortalTask } from '../types';
import { useTaskComments, TaskComment } from '../../../../hooks/useTaskComments';
import { useAuth } from '../../../../hooks/useAuth';

const priorityLabel: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40' },
  high: { label: 'High', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  medium: { label: 'Medium', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
  low: { label: 'Low', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

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

interface PortalTaskDetailProps {
  task: PortalTask | null;
  onClose: () => void;
}

const PortalTaskDetail: React.FC<PortalTaskDetailProps> = ({ task, onClose }) => {
  const { user } = useAuth();
  const { comments, loading: commentsLoading, addComment } = useTaskComments(task?.id || null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Only show client-visible comments in the portal
  const clientComments = useMemo(
    () => comments.filter(c => !c.is_internal),
    [comments]
  );

  const dateGroups = groupByDate(clientComments);

  // Auto-scroll on new comments
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [clientComments.length]);

  // Reset input when task changes
  useEffect(() => { setInputText(''); }, [task?.id]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (task) {
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [task, onClose]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    const text = inputText;
    setInputText('');
    setSending(true);
    try {
      await addComment(text, false); // always client-visible
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

  const isOverdue = task?.dueDate && !task.completed && new Date(task.dueDate) < new Date(new Date().toISOString().slice(0, 10));
  const priority = task?.priority ? priorityLabel[task.priority] : null;

  return (
    <AnimatePresence>
      {task && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 bg-zinc-900/20 dark:bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <div className="absolute inset-y-0 right-0 flex">
            <motion.div
              ref={panelRef}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-screen max-w-md h-full bg-white dark:bg-zinc-900 shadow-[-20px_0_40px_-5px_rgba(0,0,0,0.05)] dark:shadow-[-20px_0_40px_-5px_rgba(0,0,0,0.3)] border-l border-zinc-100 dark:border-zinc-800 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
                <div className="flex items-start gap-3 flex-1 min-w-0 pr-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    task.completed
                      ? 'bg-[#2C0405] border-[#2C0405] text-white'
                      : 'border-zinc-300 dark:border-zinc-600'
                  }`}>
                    {task.completed && <Check size={12} strokeWidth={3} />}
                  </div>
                  <div className="min-w-0">
                    <h2 className={`text-sm font-semibold leading-snug ${
                      task.completed ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'
                    }`}>
                      {task.title}
                    </h2>
                    {task.groupName && (
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{task.groupName}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Task details */}
              <div className="px-6 py-4 space-y-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
                {/* Status */}
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    task.completed
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}>
                    {task.completed ? (
                      <><Check size={10} strokeWidth={3} /> Completed</>
                    ) : (
                      <><Clock size={10} /> {task.status || 'In progress'}</>
                    )}
                  </span>
                  {priority && (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${priority.bg} ${priority.color}`}>
                      <Flag size={10} />
                      {priority.label}
                    </span>
                  )}
                </div>

                {/* Dates */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
                  {task.startDate && (
                    <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                      <Calendar size={11} />
                      <span>Start: {formatDate(task.startDate)}</span>
                    </div>
                  )}
                  {task.dueDate && (
                    <div className={`flex items-center gap-1.5 ${
                      isOverdue
                        ? 'text-red-500 dark:text-red-400 font-semibold'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}>
                      <Calendar size={11} />
                      <span>Due: {formatDate(task.dueDate)}</span>
                      {isOverdue && <span className="text-[9px] bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 rounded-full">Overdue</span>}
                    </div>
                  )}
                  {task.completed && task.completedAt && (
                    <div className="flex items-center gap-1.5 text-[#2C0405] dark:text-[#e8a0a2]">
                      <Check size={11} />
                      <span>Completed: {formatDate(task.completedAt)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Comments section */}
              <div className="flex-1 flex flex-col min-h-0 px-6 py-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <MessageSquare size={12} className="text-zinc-400" />
                  <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
                    Comments{clientComments.length > 0 ? ` (${clientComments.length})` : ''}
                  </span>
                </div>

                {/* Comments list */}
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto space-y-1 mb-3 scroll-smooth"
                >
                  {commentsLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                    </div>
                  ) : clientComments.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-zinc-400">
                      <MessageSquare size={24} className="mb-2 opacity-30" />
                      <span className="text-xs">No comments yet</span>
                      <span className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-1">Be the first to leave a comment</span>
                    </div>
                  ) : (
                    Array.from(dateGroups.entries()).map(([dateKey, dayComments]) => (
                      <div key={dateKey}>
                        {/* Date separator */}
                        <div className="flex items-center gap-2 py-2">
                          <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                          <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500">
                            {getDateLabel(dayComments[0].created_at)}
                          </span>
                          <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                        </div>
                        {dayComments.map(comment => {
                          const isMe = comment.user_id === user?.id;
                          return (
                            <div key={comment.id} className={`flex gap-2.5 py-2 px-1 rounded-lg ${
                              comment.id.startsWith('temp-') ? 'opacity-60' : ''
                            }`}>
                              {comment.user_avatar_url ? (
                                <img src={comment.user_avatar_url} alt="" className="w-7 h-7 rounded-full shrink-0 mt-0.5" />
                              ) : (
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${
                                  isMe
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                                }`}>
                                  {(comment.user_name || '?')[0]?.toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {isMe ? 'You' : (comment.user_name || 'Team')}
                                  </span>
                                  <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
                                    {formatTime(comment.created_at)}
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 whitespace-pre-wrap break-words">
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
                <div className="flex items-center gap-1.5 shrink-0 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <input
                    type="text"
                    placeholder="Write a comment..."
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none text-xs text-zinc-700 dark:text-zinc-300 focus:border-zinc-400 dark:focus:border-zinc-500 placeholder:text-zinc-400 transition-all"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending}
                    className="p-2 rounded-xl text-white disabled:opacity-30 transition-all hover:opacity-90"
                    style={{ backgroundColor: '#2C0405' }}
                  >
                    {sending ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PortalTaskDetail;

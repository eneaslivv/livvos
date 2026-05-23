import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InboxMessage {
  id: string;
  platform: 'gmail' | 'slack';
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  body_text: string | null;
  channel_name: string | null;
  channel_id?: string | null;
  thread_id?: string | null;
  received_at: string;
  status: string;
  ai_classification: {
    summary?: string;
    intent?: string;
    priority?: string;
    suggested_reply?: string;
    should_create_task?: boolean;
  } | null;
  matched_client_id?: string | null;
}

export interface InboxCardsProps {
  messages: InboxMessage[];
  /** Optional AI text summary to show above cards */
  aiSummary?: string;
}

// ---------------------------------------------------------------------------
// Motion presets — consistent spring physics across the component
// ---------------------------------------------------------------------------

const SPRING_SMOOTH = { type: 'spring' as const, stiffness: 400, damping: 30 };
const SPRING_GENTLE = { type: 'spring' as const, stiffness: 300, damping: 28 };
const STAGGER_CHILDREN = {
  animate: { transition: { staggerChildren: 0.04 } },
};
const FADE_UP = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};
const FADE_SCALE = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string | null): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function truncate(text: string | null, max: number): string {
  if (!text) return '';
  const clean = text.replace(/\n/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd() + '…';
}

interface MessageGroup {
  key: string;
  label: string;
  platform: 'gmail' | 'slack';
  messages: InboxMessage[];
}

function groupMessages(messages: InboxMessage[]): MessageGroup[] {
  const map = new Map<string, InboxMessage[]>();
  const orderKeys: string[] = [];

  for (const msg of messages) {
    let key: string;
    if (msg.platform === 'slack') {
      key = `slack:${msg.channel_name ?? 'direct'}`;
    } else {
      key = `gmail:${msg.subject ?? msg.from_email ?? msg.from_name ?? 'unknown'}`;
    }
    if (!map.has(key)) {
      map.set(key, []);
      orderKeys.push(key);
    }
    map.get(key)!.push(msg);
  }

  return orderKeys.map((key) => {
    const msgs = map.get(key)!;
    const platform = msgs[0].platform;
    let label: string;
    if (platform === 'slack') {
      const ch = msgs[0].channel_name ?? 'Direct message';
      label = `#${ch}`;
    } else {
      label = msgs[0].subject ?? msgs[0].from_name ?? msgs[0].from_email ?? 'No subject';
    }
    return { key, label, platform, messages: msgs };
  });
}

// ---------------------------------------------------------------------------
// Status badge — with subtle pulse for pending
// ---------------------------------------------------------------------------

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  pending: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    label: 'Pending',
  },
  done: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    label: 'Done',
  },
  replied: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    label: 'Replied',
  },
  task_created: {
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-700 dark:text-violet-300',
    label: 'Task',
  },
};

function StatusBadge({ status }: { status: string }) {
  const s = (status || 'pending').toLowerCase();
  const cfg = statusConfig[s] ?? {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-600 dark:text-zinc-400',
    label: status || 'Unknown',
  };
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING_SMOOTH}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${cfg.bg} ${cfg.text}`}
    >
      {s === 'pending' && (
        <motion.span
          className="mr-1 h-1 w-1 rounded-full bg-amber-500"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {cfg.label}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// Reply composer — with smooth entrance
// ---------------------------------------------------------------------------

function ReplyComposer({
  message,
  onClose,
  onSent,
}: {
  message: InboxMessage;
  onClose: () => void;
  onSent: (messageId: string) => void;
}) {
  const suggestedReply = message.ai_classification?.suggested_reply ?? '';
  const [body, setBody] = useState(suggestedReply);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSend = useCallback(async () => {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const { error: fnError } = await supabase.functions.invoke('comm-reply', {
        body: { message_id: message.id, body: body.trim() },
      });
      if (fnError) throw fnError;
      setSuccess(true);
      onSent(message.id);
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send reply');
    } finally {
      setSending(false);
    }
  }, [body, message.id, onClose, onSent]);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ ...SPRING_GENTLE, duration: 0.25 }}
      className="overflow-hidden"
    >
      <motion.div
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08, ...SPRING_GENTLE }}
        className="ml-9 mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/60"
      >
        {success ? (
          <motion.div
            {...FADE_SCALE}
            transition={SPRING_SMOOTH}
            className="flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400"
          >
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            >
              <Icons.Check className="h-4 w-4" />
            </motion.div>
            Reply sent successfully
          </motion.div>
        ) : (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              disabled={sending}
              placeholder="Write your reply…"
              className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200/60 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:ring-zinc-700/60 transition-shadow"
            />
            <AnimatePresence>
              {suggestedReply && body === suggestedReply && (
                <motion.p
                  {...FADE_UP}
                  transition={SPRING_SMOOTH}
                  className="mt-1 flex items-center gap-1 text-[10px] text-violet-500 dark:text-violet-400"
                >
                  <Icons.Sparkles className="h-3 w-3" />
                  AI-suggested reply — edit before sending
                </motion.p>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {error && (
                <motion.p
                  {...FADE_UP}
                  transition={SPRING_SMOOTH}
                  className="mt-1 flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400"
                >
                  <Icons.AlertCircle className="h-3 w-3" />
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="mt-2 flex items-center gap-2">
              <motion.button
                onClick={handleSend}
                disabled={sending || !body.trim()}
                whileTap={{ scale: 0.94 }}
                whileHover={{ scale: 1.02 }}
                transition={SPRING_SMOOTH}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {sending ? (
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  >
                    <Icons.Loader className="h-3 w-3" />
                  </motion.span>
                ) : (
                  <Icons.Send className="h-3 w-3" />
                )}
                {sending ? 'Sending…' : 'Send'}
              </motion.button>
              <motion.button
                onClick={onClose}
                disabled={sending}
                whileTap={{ scale: 0.94 }}
                transition={SPRING_SMOOTH}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                Cancel
              </motion.button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Message row — with hover lift + staggered entrance
// ---------------------------------------------------------------------------

function MessageRow({
  message,
  replyingId,
  setReplyingId,
  onSent,
  index,
}: {
  message: InboxMessage;
  replyingId: string | null;
  setReplyingId: (id: string | null) => void;
  onSent: (messageId: string) => void;
  index: number;
}) {
  const isReplying = replyingId === message.id;
  const hasDraft = !!message.ai_classification?.suggested_reply;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_GENTLE, delay: index * 0.03 }}
    >
      <motion.div
        whileHover={{ y: -1, backgroundColor: 'rgba(0,0,0,0.02)' }}
        transition={SPRING_SMOOTH}
        className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors"
      >
        {/* Avatar */}
        <motion.div
          whileHover={{ scale: 1.08 }}
          transition={SPRING_SMOOTH}
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            message.platform === 'slack'
              ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'
              : 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'
          }`}
        >
          {initials(message.from_name)}
        </motion.div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[12px] font-semibold text-zinc-800 dark:text-zinc-100">
              {message.from_name || message.from_email || 'Unknown'}
            </span>
            {message.platform === 'gmail' && message.subject && (
              <span className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                — {truncate(message.subject, 40)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {truncate(message.body_text, 80)}
          </p>
          {message.ai_classification?.summary && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="mt-0.5 text-[11px] italic text-zinc-400 dark:text-zinc-500"
            >
              {message.ai_classification.summary}
            </motion.p>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
            {relativeTime(message.received_at)}
          </span>
          <StatusBadge status={message.status} />
          <div className="flex items-center gap-1">
            {hasDraft && !isReplying && (
              <motion.span
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={SPRING_SMOOTH}
                className="flex items-center gap-0.5 text-[10px] text-violet-500 dark:text-violet-400"
              >
                <Icons.Sparkles className="h-3 w-3" />
                AI draft
              </motion.span>
            )}
            <motion.button
              onClick={() => setReplyingId(isReplying ? null : message.id)}
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.05 }}
              transition={SPRING_SMOOTH}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-zinc-400 opacity-0 transition-all hover:bg-zinc-100 hover:text-zinc-600 group-hover:opacity-100 max-sm:opacity-100 dark:text-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
            >
              {isReplying ? (
                <>
                  <Icons.X className="h-3 w-3" />
                  Close
                </>
              ) : (
                <>
                  <Icons.Send className="h-3 w-3" />
                  Reply
                </>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Inline reply composer */}
      <AnimatePresence>
        {isReplying && (
          <ReplyComposer
            message={message}
            onClose={() => setReplyingId(null)}
            onSent={onSent}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Group card — with staggered children + smooth collapse
// ---------------------------------------------------------------------------

function GroupCard({
  group,
  replyingId,
  setReplyingId,
  onSent,
  index,
}: {
  group: MessageGroup;
  replyingId: string | null;
  setReplyingId: (id: string | null) => void;
  onSent: (messageId: string) => void;
  index: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const PlatformIcon = group.platform === 'slack' ? Icons.Hash : Icons.Mail;
  const iconColor =
    group.platform === 'slack'
      ? 'text-violet-500 dark:text-violet-400'
      : 'text-rose-500 dark:text-rose-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING_GENTLE, delay: index * 0.06 }}
      className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-700/60 dark:bg-zinc-900/50 overflow-hidden"
    >
      {/* Header */}
      <motion.button
        onClick={() => setCollapsed((c) => !c)}
        whileTap={{ scale: 0.99 }}
        transition={SPRING_SMOOTH}
        className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors"
      >
        <motion.div
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={SPRING_SMOOTH}
        >
          <PlatformIcon className={`h-3.5 w-3.5 ${iconColor}`} />
        </motion.div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
          {group.label}
        </span>
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...SPRING_SMOOTH, delay: index * 0.06 + 0.1 }}
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-zinc-100 dark:bg-zinc-800 text-[9px] font-bold text-zinc-500 dark:text-zinc-400 tabular-nums"
        >
          {group.messages.length}
        </motion.span>
        <motion.div
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={SPRING_SMOOTH}
          className="ml-auto"
        >
          <Icons.ChevronDown className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
        </motion.div>
      </motion.button>

      {/* Messages */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ ...SPRING_GENTLE, duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-100 px-1 pb-2 pt-1 dark:border-zinc-800">
              {group.messages.map((msg, i) => (
                <MessageRow
                  key={msg.id}
                  message={msg}
                  replyingId={replyingId}
                  setReplyingId={setReplyingId}
                  onSent={onSent}
                  index={i}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Stats bar — animated pills
// ---------------------------------------------------------------------------

function StatsBar({ messages }: { messages: InboxMessage[] }) {
  const total = messages.length;
  const pending = messages.filter((m) => (m.status || '').toLowerCase() === 'pending').length;
  const slackCount = messages.filter((m) => m.platform === 'slack').length;
  const gmailCount = messages.filter((m) => m.platform === 'gmail').length;

  const pills: Array<{ key: string; icon: React.ReactNode; label: string; cls: string }> = [];
  if (pending > 0) pills.push({
    key: 'pending',
    icon: <Icons.Clock className="h-3 w-3" />,
    label: `${pending} pending`,
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  });
  if (slackCount > 0) pills.push({
    key: 'slack',
    icon: <Icons.Hash className="h-3 w-3" />,
    label: `${slackCount} Slack`,
    cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  });
  if (gmailCount > 0) pills.push({
    key: 'gmail',
    icon: <Icons.Mail className="h-3 w-3" />,
    label: `${gmailCount} Gmail`,
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.05 }}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 tabular-nums">
        {total} {total === 1 ? 'message' : 'messages'}
      </span>
      {pills.map((p, i) => (
        <motion.span
          key={p.key}
          initial={{ opacity: 0, scale: 0.8, x: -4 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ ...SPRING_SMOOTH, delay: 0.1 + i * 0.06 }}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${p.cls}`}
        >
          {p.icon}
          {p.label}
        </motion.span>
      ))}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const InboxCards: React.FC<InboxCardsProps> = ({ messages, aiSummary }) => {
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<InboxMessage[]>(messages);

  // Sync when parent passes new messages
  React.useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  const groups = useMemo(() => groupMessages(localMessages), [localMessages]);

  const handleSent = useCallback((messageId: string) => {
    setLocalMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, status: 'replied' } : m)),
    );
  }, []);

  if (!localMessages.length) {
    return (
      <motion.div
        {...FADE_SCALE}
        transition={SPRING_GENTLE}
        className="flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center dark:border-zinc-700/60 dark:bg-zinc-900/50"
      >
        <Icons.Inbox className="h-6 w-6 text-zinc-300 dark:text-zinc-600" />
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">No messages to show</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col gap-3"
    >
      {/* AI summary — soft entrance with glow */}
      {aiSummary && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...SPRING_GENTLE, delay: 0.02 }}
          className="flex items-start gap-2 rounded-xl bg-violet-50/80 px-3.5 py-3 dark:bg-violet-900/15 border border-violet-100/60 dark:border-violet-500/10"
        >
          <motion.div
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
          >
            <Icons.Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500 dark:text-violet-400" />
          </motion.div>
          <p className="text-[12px] leading-relaxed text-violet-700 dark:text-violet-300">
            {aiSummary}
          </p>
        </motion.div>
      )}

      {/* Stats */}
      <StatsBar messages={localMessages} />

      {/* Grouped cards */}
      <div className="flex max-h-[480px] flex-col gap-2 overflow-y-auto pr-1 overscroll-contain">
        {groups.map((group, i) => (
          <GroupCard
            key={group.key}
            group={group}
            replyingId={replyingId}
            setReplyingId={setReplyingId}
            onSent={handleSent}
            index={i}
          />
        ))}
      </div>
    </motion.div>
  );
};

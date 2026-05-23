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
  return clean.slice(0, max).trimEnd() + '...';
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
// Status badge
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
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[(status || 'pending').toLowerCase()] ?? {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-600 dark:text-zinc-400',
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reply composer
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
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="ml-9 mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/60">
        {success ? (
          <div className="flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400">
            <Icons.Check className="h-3.5 w-3.5" />
            Reply sent
          </div>
        ) : (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              disabled={sending}
              placeholder="Write your reply..."
              className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-500"
            />
            {suggestedReply && body === suggestedReply && (
              <p className="mt-1 flex items-center gap-1 text-[10px] text-violet-500 dark:text-violet-400">
                <Icons.Sparkles className="h-3 w-3" />
                AI-suggested reply
              </p>
            )}
            {error && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400">
                <Icons.AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={handleSend}
                disabled={sending || !body.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {sending ? (
                  <Icons.Loader className="h-3 w-3 animate-spin" />
                ) : (
                  <Icons.Send className="h-3 w-3" />
                )}
                {sending ? 'Sending...' : 'Send'}
              </button>
              <button
                onClick={onClose}
                disabled={sending}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Message row
// ---------------------------------------------------------------------------

function MessageRow({
  message,
  replyingId,
  setReplyingId,
  onSent,
}: {
  message: InboxMessage;
  replyingId: string | null;
  setReplyingId: (id: string | null) => void;
  onSent: (messageId: string) => void;
}) {
  const isReplying = replyingId === message.id;
  const hasDraft = !!message.ai_classification?.suggested_reply;

  return (
    <div>
      <div className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
        {/* Avatar */}
        <div
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            message.platform === 'slack'
              ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'
              : 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'
          }`}
        >
          {initials(message.from_name)}
        </div>

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
            <p className="mt-0.5 text-[11px] italic text-zinc-400 dark:text-zinc-500">
              {message.ai_classification.summary}
            </p>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
            {relativeTime(message.received_at)}
          </span>
          <StatusBadge status={message.status} />
          <div className="flex items-center gap-1">
            {hasDraft && !isReplying && (
              <span className="flex items-center gap-0.5 text-[10px] text-violet-500 dark:text-violet-400">
                <Icons.Sparkles className="h-3 w-3" />
                AI draft
              </span>
            )}
            <button
              onClick={() => setReplyingId(isReplying ? null : message.id)}
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
            </button>
          </div>
        </div>
      </div>

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group card
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
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700/60 dark:bg-zinc-900/50"
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-3 py-2.5"
      >
        <PlatformIcon className={`h-3.5 w-3.5 ${iconColor}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {group.label}
        </span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
          &middot; {group.messages.length} {group.messages.length === 1 ? 'message' : 'messages'}
        </span>
        <Icons.ChevronDown
          className={`ml-auto h-3.5 w-3.5 text-zinc-400 transition-transform dark:text-zinc-500 ${
            collapsed ? '-rotate-90' : ''
          }`}
        />
      </button>

      {/* Messages */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-100 px-1 pb-2 pt-1 dark:border-zinc-800">
              {group.messages.map((msg) => (
                <MessageRow
                  key={msg.id}
                  message={msg}
                  replyingId={replyingId}
                  setReplyingId={setReplyingId}
                  onSent={onSent}
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
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar({ messages }: { messages: InboxMessage[] }) {
  const total = messages.length;
  const pending = messages.filter((m) => (m.status || '').toLowerCase() === 'pending').length;
  const slackCount = messages.filter((m) => m.platform === 'slack').length;
  const gmailCount = messages.filter((m) => m.platform === 'gmail').length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
        {total} {total === 1 ? 'message' : 'messages'}
      </span>
      {pending > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <Icons.Clock className="h-3 w-3" />
          {pending} pending
        </span>
      )}
      {slackCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
          <Icons.Hash className="h-3 w-3" />
          {slackCount} Slack
        </span>
      )}
      {gmailCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          <Icons.Mail className="h-3 w-3" />
          {gmailCount} Gmail
        </span>
      )}
    </div>
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
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center dark:border-zinc-700/60 dark:bg-zinc-900/50"
      >
        <Icons.Inbox className="h-6 w-6 text-zinc-300 dark:text-zinc-600" />
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">No messages to show</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-3"
    >
      {/* AI summary */}
      {aiSummary && (
        <div className="flex items-start gap-2 rounded-lg bg-violet-50 px-3 py-2.5 dark:bg-violet-900/20">
          <Icons.Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500 dark:text-violet-400" />
          <p className="text-[12px] leading-relaxed text-violet-700 dark:text-violet-300">
            {aiSummary}
          </p>
        </div>
      )}

      {/* Stats */}
      <StatsBar messages={localMessages} />

      {/* Grouped cards */}
      <div className="flex max-h-[480px] flex-col gap-2 overflow-y-auto pr-1">
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

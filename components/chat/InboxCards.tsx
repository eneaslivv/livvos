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
// Motion presets
// ---------------------------------------------------------------------------

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 };
const SPRING_SOFT = { type: 'spring' as const, stiffness: 300, damping: 28 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { month: 'short', day: 'numeric' });
}

function initials(name: string | null): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Get the AI summary or a clean one-line preview of the body */
function getSummary(msg: InboxMessage): string {
  // AI summary is always preferred — it's the processed, human-readable version
  if (msg.ai_classification?.summary) return msg.ai_classification.summary;
  // Fallback: clean the raw body into a short preview
  if (msg.body_text) {
    const clean = msg.body_text
      .replace(/<@[A-Z0-9]+>/g, '') // remove Slack user mentions
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length > 100) return clean.slice(0, 97).trimEnd() + '…';
    return clean;
  }
  return 'Sin contenido';
}

/** Determine urgency from AI classification */
function getUrgency(msg: InboxMessage): 'urgent' | 'action' | 'info' {
  const p = msg.ai_classification?.priority?.toLowerCase();
  if (p === 'urgent' || p === 'high') return 'urgent';
  const intent = msg.ai_classification?.intent?.toLowerCase() || '';
  if (intent.includes('request') || intent.includes('question') || msg.ai_classification?.should_create_task) return 'action';
  return 'info';
}

const URGENCY_STYLES = {
  urgent: {
    dot: 'bg-rose-500',
    border: 'border-l-rose-400 dark:border-l-rose-500',
    bg: 'bg-rose-50/50 dark:bg-rose-500/5',
  },
  action: {
    dot: 'bg-amber-500',
    border: 'border-l-amber-400 dark:border-l-amber-500',
    bg: 'bg-amber-50/30 dark:bg-amber-500/5',
  },
  info: {
    dot: 'bg-zinc-300 dark:bg-zinc-600',
    border: 'border-l-transparent',
    bg: '',
  },
};

interface ChannelGroup {
  key: string;
  label: string;
  platform: 'gmail' | 'slack';
  messages: InboxMessage[];
  pendingCount: number;
  hasUrgent: boolean;
}

function groupByChannel(messages: InboxMessage[]): ChannelGroup[] {
  const map = new Map<string, InboxMessage[]>();
  const order: string[] = [];

  for (const msg of messages) {
    const key = msg.platform === 'slack'
      ? `slack:${msg.channel_name ?? 'dm'}`
      : `gmail:${msg.subject ?? msg.from_name ?? 'email'}`;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(msg);
  }

  return order.map(key => {
    const msgs = map.get(key)!;
    const platform = msgs[0].platform;
    let label: string;
    if (platform === 'slack') {
      const ch = msgs[0].channel_name ?? 'Direct';
      // Capitalize nicely: frenetic-pace → Frenetic Pace
      label = ch.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    } else {
      label = msgs[0].subject ?? msgs[0].from_name ?? 'Email';
    }
    const pendingCount = msgs.filter(m => (m.status || '').toLowerCase() === 'pending').length;
    const hasUrgent = msgs.some(m => getUrgency(m) === 'urgent');
    return { key, label, platform, messages: msgs, pendingCount, hasUrgent };
  })
    // Sort: channels with urgent messages first, then by pending count, then by message count
    .sort((a, b) => {
      if (a.hasUrgent !== b.hasUrgent) return a.hasUrgent ? -1 : 1;
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      return b.messages.length - a.messages.length;
    });
}

// ---------------------------------------------------------------------------
// Reply composer (compact)
// ---------------------------------------------------------------------------

function ReplyComposer({
  message,
  onClose,
  onSent,
}: {
  message: InboxMessage;
  onClose: () => void;
  onSent: (id: string) => void;
}) {
  const suggested = message.ai_classification?.suggested_reply ?? '';
  const [body, setBody] = useState(suggested);
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
      setTimeout(() => onClose(), 1000);
    } catch (err: any) {
      setError(err?.message ?? 'Error al enviar');
    } finally {
      setSending(false);
    }
  }, [body, message.id, onClose, onSent]);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ ...SPRING_SOFT, duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-700 dark:bg-zinc-800/60">
        {success ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400"
          >
            <Icons.Check className="h-3.5 w-3.5" /> Enviado
          </motion.div>
        ) : (
          <>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={2}
              disabled={sending}
              placeholder="Tu respuesta…"
              className="w-full resize-none rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 transition-shadow"
            />
            {suggested && body === suggested && (
              <p className="mt-1 flex items-center gap-1 text-[10px] text-violet-500">
                <Icons.Sparkles className="h-3 w-3" /> Sugerido por AI — editá antes de enviar
              </p>
            )}
            {error && (
              <p className="mt-1 text-[10px] text-red-500"><Icons.AlertCircle className="inline h-3 w-3 mr-0.5" />{error}</p>
            )}
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={handleSend}
                disabled={sending || !body.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1 text-[10px] font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {sending ? <Icons.Loader className="h-3 w-3 animate-spin" /> : <Icons.Send className="h-3 w-3" />}
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
              <button onClick={onClose} disabled={sending} className="text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Single message row — AI summary first, no raw body
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
  onSent: (id: string) => void;
  index: number;
}) {
  const isReplying = replyingId === message.id;
  const urgency = getUrgency(message);
  const styles = URGENCY_STYLES[urgency];
  const summary = getSummary(message);
  const isPending = (message.status || '').toLowerCase() === 'pending';
  const hasDraft = !!message.ai_classification?.suggested_reply;
  const sender = message.from_name || message.from_email?.split('@')[0] || '?';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_SOFT, delay: index * 0.025 }}
    >
      <div
        className={`group flex items-start gap-2.5 rounded-lg border-l-2 px-2.5 py-2 transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 ${styles.border} ${styles.bg}`}
      >
        {/* Avatar */}
        <div
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            message.platform === 'slack'
              ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'
              : 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
          }`}
        >
          {initials(message.from_name)}
        </div>

        {/* Content — AI summary is the star */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {/* Urgency dot */}
            {urgency !== 'info' && (
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />
            )}
            <span className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-100 truncate">
              {sender}
            </span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums shrink-0">
              {relativeTime(message.received_at)}
            </span>
            {isPending && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                pendiente
              </span>
            )}
          </div>

          {/* THE summary — this is what matters */}
          <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            {summary}
          </p>

          {/* Intent tag + actions */}
          <div className="mt-1 flex items-center gap-2">
            {message.ai_classification?.intent && (
              <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {message.ai_classification.intent.replace(/_/g, ' ')}
              </span>
            )}
            {message.ai_classification?.should_create_task && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-violet-500 dark:text-violet-400">
                <Icons.CheckSquare className="h-3 w-3" /> crear tarea
              </span>
            )}
            {hasDraft && !isReplying && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-violet-500 dark:text-violet-400">
                <Icons.Sparkles className="h-3 w-3" /> AI draft
              </span>
            )}
            <button
              onClick={() => setReplyingId(isReplying ? null : message.id)}
              className="ml-auto text-[10px] font-medium text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all max-sm:opacity-100"
            >
              {isReplying ? '✕ cerrar' : '↩ reply'}
            </button>
          </div>
        </div>
      </div>

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
// Channel group card
// ---------------------------------------------------------------------------

function ChannelCard({
  group,
  replyingId,
  setReplyingId,
  onSent,
  index,
}: {
  group: ChannelGroup;
  replyingId: string | null;
  setReplyingId: (id: string | null) => void;
  onSent: (id: string) => void;
  index: number;
}) {
  const [collapsed, setCollapsed] = useState(index > 2); // auto-collapse after 3rd group
  const Icon = group.platform === 'slack' ? Icons.Hash : Icons.Mail;
  const iconCls = group.platform === 'slack'
    ? 'text-violet-500 dark:text-violet-400'
    : 'text-blue-500 dark:text-blue-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_SOFT, delay: index * 0.05 }}
      className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-700/50 dark:bg-zinc-900/40 overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/20 transition-colors"
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconCls}`} />
        <span className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-200 truncate">
          {group.label}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
          {group.messages.length}
        </span>
        {group.pendingCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-amber-100 dark:bg-amber-900/30 text-[9px] font-bold text-amber-700 dark:text-amber-300 tabular-nums">
            {group.pendingCount}
          </span>
        )}
        {group.hasUrgent && (
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
        )}
        <motion.div
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={SPRING}
          className="ml-auto shrink-0"
        >
          <Icons.ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
        </motion.div>
      </button>

      {/* Messages */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ ...SPRING_SOFT, duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-100 dark:border-zinc-800 px-1 pb-1.5 pt-1 space-y-0.5">
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
// Stats strip — compact pills
// ---------------------------------------------------------------------------

function StatsStrip({ messages }: { messages: InboxMessage[] }) {
  const total = messages.length;
  const pending = messages.filter(m => (m.status || '').toLowerCase() === 'pending').length;
  const urgent = messages.filter(m => getUrgency(m) === 'urgent').length;
  const actionNeeded = messages.filter(m => getUrgency(m) === 'action').length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 tabular-nums">
        {total} mensajes
      </span>
      {urgent > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          <span className="w-1 h-1 rounded-full bg-rose-500" />
          {urgent} urgentes
        </span>
      )}
      {pending > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          {pending} pendientes
        </span>
      )}
      {actionNeeded > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
          {actionNeeded} requieren acción
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

  React.useEffect(() => { setLocalMessages(messages); }, [messages]);

  const groups = useMemo(() => groupByChannel(localMessages), [localMessages]);

  const handleSent = useCallback((messageId: string) => {
    setLocalMessages(prev =>
      prev.map(m => m.id === messageId ? { ...m, status: 'replied' } : m),
    );
  }, []);

  if (!localMessages.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center dark:border-zinc-700/60 dark:bg-zinc-900/50">
        <Icons.Inbox className="h-5 w-5 text-zinc-300 dark:text-zinc-600" />
        <p className="text-[12px] text-zinc-500">No hay mensajes</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* AI digest summary — the Markdown text from the agent */}
      {aiSummary && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_SOFT}
          className="flex items-start gap-2 rounded-xl bg-gradient-to-br from-violet-50/80 to-indigo-50/40 px-3 py-2.5 dark:from-violet-900/10 dark:to-indigo-900/5 border border-violet-100/50 dark:border-violet-500/10"
        >
          <Icons.Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500 dark:text-violet-400" />
          <p className="text-[12px] leading-relaxed text-violet-700 dark:text-violet-300">
            {aiSummary}
          </p>
        </motion.div>
      )}

      {/* Stats */}
      <StatsStrip messages={localMessages} />

      {/* Channel groups */}
      <div className="flex max-h-[480px] flex-col gap-2 overflow-y-auto pr-0.5 overscroll-contain">
        {groups.map((group, i) => (
          <ChannelCard
            key={group.key}
            group={group}
            replyingId={replyingId}
            setReplyingId={setReplyingId}
            onSent={handleSent}
            index={i}
          />
        ))}
      </div>
    </div>
  );
};

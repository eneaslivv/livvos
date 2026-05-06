/**
 * Communications Hub — unified Gmail + Slack inbox.
 *
 * Two tabs:
 *   - Inbox: list (left) + detail panel (right)
 *   - Settings: connect/disconnect Gmail accounts + Slack workspaces, pick
 *     channels to monitor, manual sync trigger
 *
 * The page reads from `communication_messages` directly via Supabase
 * (RLS scopes by tenant_id). Sending replies routes through the
 * comm-reply edge function. OAuth flows go through gmail-connect /
 * slack-connect edge functions.
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Icons } from '../components/ui/Icons';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useSupabase } from '../hooks/useSupabase';
import { supabase } from '../lib/supabase';
import { errorLogger } from '../lib/errorLogger';
import {
  INTENT_LABELS, STATUS_LABELS,
  type CommunicationMessage, type IntegrationToken,
  type SlackMonitoredChannel, type AIClassification,
  type MessageStatus,
} from '../types/communications';
import {
  getGmailConnectUrl, syncGmail, htmlToText, previewFromBody,
} from '../lib/communications/gmail';
import {
  getSlackConnectUrl, listAvailableSlackChannels, setMonitoredChannels,
  slackTextToPreview, type AvailableSlackChannel,
} from '../lib/communications/slack';

type Tab = 'inbox' | 'settings';
type Filter = 'all' | 'pending' | 'high' | 'gmail' | 'slack';

// ────────────────────────────────────────────────────────────────────────
//  ROOT PAGE
// ────────────────────────────────────────────────────────────────────────
export const Communications: React.FC = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantReady = !!currentTenant?.id;

  // Connect-flow status banner — read on mount from ?connect=… (set by the
  // OAuth callback edge functions when they redirect back).
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const connect = url.searchParams.get('connect');
      const detail = url.searchParams.get('detail');
      if (!connect) return;
      if (connect.endsWith('_success')) {
        setBanner({ kind: 'success', text: `Conectado: ${detail || ''}`.trim() });
      } else if (connect.endsWith('_error')) {
        setBanner({ kind: 'error', text: `No se pudo conectar — ${detail || 'error desconocido'}` });
      }
      url.searchParams.delete('connect');
      url.searchParams.delete('detail');
      window.history.replaceState({}, '', url.toString());
      const t = setTimeout(() => setBanner(null), 6000);
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, []);

  const [tab, setTab] = useState<Tab>('inbox');

  // ── Data sources ────────────────────────────────────────────────
  const { data: messages, loading: msgsLoading, refresh: refreshMessages } = useSupabase<CommunicationMessage>(
    'communication_messages',
    { enabled: tenantReady, subscribe: true, select: '*' }
  );
  const { data: tokens, refresh: refreshTokens } = useSupabase<IntegrationToken>(
    'integration_tokens',
    { enabled: tenantReady, subscribe: true, select: '*' }
  );
  const { data: monitoredChannels, refresh: refreshChannels } = useSupabase<SlackMonitoredChannel>(
    'slack_monitored_channels',
    { enabled: tenantReady, subscribe: true, select: '*' }
  );

  if (!user || !tenantReady) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">
        Cargando…
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto pt-4 pb-16 space-y-4 animate-in fade-in duration-300">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800/60">
        <div>
          <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-semibold uppercase tracking-[0.15em] mb-1">
            <div className="w-1 h-1 rounded-full bg-amber-500" />
            Communications Hub
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Inbox</h1>
          <p className="text-zinc-400 text-xs mt-0.5">
            {(messages || []).filter(m => m.status === 'pending').length} pendientes ·{' '}
            {(tokens || []).filter(t => t.platform === 'gmail').length} Gmail ·{' '}
            {(tokens || []).filter(t => t.platform === 'slack').length} Slack
          </p>
        </div>
        <div className="flex gap-1 p-0.5 bg-zinc-100/60 dark:bg-zinc-900/60 rounded-lg">
          {(['inbox', 'settings'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === t
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              {t === 'inbox' ? 'Inbox' : 'Settings'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Connection banner ─── */}
      {banner && (
        <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
          banner.kind === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50'
            : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200/50'
        }`}>
          {banner.kind === 'success' ? <Icons.CheckCircle size={14} /> : <Icons.AlertCircle size={14} />}
          {banner.text}
        </div>
      )}

      {/* ─── Tab content ─── */}
      {tab === 'inbox' ? (
        <InboxView
          messages={messages || []}
          loading={msgsLoading}
          tokens={tokens || []}
          onMessageUpdate={refreshMessages}
        />
      ) : (
        <SettingsView
          tenantId={currentTenant.id}
          tokens={tokens || []}
          channels={monitoredChannels || []}
          onTokensChange={refreshTokens}
          onChannelsChange={refreshChannels}
          onSyncDone={refreshMessages}
        />
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
//  INBOX
// ────────────────────────────────────────────────────────────────────────
interface InboxViewProps {
  messages: CommunicationMessage[];
  loading: boolean;
  tokens: IntegrationToken[];
  onMessageUpdate: () => void;
}

const InboxView: React.FC<InboxViewProps> = ({ messages, loading, tokens, onMessageUpdate }) => {
  const [filter, setFilter] = useState<Filter>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = messages.slice();
    if (filter === 'pending') list = list.filter(m => m.status === 'pending');
    else if (filter === 'high') list = list.filter(m => m.ai_classification?.priority === 'high' || m.ai_classification?.intent === 'urgent');
    else if (filter === 'gmail') list = list.filter(m => m.platform === 'gmail');
    else if (filter === 'slack') list = list.filter(m => m.platform === 'slack');
    return list.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
  }, [messages, filter]);

  const selected = selectedId ? messages.find(m => m.id === selectedId) || null : null;

  // No integrations yet — show onboarding
  if (tokens.length === 0 && !loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center">
        <div className="inline-flex p-3 rounded-full bg-amber-50 dark:bg-amber-500/10 mb-4">
          <Icons.Sparkles size={20} className="text-amber-500" />
        </div>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Conectá tu primer canal</h3>
        <p className="text-xs text-zinc-500 max-w-md mx-auto mb-4">
          Conectá Gmail y/o Slack desde Settings para empezar a ver mensajes acá. La IA va a clasificarlos automáticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 min-h-[600px]">
      {/* ── Left: filter pills + message list ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
        <div className="p-3 border-b border-zinc-100 dark:border-zinc-800/60 flex flex-wrap gap-1.5">
          {([
            { id: 'pending' as const, label: 'Pendientes', count: messages.filter(m => m.status === 'pending').length },
            { id: 'all' as const, label: 'Todo', count: messages.length },
            { id: 'high' as const, label: 'Urgente', count: messages.filter(m => m.ai_classification?.priority === 'high' || m.ai_classification?.intent === 'urgent').length },
            { id: 'gmail' as const, label: 'Gmail', count: messages.filter(m => m.platform === 'gmail').length },
            { id: 'slack' as const, label: 'Slack', count: messages.filter(m => m.platform === 'slack').length },
          ]).map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                filter === f.id
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
              }`}
            >
              {f.label}
              <span className={`text-[9px] tabular-nums font-mono ${filter === f.id ? 'opacity-60' : 'opacity-50'}`}>{f.count}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-50 dark:divide-zinc-800/40">
          {loading && messages.length === 0 && (
            <div className="p-8 text-center text-xs text-zinc-400">Cargando mensajes…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="p-12 text-center text-xs text-zinc-400">
              No hay mensajes con este filtro.
            </div>
          )}
          {filtered.map(msg => (
            <MessageCard key={msg.id} msg={msg} active={msg.id === selectedId} onClick={() => setSelectedId(msg.id)} />
          ))}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center p-12 text-zinc-400">
            <div className="text-center">
              <Icons.Mail size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-xs">Seleccioná un mensaje para ver el detalle</p>
            </div>
          </div>
        ) : (
          <MessageDetail key={selected.id} msg={selected} onAction={onMessageUpdate} />
        )}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
//  MESSAGE CARD (left list row)
// ────────────────────────────────────────────────────────────────────────
const MessageCard: React.FC<{ msg: CommunicationMessage; active: boolean; onClick: () => void }> = ({ msg, active, onClick }) => {
  const intent = msg.ai_classification?.intent;
  const intentMeta = intent ? INTENT_LABELS[intent] : null;
  const priority = msg.ai_classification?.priority;
  const isUrgent = priority === 'high' || intent === 'urgent';
  const isPending = msg.status === 'pending';
  const preview = msg.platform === 'gmail'
    ? previewFromBody(msg.body_text || '')
    : slackTextToPreview(msg.body_text || '');
  const headline = msg.platform === 'gmail' ? msg.subject : msg.channel_name ? `#${msg.channel_name}` : '';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 ${
        active
          ? 'bg-amber-50/60 dark:bg-amber-500/10 border-l-2 border-amber-500'
          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40 border-l-2 border-transparent'
      } ${!isPending ? 'opacity-60' : ''}`}
    >
      {/* Platform icon + status dot */}
      <div className="relative shrink-0 mt-0.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
          msg.platform === 'gmail' ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-violet-50 dark:bg-violet-500/10'
        }`}>
          {msg.platform === 'gmail'
            ? <Icons.Mail size={13} className="text-rose-500" />
            : <Icons.Message size={13} className="text-violet-500" />
          }
        </div>
        {isPending && (
          <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
            isUrgent ? 'bg-rose-500' : 'bg-emerald-500'
          }`} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {msg.from_name || msg.from_email || 'Anonymous'}
          </span>
          <span className="text-[10px] text-zinc-400 shrink-0 tabular-nums">
            {timeAgo(msg.received_at)}
          </span>
        </div>
        {headline && (
          <div className="text-[11px] text-zinc-600 dark:text-zinc-300 truncate font-medium">{headline}</div>
        )}
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">{preview}</div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {intentMeta && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${intentMeta.color}`}>
              {intentMeta.label}
            </span>
          )}
          {isUrgent && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-rose-500/15 text-rose-700 dark:text-rose-400">
              ⚡ Urgent
            </span>
          )}
          {!msg.ai_processed && (
            <span className="text-[9px] text-zinc-400 italic">analizando…</span>
          )}
          {msg.status !== 'pending' && (
            <span className="text-[9px] text-zinc-400">· {STATUS_LABELS[msg.status]}</span>
          )}
        </div>
      </div>
    </button>
  );
};

// ────────────────────────────────────────────────────────────────────────
//  MESSAGE DETAIL (right panel)
// ────────────────────────────────────────────────────────────────────────
const MessageDetail: React.FC<{ msg: CommunicationMessage; onAction: () => void }> = ({ msg, onAction }) => {
  const cls: AIClassification | null = msg.ai_classification;
  const [reply, setReply] = useState(cls?.suggested_reply || '');
  const [editedFromDraft, setEditedFromDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [showAi, setShowAi] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // When the user picks a different message, reset the composer.
  const lastMsgRef = useRef<string>(msg.id);
  useEffect(() => {
    if (lastMsgRef.current === msg.id) return;
    lastMsgRef.current = msg.id;
    setReply(cls?.suggested_reply || '');
    setEditedFromDraft(false);
    setError(null);
  }, [msg.id, cls?.suggested_reply]);

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comm-reply`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message_id: msg.id,
            body: reply,
            edited_from_draft: editedFromDraft,
          }),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      onAction();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (status: MessageStatus) => {
    try {
      await supabase.from('communication_messages').update({ status }).eq('id', msg.id);
      onAction();
    } catch (err) {
      errorLogger.error('comm status change failed', err);
    }
  };

  const handleCreateTask = async () => {
    if (!cls?.suggested_task) return;
    try {
      const { data: tenantData } = await supabase.auth.getUser();
      const userId = tenantData.user?.id;
      const { data: task, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          tenant_id: msg.tenant_id,
          owner_id: userId,
          title: cls.suggested_task.title,
          description: cls.suggested_task.description,
          status: 'todo',
          priority: cls.priority === 'high' ? 'high' : 'medium',
          start_date: cls.suggested_task.due_date,
          due_date: cls.suggested_task.due_date,
        })
        .select()
        .single();
      if (taskErr) throw taskErr;
      await supabase
        .from('communication_messages')
        .update({ status: 'task_created', task_id: task.id })
        .eq('id', msg.id);
      onAction();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const headline = msg.platform === 'gmail' ? msg.subject : msg.channel_name ? `#${msg.channel_name}` : '';

  return (
    <>
      {/* ─── Header ─── */}
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded ${
                msg.platform === 'gmail' ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400' : 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400'
              }`}>
                {msg.platform}
              </span>
              {cls?.intent && (
                <span className={`text-[10px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded ${INTENT_LABELS[cls.intent].color}`}>
                  {INTENT_LABELS[cls.intent].label}
                </span>
              )}
              <span className="text-[10px] text-zinc-400">{timeAgo(msg.received_at)}</span>
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {headline || msg.from_name}
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              <span className="font-medium">{msg.from_name}</span>
              {msg.from_email && <span className="text-zinc-400"> · {msg.from_email}</span>}
            </p>
          </div>
          {/* Quick actions */}
          <div className="flex gap-1">
            <button
              onClick={() => handleStatusChange('snoozed')}
              title="Posponer"
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Icons.Clock size={14} />
            </button>
            <button
              onClick={() => handleStatusChange('archived')}
              title="Archivar"
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Icons.Archive size={14} />
            </button>
            <button
              onClick={() => handleStatusChange('ignored')}
              title="Descartar"
              className="p-1.5 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            >
              <Icons.X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Scroll area: AI block + body + composer ─── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* AI summary card */}
        {cls && (
          <div className="rounded-xl border border-amber-200/60 dark:border-amber-500/20 bg-gradient-to-br from-amber-50/60 via-white to-white dark:from-amber-500/5 dark:via-zinc-900 dark:to-zinc-900 p-3">
            <button
              onClick={() => setShowAi(v => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                <Icons.Sparkles size={11} /> AI Analysis
              </span>
              <Icons.ChevronDown size={11} className={`text-amber-500 transition-transform ${showAi ? 'rotate-180' : ''}`} />
            </button>
            {showAi && (
              <div className="mt-2 space-y-2 text-[12px] text-zinc-700 dark:text-zinc-200">
                <p>{cls.summary}</p>
                {cls.key_entities && cls.key_entities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {cls.key_entities.slice(0, 6).map(e => (
                      <span key={e} className="text-[10px] px-1.5 py-0.5 bg-white/70 dark:bg-zinc-800/60 border border-amber-200/50 rounded text-zinc-600 dark:text-zinc-300">
                        {e}
                      </span>
                    ))}
                  </div>
                )}
                {cls.suggested_task && cls.should_create_task && (
                  <div className="mt-2 p-2.5 rounded-lg bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Sugerencia de tarea</div>
                    <div className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">{cls.suggested_task.title}</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{cls.suggested_task.description}</div>
                    {cls.suggested_task.due_date && (
                      <div className="text-[10px] text-zinc-400 mt-1">Due: {cls.suggested_task.due_date}</div>
                    )}
                    <button
                      onClick={handleCreateTask}
                      disabled={msg.status === 'task_created'}
                      className="mt-2 w-full px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40"
                    >
                      {msg.status === 'task_created' ? '✓ Tarea creada' : 'Crear tarea'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">
          {msg.platform === 'gmail' && msg.body_html
            ? <div dangerouslySetInnerHTML={{ __html: sanitizeBasic(msg.body_html) }} className="prose prose-sm dark:prose-invert max-w-none" />
            : msg.body_text}
        </div>

        {/* Reply composer */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Tu respuesta</span>
            {cls?.suggested_reply && reply !== cls.suggested_reply && (
              <button
                onClick={() => { setReply(cls.suggested_reply); setEditedFromDraft(false); }}
                className="text-[10px] text-zinc-400 hover:text-amber-600"
              >
                Restaurar sugerencia AI
              </button>
            )}
          </div>
          <textarea
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              if (cls?.suggested_reply && e.target.value !== cls.suggested_reply) setEditedFromDraft(true);
            }}
            rows={5}
            placeholder="Escribí tu respuesta…"
            className="w-full px-3 py-2 text-[13px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 resize-none"
          />
          {error && <p className="text-[11px] text-rose-500 mt-2">{error}</p>}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-zinc-400">
              {msg.status === 'replied' ? '✓ Ya respondido' : `Enviar ${msg.platform === 'gmail' ? 'email' : 'mensaje Slack'}`}
            </span>
            <button
              onClick={handleSend}
              disabled={sending || !reply.trim() || msg.status === 'replied'}
              className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {sending ? '…' : <><Icons.Send size={11} /> Enviar</>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// ────────────────────────────────────────────────────────────────────────
//  SETTINGS
// ────────────────────────────────────────────────────────────────────────
interface SettingsViewProps {
  tenantId: string;
  tokens: IntegrationToken[];
  channels: SlackMonitoredChannel[];
  onTokensChange: () => void;
  onChannelsChange: () => void;
  onSyncDone: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ tenantId, tokens, channels, onTokensChange, onChannelsChange, onSyncDone }) => {
  const gmailTokens = tokens.filter(t => t.platform === 'gmail');
  const slackTokens = tokens.filter(t => t.platform === 'slack');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnectGmail = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await getGmailConnectUrl(tenantId);
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const handleConnectSlack = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await getSlackConnectUrl(tenantId);
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const handleDisconnect = async (tokenId: string) => {
    if (!confirm('¿Desconectar esta integración? No vas a recibir nuevos mensajes de esta cuenta.')) return;
    try {
      await supabase.from('integration_tokens').delete().eq('id', tokenId);
      onTokensChange();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSyncGmail = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await syncGmail(tenantId, { limit: 50 });
      alert(`✓ Synced ${r.synced} mensajes${r.errors.length ? `\n⚠ ${r.errors.length} errores` : ''}`);
      onSyncDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200/50 text-[12px] text-rose-700 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* ── Gmail section ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
              <Icons.Mail size={15} className="text-rose-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Gmail</h3>
              <p className="text-[11px] text-zinc-400">{gmailTokens.length} {gmailTokens.length === 1 ? 'cuenta conectada' : 'cuentas conectadas'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {gmailTokens.length > 0 && (
              <button
                onClick={handleSyncGmail}
                disabled={busy}
                className="px-3 py-1.5 text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/40 disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <Icons.RefreshCw size={11} /> Sync
              </button>
            )}
            <button
              onClick={handleConnectGmail}
              disabled={busy}
              className="px-3 py-1.5 text-[11px] font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Icons.Plus size={11} /> Conectar Gmail
            </button>
          </div>
        </div>
        <div className="divide-y divide-zinc-50 dark:divide-zinc-800/40">
          {gmailTokens.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-400">
              No hay cuentas de Gmail conectadas. Conectá una para empezar a recibir mensajes.
            </div>
          ) : (
            gmailTokens.map(t => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{t.gmail_email}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    Conectado {timeAgo(t.connected_at)}
                    {t.last_sync_at && ` · Última sync ${timeAgo(t.last_sync_at)}`}
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnect(t.id)}
                  className="text-[11px] text-zinc-400 hover:text-rose-500 px-2 py-1 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                >
                  Desconectar
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Slack section ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
              <Icons.Message size={15} className="text-violet-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Slack</h3>
              <p className="text-[11px] text-zinc-400">{slackTokens.length} {slackTokens.length === 1 ? 'workspace' : 'workspaces'}</p>
            </div>
          </div>
          <button
            onClick={handleConnectSlack}
            disabled={busy}
            className="px-3 py-1.5 text-[11px] font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Icons.Plus size={11} /> Conectar Slack
          </button>
        </div>
        <div className="divide-y divide-zinc-50 dark:divide-zinc-800/40">
          {slackTokens.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-400">
              No hay workspaces de Slack conectados.
            </div>
          ) : (
            slackTokens.map(t => (
              <SlackWorkspaceRow
                key={t.id}
                tenantId={tenantId}
                token={t}
                channels={channels.filter(c => c.integration_token_id === t.id)}
                onDisconnect={() => handleDisconnect(t.id)}
                onChannelsChange={onChannelsChange}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
//  SLACK WORKSPACE ROW (with channel selector)
// ────────────────────────────────────────────────────────────────────────
const SlackWorkspaceRow: React.FC<{
  tenantId: string;
  token: IntegrationToken;
  channels: SlackMonitoredChannel[];
  onDisconnect: () => void;
  onChannelsChange: () => void;
}> = ({ tenantId, token, channels, onDisconnect, onChannelsChange }) => {
  const [expanded, setExpanded] = useState(false);
  const [available, setAvailable] = useState<AvailableSlackChannel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const monitoredIds = useMemo(() => new Set(channels.map(c => c.channel_id)), [channels]);

  const loadAvailable = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAvailableSlackChannels(tenantId, token.id);
      setAvailable(list);
    } catch (err) {
      errorLogger.error('slack channels load failed', err);
      setAvailable([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, token.id]);

  useEffect(() => {
    if (expanded && available === null) loadAvailable();
  }, [expanded, available, loadAvailable]);

  const handleToggleChannel = async (ch: AvailableSlackChannel) => {
    if (!available) return;
    const isMonitored = monitoredIds.has(ch.id);
    const next = isMonitored
      ? channels.filter(c => c.channel_id !== ch.id).map(c => ({
          id: c.channel_id, name: c.channel_name,
          is_private: c.channel_type === 'private', is_member: true, num_members: null,
        } as AvailableSlackChannel))
      : [...channels.map(c => ({
          id: c.channel_id, name: c.channel_name,
          is_private: c.channel_type === 'private', is_member: true, num_members: null,
        } as AvailableSlackChannel)), ch];
    try {
      await setMonitoredChannels(tenantId, token.id, next);
      onChannelsChange();
    } catch (err) {
      errorLogger.error('slack monitored channels update failed', err);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{token.slack_team_name || 'Slack workspace'}</div>
          <div className="text-[11px] text-zinc-400 mt-0.5">
            {channels.length} {channels.length === 1 ? 'canal monitoreado' : 'canales monitoreados'}
            {token.connected_at && ` · Conectado ${timeAgo(token.connected_at)}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-2 py-1 inline-flex items-center gap-1"
          >
            {expanded ? 'Ocultar' : 'Configurar canales'}
            <Icons.ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={onDisconnect}
            className="text-[11px] text-zinc-400 hover:text-rose-500 px-2 py-1 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
          >
            Desconectar
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
          {loading && <div className="text-[11px] text-zinc-400 italic">Cargando canales…</div>}
          {!loading && available && available.length === 0 && (
            <div className="text-[11px] text-zinc-400 italic">
              El bot no tiene acceso a ningún canal todavía. Invitalo a los canales en Slack y refrescá.
            </div>
          )}
          {!loading && available && available.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[300px] overflow-y-auto pr-1">
              {available.map(ch => {
                const checked = monitoredIds.has(ch.id);
                return (
                  <button
                    key={ch.id}
                    onClick={() => handleToggleChannel(ch)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors text-left ${
                      checked
                        ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-sm flex items-center justify-center border ${
                      checked ? 'bg-violet-500 border-violet-500' : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {checked && <Icons.Check size={9} className="text-white" />}
                    </span>
                    <span className="truncate flex-1">{ch.is_private ? '🔒' : '#'}{ch.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// Minimal HTML sanitizer for inline display. Strips scripts, styles, and
// event handlers — keeps formatting tags. NOT a full XSS guard; for that
// we'd add DOMPurify. Safe enough for trusted inboxes within RLS scope.
function sanitizeBasic(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

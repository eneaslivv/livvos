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
import { useClients } from '../hooks/useClients';
import { useProjects } from '../context/ProjectsContext';
import { supabase } from '../lib/supabase';
import { errorLogger } from '../lib/errorLogger';
import { composeCommReply, type ComposeCommReplyAction } from '../lib/ai';
import {
  INTENT_LABELS, STATUS_LABELS,
  type CommunicationMessage, type IntegrationToken,
  type SlackMonitoredChannel, type AIClassification,
  type MessageStatus,
} from '../types/communications';
import type { Client } from '../context/ClientsContext';
import type { Project } from '../context/ProjectsContext';
import {
  getGmailConnectUrl, syncGmail, registerGmailWatch, htmlToText, previewFromBody,
} from '../lib/communications/gmail';
import {
  getSlackConnectUrl, listAvailableSlackChannels, setMonitoredChannels,
  setSlackNotifyChannel, postToSlack, slackTextToPreview, syncSlack,
  type AvailableSlackChannel,
} from '../lib/communications/slack';

type Tab = 'inbox' | 'settings';
type Filter = 'all' | 'pending' | 'high' | 'gmail' | 'slack';

// Compact "5s ago" / "12m ago" / "3h ago" formatter for the inline last-sync
// indicator. We don't need an i18n library for one ephemeral piece of text.
function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ────────────────────────────────────────────────────────────────────────
//  ROOT PAGE
// ────────────────────────────────────────────────────────────────────────
export const Communications: React.FC = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { clients } = useClients();
  const { projects } = useProjects();
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

  // ── Auto-poll: pull new Gmail + Slack messages on an interval ──────
  // The page already subscribes to realtime postgres_changes on the
  // communication_messages table — but realtime only fires when something
  // INSERTs. Until we wire push-based webhooks (Gmail Pub/Sub, Slack
  // Events API), the only way new mail/messages appear is by calling
  // the sync edge functions. This poll runs every 90s while the page is
  // visible, calls both syncs in parallel, and lets realtime do the rest.
  // Throttled / paused while the tab is hidden so we don't hammer the
  // edge functions when nobody's looking.
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTickRef = useRef(0);

  const hasGmail = (tokens || []).some(t => t.platform === 'gmail' && t.is_active);
  const hasSlack = (tokens || []).some(t => t.platform === 'slack' && t.is_active);

  const runAutoSync = useCallback(async (silent: boolean) => {
    if (!currentTenant?.id) return;
    if (!hasGmail && !hasSlack) return; // no integrations, nothing to do
    if (!silent) setIsSyncing(true);
    const tickId = ++syncTickRef.current;
    try {
      await Promise.allSettled([
        hasGmail ? syncGmail(currentTenant.id, { limit: 50 }) : Promise.resolve(),
        hasSlack ? syncSlack(currentTenant.id, { hours: 24 }) : Promise.resolve(),
      ]);
      // Only stamp the time if THIS run is still the latest one (avoids
      // stale time after a manual click superseded a background poll).
      if (tickId === syncTickRef.current) setLastSyncedAt(new Date());
    } catch (err) {
      errorLogger.warn('comm auto-sync', err);
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, [currentTenant?.id, hasGmail, hasSlack]);

  // Kick off once on mount + on integration changes, then every 90s.
  useEffect(() => {
    if (!tenantReady) return;
    if (!hasGmail && !hasSlack) return;
    runAutoSync(true);
    const id = setInterval(() => {
      // Skip the tick when the tab is hidden — saves edge invocations.
      if (typeof document !== 'undefined' && document.hidden) return;
      runAutoSync(true);
    }, 90_000);
    return () => clearInterval(id);
  }, [tenantReady, hasGmail, hasSlack, runAutoSync]);

  // Also run a sync when the tab regains focus after being hidden, so
  // the user sees fresh state the moment they come back.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => { if (!document.hidden) runAutoSync(true); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [runAutoSync]);

  // Tick every 15s so the "Sync 12s ago" pill ages without waiting for
  // the next sync cycle. Cheap setState — only updates this component.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    if (!lastSyncedAt) return;
    const id = setInterval(() => forceRerender(n => n + 1), 15_000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

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
          <p className="text-zinc-400 text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{(messages || []).filter(m => m.status === 'pending').length} pendientes</span>
            <span className="text-zinc-300">·</span>
            <span>{(tokens || []).filter(t => t.platform === 'gmail').length} Gmail</span>
            <span className="text-zinc-300">·</span>
            <span>{(tokens || []).filter(t => t.platform === 'slack').length} Slack</span>
            {lastSyncedAt && (
              <>
                <span className="text-zinc-300">·</span>
                <span className="inline-flex items-center gap-1 text-zinc-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                  {isSyncing ? 'Sincronizando…' : `Sync ${formatRelative(lastSyncedAt)}`}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(hasGmail || hasSlack) && (
            <button
              onClick={() => runAutoSync(false)}
              disabled={isSyncing}
              className="px-2.5 py-1.5 text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/40 disabled:opacity-40 inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300"
              title="Pull new messages from Gmail + Slack now"
            >
              <Icons.RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
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
          clients={clients || []}
          allClients={(clients as Client[]) || []}
          projects={projects || []}
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
  clients: Array<{ id: string; name?: string | null; company?: string | null }>;
  allClients: Client[];
  projects: Project[];
  onMessageUpdate: () => void;
}

const InboxView: React.FC<InboxViewProps> = ({ messages, loading, tokens, clients, allClients, projects, onMessageUpdate }) => {
  const [filter, setFilter] = useState<Filter>('pending');
  const [clientFilter, setClientFilter] = useState<string>('all'); // client_id or 'all'
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Build a map of clients that have at least one message — only show those
  // in the per-client picker, no point listing 50 clients with 0 messages.
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const clientsWithMessages = useMemo(() => {
    const counts = new Map<string, number>();
    messages.forEach(m => {
      if (m.matched_client_id) counts.set(m.matched_client_id, (counts.get(m.matched_client_id) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, name: clientMap.get(id)?.name || clientMap.get(id)?.company || 'Cliente', count }))
      .sort((a, b) => b.count - a.count);
  }, [messages, clientMap]);
  const unmatchedCount = useMemo(() => messages.filter(m => m.ai_processed && !m.matched_client_id).length, [messages]);

  const filtered = useMemo(() => {
    let list = messages.slice();
    if (filter === 'pending') list = list.filter(m => m.status === 'pending');
    else if (filter === 'high') list = list.filter(m => m.ai_classification?.priority === 'high' || m.ai_classification?.intent === 'urgent');
    else if (filter === 'gmail') list = list.filter(m => m.platform === 'gmail');
    else if (filter === 'slack') list = list.filter(m => m.platform === 'slack');
    if (clientFilter === '__unmatched__') list = list.filter(m => m.ai_processed && !m.matched_client_id);
    else if (clientFilter !== 'all') list = list.filter(m => m.matched_client_id === clientFilter);
    return list.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
  }, [messages, filter, clientFilter]);

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
        <div className="border-b border-zinc-100 dark:border-zinc-800/60">
          {/* Status / platform filter pills */}
          <div className="p-3 flex flex-wrap gap-1.5">
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
          {/* Per-client filter — only shown when AI has matched at least one. */}
          {clientsWithMessages.length > 0 && (
            <div className="px-3 pb-3 flex flex-wrap gap-1.5 border-t border-zinc-100 dark:border-zinc-800/60 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 self-center mr-1">Cliente:</span>
              <button
                onClick={() => setClientFilter('all')}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                  clientFilter === 'all'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                }`}
              >
                Todos
              </button>
              {clientsWithMessages.map(c => (
                <button
                  key={c.id}
                  onClick={() => setClientFilter(c.id)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all flex items-center gap-1 max-w-[180px] ${
                    clientFilter === c.id
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-[8.5px] tabular-nums font-mono opacity-60">{c.count}</span>
                </button>
              ))}
              {unmatchedCount > 0 && (
                <button
                  onClick={() => setClientFilter('__unmatched__')}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all flex items-center gap-1 ${
                    clientFilter === '__unmatched__'
                      ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'
                      : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 italic'
                  }`}
                >
                  Sin matchear
                  <span className="text-[8.5px] tabular-nums font-mono opacity-60">{unmatchedCount}</span>
                </button>
              )}
            </div>
          )}
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
            <MessageCard
              key={msg.id}
              msg={msg}
              active={msg.id === selectedId}
              clientName={msg.matched_client_id ? clientMap.get(msg.matched_client_id)?.name || clientMap.get(msg.matched_client_id)?.company || null : null}
              onClick={() => setSelectedId(msg.id)}
            />
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
          <MessageDetail
            key={selected.id}
            msg={selected}
            allClients={allClients}
            projects={projects}
            allMessages={messages}
            onAction={onMessageUpdate}
          />
        )}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
//  MESSAGE CARD (left list row)
// ────────────────────────────────────────────────────────────────────────
const MessageCard: React.FC<{
  msg: CommunicationMessage;
  active: boolean;
  clientName: string | null | undefined;
  onClick: () => void;
}> = ({ msg, active, clientName, onClick }) => {
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
          {/* Client match — most prominent chip when present, since this
              is what answers "which client/project does this belong to?" */}
          {clientName && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 inline-flex items-center gap-1 max-w-[140px]">
              <Icons.Users size={9} />
              <span className="truncate">{clientName}</span>
            </span>
          )}
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
interface MessageDetailProps {
  msg: CommunicationMessage;
  allClients: Client[];
  projects: Project[];
  allMessages: CommunicationMessage[];
  onAction: () => void;
}

const MessageDetail: React.FC<MessageDetailProps> = ({ msg, allClients, projects, allMessages, onAction }) => {
  const cls: AIClassification | null = msg.ai_classification;
  const [reply, setReply] = useState(cls?.suggested_reply || '');
  const [editedFromDraft, setEditedFromDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [showAi, setShowAi] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── AI compose toolbar state ────────────────────────────────────
  const [aiBusy, setAiBusy] = useState<ComposeCommReplyAction | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<null | 'translate' | 'tone' | 'project'>(null);
  const [pinnedProjectId, setPinnedProjectId] = useState<string | null>(msg.matched_project_id);
  const [projectQuery, setProjectQuery] = useState('');

  // When the user picks a different message, reset the composer.
  const lastMsgRef = useRef<string>(msg.id);
  useEffect(() => {
    if (lastMsgRef.current === msg.id) return;
    lastMsgRef.current = msg.id;
    setReply(cls?.suggested_reply || '');
    setEditedFromDraft(false);
    setError(null);
    setAiNote(null);
    setOpenMenu(null);
    setPinnedProjectId(msg.matched_project_id);
    setProjectQuery('');
  }, [msg.id, cls?.suggested_reply, msg.matched_project_id]);

  // ── Resolve client & project context for the AI ─────────────────
  // Compact, fast: client basics + last 3 messages from same client/sender
  // + selected project basics. Cap text fields so the prompt stays small.
  const matchedClient: Client | null = useMemo(() => {
    if (msg.matched_client_id) {
      return allClients.find(c => c.id === msg.matched_client_id) || null;
    }
    if (msg.from_email) {
      const lower = msg.from_email.toLowerCase();
      return allClients.find(c => c.email?.toLowerCase() === lower) || null;
    }
    return null;
  }, [msg.matched_client_id, msg.from_email, allClients]);

  const recentSenderMessages = useMemo(() => {
    const sameSender = allMessages
      .filter(m => m.id !== msg.id && (
        (msg.matched_client_id && m.matched_client_id === msg.matched_client_id) ||
        (msg.from_email && m.from_email && m.from_email.toLowerCase() === msg.from_email.toLowerCase())
      ))
      .sort((a, b) => +new Date(b.received_at) - +new Date(a.received_at))
      .slice(0, 3);
    return sameSender.map(m => ({
      from: m.from_name || m.from_email || 'unknown',
      body: (m.body_text || '').slice(0, 280),
      sent_at: m.received_at,
    }));
  }, [allMessages, msg.id, msg.matched_client_id, msg.from_email]);

  const pinnedProject: Project | null = useMemo(
    () => (pinnedProjectId ? projects.find(p => p.id === pinnedProjectId) || null : null),
    [pinnedProjectId, projects],
  );

  const projectMatches = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    const list = q
      ? projects.filter(p => p.title.toLowerCase().includes(q) || (p.clientName || '').toLowerCase().includes(q))
      : projects.slice(0, 8);
    return list.slice(0, 8);
  }, [projects, projectQuery]);

  // ── AI compose dispatcher ───────────────────────────────────────
  const runAI = useCallback(async (
    action: ComposeCommReplyAction,
    extra?: { target_language?: string; tone?: string },
  ) => {
    setAiBusy(action);
    setAiNote(null);
    setError(null);
    try {
      const result = await composeCommReply({
        action,
        draft: reply,
        inbound_message: {
          platform: msg.platform,
          sender_name: msg.from_name || undefined,
          sender_email: msg.from_email || undefined,
          subject: msg.subject || undefined,
          body: (msg.body_text || '').slice(0, 4000),
          received_at: msg.received_at,
        },
        client_context: matchedClient ? {
          name: matchedClient.name,
          email: matchedClient.email,
          notes: (matchedClient.notes || '').slice(0, 600),
          recent_messages: recentSenderMessages,
        } : null,
        project_context: pinnedProject ? {
          title: pinnedProject.title,
          description: (pinnedProject.description || '').slice(0, 600),
          status: pinnedProject.status,
          deadline: pinnedProject.deadline,
        } : null,
        params: extra,
      });
      setReply(result.reply);
      setEditedFromDraft(true);
      setAiNote(result.explanation || 'Done.');
      setOpenMenu(null);
    } catch (err) {
      setError((err as Error).message || 'AI request failed');
    } finally {
      setAiBusy(null);
    }
  }, [reply, msg, matchedClient, recentSenderMessages, pinnedProject]);

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
            <ForwardToSlackButton msg={msg} />
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
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Your reply</span>
            <div className="flex items-center gap-2">
              {/* Context chips */}
              {matchedClient && (
                <span
                  title={matchedClient.notes ? `Notes: ${matchedClient.notes.slice(0, 120)}` : 'Client context loaded'}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 inline-flex items-center gap-1"
                >
                  <Icons.Users size={9} /> {matchedClient.name}
                  {recentSenderMessages.length > 0 && (
                    <span className="opacity-60">· {recentSenderMessages.length} prev</span>
                  )}
                </span>
              )}
              {pinnedProject && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-200/50 inline-flex items-center gap-1">
                  <Icons.Briefcase size={9} /> {pinnedProject.title}
                  <button
                    onClick={() => setPinnedProjectId(null)}
                    className="ml-0.5 -mr-0.5 hover:text-rose-500"
                    title="Unpin project"
                  >
                    <Icons.X size={9} />
                  </button>
                </span>
              )}
              {cls?.suggested_reply && reply !== cls.suggested_reply && (
                <button
                  onClick={() => { setReply(cls.suggested_reply); setEditedFromDraft(false); }}
                  className="text-[10px] text-zinc-400 hover:text-amber-600"
                >
                  Restore AI suggestion
                </button>
              )}
            </div>
          </div>

          {/* AI toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <button
              onClick={() => runAI('improve')}
              disabled={!!aiBusy || !reply.trim()}
              title="Fix grammar, spelling and clarity. Keeps language and meaning."
              className="px-2 py-1 rounded-md text-[10px] font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:border-amber-300 hover:text-amber-700 disabled:opacity-40 inline-flex items-center gap-1"
            >
              {aiBusy === 'improve'
                ? <Icons.Loader size={10} className="animate-spin" />
                : <Icons.Sparkles size={10} />}
              Improve
            </button>

            {/* Translate dropdown */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'translate' ? null : 'translate')}
                disabled={!!aiBusy || !reply.trim()}
                className="px-2 py-1 rounded-md text-[10px] font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:border-amber-300 hover:text-amber-700 disabled:opacity-40 inline-flex items-center gap-1"
              >
                {aiBusy === 'translate'
                  ? <Icons.Loader size={10} className="animate-spin" />
                  : <Icons.Globe size={10} />}
                Translate <Icons.ChevronDown size={9} />
              </button>
              {openMenu === 'translate' && (
                <div className="absolute z-20 right-0 mt-1 w-44 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-1">
                  {[
                    { code: 'en', label: 'English' },
                    { code: 'es', label: 'Español' },
                    { code: 'pt', label: 'Português' },
                    { code: 'fr', label: 'Français' },
                    { code: 'de', label: 'Deutsch' },
                    { code: 'it', label: 'Italiano' },
                  ].map(opt => (
                    <button
                      key={opt.code}
                      onClick={() => runAI('translate', { target_language: opt.code })}
                      className="w-full text-left px-2 py-1 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tone dropdown */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'tone' ? null : 'tone')}
                disabled={!!aiBusy || !reply.trim()}
                className="px-2 py-1 rounded-md text-[10px] font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:border-amber-300 hover:text-amber-700 disabled:opacity-40 inline-flex items-center gap-1"
              >
                {aiBusy === 'rewrite_tone'
                  ? <Icons.Loader size={10} className="animate-spin" />
                  : <Icons.Message size={10} />}
                Tone <Icons.ChevronDown size={9} />
              </button>
              {openMenu === 'tone' && (
                <div className="absolute z-20 right-0 mt-1 w-44 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-1">
                  {['formal', 'friendly', 'concise', 'apologetic', 'enthusiastic', 'firm'].map(t => (
                    <button
                      key={t}
                      onClick={() => runAI('rewrite_tone', { tone: t })}
                      className="w-full text-left px-2 py-1 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 capitalize"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => runAI('generate')}
              disabled={!!aiBusy}
              title="Generate a fresh reply from scratch using context"
              className="px-2 py-1 rounded-md text-[10px] font-medium bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 disabled:opacity-40 inline-flex items-center gap-1"
            >
              {aiBusy === 'generate'
                ? <Icons.Loader size={10} className="animate-spin" />
                : <Icons.Sparkles size={10} />}
              Generate
            </button>

            <span className="flex-1" />

            {/* Project context picker */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'project' ? null : 'project')}
                className="px-2 py-1 rounded-md text-[10px] font-medium bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-violet-400 hover:text-violet-600 inline-flex items-center gap-1"
                title="Sync project context — the AI will use it when composing"
              >
                <Icons.Briefcase size={10} />
                {pinnedProject ? 'Change project' : 'Add project context'}
              </button>
              {openMenu === 'project' && (
                <div className="absolute z-20 right-0 mt-1 w-72 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-2">
                  <input
                    autoFocus
                    value={projectQuery}
                    onChange={e => setProjectQuery(e.target.value)}
                    placeholder="Search projects…"
                    className="w-full px-2 py-1 mb-1 text-[11px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded outline-none"
                  />
                  <div className="max-h-48 overflow-y-auto">
                    {projectMatches.length === 0 ? (
                      <div className="px-2 py-3 text-[11px] text-zinc-400 text-center">No projects</div>
                    ) : projectMatches.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setPinnedProjectId(p.id); setOpenMenu(null); setProjectQuery(''); }}
                        className="w-full text-left px-2 py-1.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <div className="font-medium text-zinc-800 dark:text-zinc-100 truncate">{p.title}</div>
                        {p.clientName && <div className="text-[10px] text-zinc-500 truncate">{p.clientName}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <textarea
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              if (cls?.suggested_reply && e.target.value !== cls.suggested_reply) setEditedFromDraft(true);
            }}
            rows={6}
            placeholder="Write your reply or use the AI tools above…"
            className="w-full px-3 py-2 text-[13px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 resize-none"
          />
          {aiNote && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 inline-flex items-center gap-1">
              <Icons.Sparkles size={10} /> {aiNote}
            </p>
          )}
          {error && <p className="text-[11px] text-rose-500 mt-2">{error}</p>}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-zinc-400">
              {msg.status === 'replied' ? '✓ Already replied' : `Send ${msg.platform === 'gmail' ? 'email' : 'Slack message'}`}
            </span>
            <button
              onClick={handleSend}
              disabled={sending || !reply.trim() || msg.status === 'replied'}
              className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {sending ? '…' : <><Icons.Send size={11} /> Send</>}
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

  // Register Gmail Pub/Sub watch — calls users.watch on every connected
  // Gmail account so Google starts pushing real-time history notifications
  // to our gmail-events webhook. Watches expire after 7 days; this button
  // is also how the user re-arms them. The Edge Function returns a clear
  // error if GMAIL_PUBSUB_TOPIC isn't set, which we surface verbatim.
  const handleRegisterGmailWatch = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await registerGmailWatch(tenantId);
      const detail = r.errors.length ? `\n⚠ ${r.errors.length} errores:\n${r.errors.join('\n')}` : '';
      alert(`✓ ${r.watched} Gmail account(s) ahora reciben push notifications.${detail}\n\nLas suscripciones expiran en 7 días — refrescá entonces.`);
      onTokensChange();
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
              <>
                <button
                  onClick={handleRegisterGmailWatch}
                  disabled={busy}
                  className="px-3 py-1.5 text-[11px] font-medium border border-amber-200 dark:border-amber-700/40 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-500/10 rounded-md hover:bg-amber-100 dark:hover:bg-amber-500/15 disabled:opacity-40 inline-flex items-center gap-1.5"
                  title="Activa push notifications via Pub/Sub. Requiere setup en Google Cloud (ver WEBHOOKS.md). Caduca cada 7 días."
                >
                  <Icons.Zap size={11} /> Enable push
                </button>
                <button
                  onClick={handleSyncGmail}
                  disabled={busy}
                  className="px-3 py-1.5 text-[11px] font-medium border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/40 disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  <Icons.RefreshCw size={11} /> Sync
                </button>
              </>
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
  const [bot, setBot] = useState<{ handle: string | null; display_name: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const monitoredIds = useMemo(() => new Set(channels.map(c => c.channel_id)), [channels]);

  const loadAvailable = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAvailableSlackChannels(tenantId, token.id);
      setAvailable(result.channels);
      setBot(result.bot);
    } catch (err) {
      errorLogger.error('slack channels load failed', err);
      setAvailable([]);
      setBot(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, token.id]);

  // Real handle from Slack (what /invite @<x> actually takes); fall back
  // to the workspace name only when the API hasn't responded yet.
  const botHandle = bot?.handle || token.slack_team_name?.toLowerCase().replace(/\s+/g, '-') || 'tu-bot';
  const inviteCommand = `/invite @${botHandle}`;

  const copyInviteCommand = async () => {
    try {
      await navigator.clipboard.writeText(inviteCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

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
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 space-y-3">
          {/* Notification channel picker — where outbound auto-notifications
              (new lead, approved proposal, manual broadcasts) get posted. */}
          <NotifyChannelPicker
            tokenId={token.id}
            currentChannelId={token.slack_notify_channel_id || null}
            available={available}
            onChange={onChannelsChange}
          />

          {/* Header: count + refresh + invite hint */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-zinc-500">
              {loading ? (
                'Cargando canales…'
              ) : available ? (
                <>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{available.length}</span>
                  {' '}canales disponibles · <span className="font-medium text-violet-600 dark:text-violet-400">{channels.length}</span> monitoreados
                </>
              ) : '—'}
            </div>
            <button
              onClick={() => loadAvailable()}
              disabled={loading}
              title="Refrescar lista desde Slack"
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-2 py-0.5 rounded disabled:opacity-50"
            >
              <Icons.RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refrescar
            </button>
          </div>

          {/* Invite hint — gives TWO paths because /invite @handle is
              flaky for modern Slack apps (Slack often returns "valid
              member name required" if the handle doesn't autocomplete).
              The "Add an app" flow from the channel header is the
              canonical, always-works path; /invite is the fallback. */}
          {!loading && available && (
            <div className="text-[10.5px] text-zinc-600 dark:text-zinc-300 bg-amber-50/60 dark:bg-amber-500/5 border border-amber-200/60 dark:border-amber-500/20 rounded-md px-3 py-2.5 space-y-3">
              <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Icons.Bell size={11} />
                Para sumar el bot a un canal
              </div>

              {/* PATH A: canonical Slack UI flow — works for public + private */}
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                  Recomendado · desde Slack
                </div>
                <ol className="list-decimal list-inside space-y-0.5 text-[10.5px] text-zinc-600 dark:text-zinc-400 marker:text-amber-600">
                  <li>Abrí el canal en Slack y clickeá el nombre del canal arriba (header).</li>
                  <li>Pestaña <span className="font-semibold">Integraciones</span> → <span className="font-semibold">Agregar una app</span>.</li>
                  <li>
                    Buscá <span className="font-mono px-1 rounded bg-white dark:bg-zinc-900 border border-amber-200/60 dark:border-amber-500/20">{bot?.display_name || token.slack_team_name || 'tu app'}</span> y tocá <span className="font-semibold">Agregar</span>.
                  </li>
                  <li>Volvé acá y tocá <span className="font-semibold">Refrescar</span>.</li>
                </ol>
              </div>

              {/* PATH B: /invite as fallback — explicit warning that it may fail */}
              <details className="group/inv">
                <summary className="cursor-pointer text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1">
                  <Icons.ChevronDown size={10} className="group-open/inv:rotate-180 transition-transform" />
                  Alternativa con /invite (a veces falla)
                </summary>
                <div className="mt-2 space-y-1.5">
                  <p className="text-[10.5px] text-zinc-500">
                    Pegá este comando dentro del canal. Si Slack contesta <span className="italic">"se requiere un nombre de miembro válido"</span>, usá el método de arriba.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-[11px] px-2 py-1 rounded bg-white dark:bg-zinc-900 border border-amber-200/60 dark:border-amber-500/20 text-zinc-800 dark:text-zinc-200 select-all flex-1">
                      {inviteCommand}
                    </code>
                    <button
                      onClick={copyInviteCommand}
                      className={`text-[10px] font-medium px-2 py-1 rounded transition-colors inline-flex items-center gap-1 ${
                        copied
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:hover:bg-amber-500/25'
                      }`}
                      title="Copiar al portapapeles"
                    >
                      {copied ? <><Icons.Check size={10} /> Copiado</> : <><Icons.Copy size={10} /> Copiar</>}
                    </button>
                  </div>
                  {bot?.display_name && bot?.handle && bot.display_name !== bot.handle && (
                    <p className="text-[10px] text-zinc-400 italic">
                      Tip: cuando empieces a tipear <span className="font-mono">@</span> en Slack, debería autocompletar como{' '}
                      <span className="font-semibold not-italic text-zinc-600 dark:text-zinc-300">{bot.display_name}</span>. Si no aparece, ya no está en la sugerencia y conviene usar el método recomendado.
                    </p>
                  )}
                </div>
              </details>

              {/* Footer reminder */}
              <p className="text-[10px] text-zinc-400 pt-1 border-t border-amber-200/40 dark:border-amber-500/10">
                Para canales privados (🔒) tenés que estar adentro vos también — solo un miembro puede agregar la app.
              </p>
            </div>
          )}

          {!loading && available && available.length === 0 && (
            <div className="text-[11px] text-zinc-400 italic">
              El bot no tiene acceso a ningún canal todavía. Invitalo a los canales en Slack y tocá Refrescar.
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
                    title={ch.is_member === false ? 'El bot todavía no es miembro de este canal' : undefined}
                  >
                    <span className={`w-3 h-3 rounded-sm flex items-center justify-center border ${
                      checked ? 'bg-violet-500 border-violet-500' : 'border-zinc-300 dark:border-zinc-600'
                    }`}>
                      {checked && <Icons.Check size={9} className="text-white" />}
                    </span>
                    <span className="truncate flex-1">
                      {ch.is_private ? '🔒' : '#'}{ch.name}
                      {ch.is_member === false && !checked && (
                        <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400">· invitar</span>
                      )}
                    </span>
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
//  ForwardToSlackButton
// ────────────────────────────────────────────────────────────────────────
// Posts the current inbox message into the tenant's default Slack notify
// channel (set in Settings). Useful for triaging an email or a Slack DM
// into a wider channel for the team to weigh in. The button is hidden
// when no Slack workspace is connected.
const ForwardToSlackButton: React.FC<{ msg: CommunicationMessage }> = ({ msg }) => {
  const { currentTenant } = useTenant();
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleForward = async () => {
    if (!currentTenant?.id) return;
    setPosting(true);
    setErr(null);
    try {
      const headline = msg.platform === 'gmail'
        ? (msg.subject || '(no subject)')
        : (msg.channel_name ? `#${msg.channel_name}` : 'Slack message');
      const sender = msg.from_name || msg.from_email || 'unknown';
      const preview = (msg.body_text || '').slice(0, 600);
      const text = `📬 *${headline}* — from *${sender}*\n${preview}${(msg.body_text || '').length > 600 ? '…' : ''}`;
      await postToSlack({ tenantId: currentTenant.id, text });
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (e: any) {
      setErr(e?.message || 'No se pudo enviar');
      setTimeout(() => setErr(null), 4000);
    } finally {
      setPosting(false);
    }
  };

  return (
    <button
      onClick={handleForward}
      disabled={posting}
      title={
        err
          ? `Error: ${err}`
          : done
            ? 'Enviado ✓'
            : 'Reenviar este mensaje al canal de notificaciones de Slack'
      }
      className={`p-1.5 rounded-md transition-colors ${
        done
          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
          : err
            ? 'text-rose-500 bg-rose-50 dark:bg-rose-500/10'
            : 'text-zinc-400 hover:text-violet-600 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10'
      } disabled:opacity-50`}
    >
      {done ? <Icons.Check size={14} /> : err ? <Icons.AlertCircle size={14} /> : <Icons.Send size={14} />}
    </button>
  );
};

// ────────────────────────────────────────────────────────────────────────
//  NotifyChannelPicker
// ────────────────────────────────────────────────────────────────────────
// Lets the user pick a default channel where the system will post
// outbound notifications (new leads, approved proposals, manual
// broadcasts). The bot must already be a member of the chosen channel.
// Stored on integration_tokens.slack_notify_channel_id.
const NotifyChannelPicker: React.FC<{
  tokenId: string;
  currentChannelId: string | null;
  available: AvailableSlackChannel[] | null;
  onChange: () => void;
}> = ({ tokenId, currentChannelId, available, onChange }) => {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const memberChannels = useMemo(
    () => (available || []).filter(c => c.is_member !== false),
    [available],
  );
  const current = memberChannels.find(c => c.id === currentChannelId) || null;

  const handleSelect = async (channelId: string | null) => {
    setSaving(true);
    setErr(null);
    try {
      await setSlackNotifyChannel(tokenId, channelId);
      onChange();
    } catch (e: any) {
      setErr(e?.message || 'Error guardando canal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-violet-200/70 dark:border-violet-500/20 bg-violet-50/40 dark:bg-violet-500/5 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
          <Icons.Bell size={11} />
          Canal de notificaciones
        </div>
        {current && (
          <button
            onClick={() => handleSelect(null)}
            disabled={saving}
            className="text-[10px] text-zinc-500 hover:text-rose-500 disabled:opacity-40"
          >
            Quitar
          </button>
        )}
      </div>
      <div className="text-[10.5px] text-zinc-600 dark:text-zinc-400 mb-2">
        Cuando llegue un lead nuevo o aprueben una propuesta, el bot va a postear acá.
      </div>
      {available === null ? (
        <div className="text-[11px] text-zinc-400 italic">Cargá los canales para elegir uno…</div>
      ) : memberChannels.length === 0 ? (
        <div className="text-[11px] text-zinc-500 italic">
          El bot no es miembro de ningún canal todavía. Invitalo a uno y refrescá.
        </div>
      ) : (
        <select
          value={currentChannelId || ''}
          onChange={(e) => handleSelect(e.target.value || null)}
          disabled={saving}
          className="w-full text-[12px] px-2 py-1.5 rounded-md border border-violet-200 dark:border-violet-700/40 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-50"
        >
          <option value="">— Sin canal por defecto —</option>
          {memberChannels.map(c => (
            <option key={c.id} value={c.id}>
              {c.is_private ? '🔒' : '#'}{c.name}
            </option>
          ))}
        </select>
      )}
      {err && <div className="text-[10px] text-rose-500 mt-1.5">{err}</div>}
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

/**
 * ClientCommsSection — timeline de comunicaciones reales (Gmail + Slack)
 * sincronizadas para un cliente específico. Se filtra por matched_client_id
 * en communication_messages.
 *
 * Muestra:
 *  • Agrupado por fecha (hoy / ayer / fecha)
 *  • Ícono de plataforma (mail / slack)
 *  • From · subject/channel · preview · hora
 *  • Badge de status (pending / done / task_created)
 *  • AI classification summary si existe
 *
 * Si no hay mensajes matcheados al client, muestra un empty state con
 * tip de cómo funciona el matching (via from_email o AI classifier).
 */
import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';

interface CommMsg {
  id: string;
  platform: 'gmail' | 'slack';
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  body_text: string | null;
  channel_name: string | null;
  received_at: string;
  status: string;
  ai_classification: any;
}

interface ClientCommsSectionProps {
  clientId: string;
  clientName: string;
  clientEmail?: string | null;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:      { label: 'Pending',      cls: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  done:         { label: 'Done',         cls: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  archived:     { label: 'Archived',     cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' },
  task_created: { label: 'Task created', cls: 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300' },
};

const truncate = (s: string | null | undefined, max: number) => {
  if (!s) return '';
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
};

const dayLabel = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const dateStr = d.toISOString().slice(0, 10);
  if (dateStr === today) return 'Hoy';
  if (dateStr === yesterday) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

export const ClientCommsSection: React.FC<ClientCommsSectionProps> = ({
  clientId,
  clientName,
  clientEmail,
}) => {
  const { currentTenant } = useTenant();
  const [messages, setMessages] = useState<CommMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!currentTenant?.id || !clientId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      // Query by matched_client_id first. If no results, try fallback
      // by from_email matching the client's email.
      let q = supabase.from('communication_messages')
        .select('id, platform, from_name, from_email, subject, body_text, channel_name, received_at, status, ai_classification')
        .eq('tenant_id', currentTenant.id)
        .eq('matched_client_id', clientId)
        .order('received_at', { ascending: false })
        .limit(30);
      let { data, error } = await q;

      // Fallback: if no matched messages but we have an email, try email match
      if ((!data || data.length === 0) && clientEmail && !error) {
        const { data: emailData } = await supabase.from('communication_messages')
          .select('id, platform, from_name, from_email, subject, body_text, channel_name, received_at, status, ai_classification')
          .eq('tenant_id', currentTenant.id)
          .ilike('from_email', `%${clientEmail}%`)
          .order('received_at', { ascending: false })
          .limit(30);
        data = emailData;
      }

      if (!cancelled) {
        setMessages((data || []) as CommMsg[]);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentTenant?.id, clientId, clientEmail]);

  // Group messages by day
  const groups = useMemo(() => {
    const map = new Map<string, CommMsg[]>();
    for (const msg of messages) {
      const day = msg.received_at?.slice(0, 10) || 'unknown';
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(msg);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a)); // newest day first
  }, [messages]);

  if (loading) {
    return (
      <div className="px-5 py-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-3">
          Communications
        </div>
        <div className="flex items-center gap-2 py-4 text-[11px] text-zinc-400">
          <span className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
          Loading messages…
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800/60">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-2"
      >
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 inline-flex items-center gap-1.5">
          <Icons.Message size={11} />
          Communications · {messages.length}
        </h3>
        <Icons.ChevronDown
          size={12}
          className={`text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {messages.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-2">
                  <Icons.Mail size={15} className="text-zinc-400" />
                </div>
                <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                  No synced messages
                </p>
                <p className="text-[10.5px] text-zinc-400 mt-1 max-w-[280px] mx-auto leading-snug">
                  Messages from Gmail or Slack are matched to {clientName} automatically
                  via their email address or the AI classifier.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {groups.map(([day, msgs]) => (
                  <div key={day}>
                    <div className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5 sticky top-0 bg-white dark:bg-zinc-900 py-0.5">
                      {dayLabel(msgs[0].received_at)}
                    </div>
                    <div className="space-y-1">
                      {msgs.map(msg => {
                        const badge = STATUS_BADGE[msg.status] || STATUS_BADGE.pending;
                        const aiSummary = msg.ai_classification?.summary || msg.ai_classification?.proposed_title;
                        return (
                          <div
                            key={msg.id}
                            className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group"
                          >
                            {/* Platform icon */}
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                              msg.platform === 'gmail'
                                ? 'bg-rose-50 dark:bg-rose-500/10'
                                : 'bg-violet-50 dark:bg-violet-500/10'
                            }`}>
                              {msg.platform === 'gmail'
                                ? <Icons.Mail size={11} className="text-rose-500" />
                                : <Icons.Hash size={11} className="text-violet-500" />
                              }
                            </div>
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[11.5px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
                                  {msg.from_name || msg.from_email || 'Unknown'}
                                </span>
                                {msg.channel_name && (
                                  <span className="text-[10px] text-zinc-400 truncate">
                                    #{msg.channel_name}
                                  </span>
                                )}
                              </div>
                              {msg.subject && (
                                <div className="text-[11px] text-zinc-600 dark:text-zinc-300 truncate">
                                  {msg.subject}
                                </div>
                              )}
                              {/* AI summary or body preview */}
                              <div className="text-[10.5px] text-zinc-400 truncate mt-0.5 leading-snug">
                                {aiSummary || truncate(msg.body_text, 120)}
                              </div>
                            </div>
                            {/* Right: time + status */}
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              <span className="text-[9.5px] font-mono text-zinc-400 tabular-nums">
                                {new Date(msg.received_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className={`text-[8.5px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// AuroraContext — multi-agent chat state (14 agents + Atlas router).
// Backed by aurora-chat edge function (OpenAI gpt-4o + tool calling).
// Persists threads in aurora_threads + history in aurora_messages.
// Falls back to mockBackend.ts when LIVE flag off or edge fn fails.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentSlug, AgentResponse, AuroraMessage, AuroraMode, Canvas } from '../types/aurora';
import { auroraAgents } from '../lib/aurora/tokens';
import { auroraMockRespond } from '../lib/aurora/mockBackend';
import { supabase } from '../lib/supabase';
import { useTenant } from './TenantContext';
import { useAuth } from '../hooks/useAuth';

type AuroraStatus = 'idle' | 'sending' | 'error';

interface AuroraContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;

  agent: AgentSlug;
  setAgent: (a: AgentSlug) => void;

  mode: AuroraMode;
  setMode: (m: AuroraMode) => void;

  messages: AuroraMessage[];
  status: AuroraStatus;
  lastError: string | null;

  /** Send a message. If `forceAgent` is given, the request is routed to it directly (used by Atlas hand-off). */
  send: (text: string, forceAgent?: AgentSlug) => Promise<void>;

  /** Clear the conversation, keep agent + mode. */
  clear: () => void;
}

const AuroraContext = createContext<AuroraContextValue | undefined>(undefined);

const STORAGE_KEY_MODE = 'aurora:mode';
const STORAGE_KEY_AGENT = 'aurora:lastAgent';

// Flip to a single env var. Defaults to mock so the dock is always functional.
// Set VITE_AURORA_LIVE=true once the edge fn is deployed AND OPENAI_API_KEY
// is set as a Supabase secret.
const LIVE = ((import.meta as any).env?.VITE_AURORA_LIVE === 'true');

// Cache thread_id per (user × agent) so we don't roundtrip the RPC on every send.
type ThreadKey = string; // `${userId}:${agentSlug}`
const threadCache = new Map<ThreadKey, string>();

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'm_' + Math.random().toString(36).slice(2);
}

export const AuroraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // AuroraProvider is mounted deep in the stack inside TenantProvider — useTenant is always available.
  const tenantCtx = useTenant();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  // Track current thread per (user × agent). Loaded lazily on first send.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  // Cache loaded history per thread so we don't refetch on every dock toggle.
  const loadedThreadsRef = useRef<Set<string>>(new Set());
  const [agent, setAgentState] = useState<AgentSlug>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY_AGENT);
      const valid: AgentSlug[] = [
        // Aurora — product
        'atlas', 'solara', 'marina', 'nova', 'lumen', 'vega', 'orion', 'iris',
        'halo', 'cobra', 'selva', 'rune', 'echo', 'pulse',
        // livv OS — studio (founder only, server-side gated)
        'norte', 'tesoro', 'pulso', 'memoria',
        'cumbre', 'forja', 'trazo', 'ola', 'raiz', 'brujula',
      ];
      if (v && (valid as string[]).includes(v)) return v as AgentSlug;
    } catch {}
    return 'orion';
  });
  const [mode, setModeState] = useState<AuroraMode>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY_MODE);
      if (v === 'multi' || v === 'unified') return v;
    } catch {}
    return 'multi';
  });
  const [messages, setMessages] = useState<AuroraMessage[]>([]);
  const [status, setStatus] = useState<AuroraStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

  const setAgent = useCallback((a: AgentSlug) => {
    setAgentState(a);
    try { localStorage.setItem(STORAGE_KEY_AGENT, a); } catch {}
  }, []);

  const setMode = useCallback((m: AuroraMode) => {
    setModeState(m);
    try { localStorage.setItem(STORAGE_KEY_MODE, m); } catch {}
  }, []);

  // Drop an opener when the agent changes (and the dock has at least 1 prior user message).
  const lastAgentRef = useRef(agent);
  useEffect(() => {
    if (lastAgentRef.current !== agent && messages.length > 0) {
      setMessages(m => [...m, { id: uid(), role: 'agent', agent, text: openerFor(agent), createdAt: Date.now() }]);
    }
    lastAgentRef.current = agent;
  }, [agent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load thread + history when (user, agent) changes — only in LIVE mode.
  // Mock mode keeps the dock fully ephemeral so devs can poke around without DB.
  useEffect(() => {
    if (!LIVE || !user?.id) return;
    let cancelled = false;
    const cacheKey: ThreadKey = `${user.id}:${agent}`;
    const cached = threadCache.get(cacheKey);
    if (cached) {
      setActiveThreadId(cached);
      return;
    }
    (async () => {
      try {
        const { data: threadId, error } = await supabase.rpc('aurora_get_or_create_thread', { p_agent_slug: agent });
        if (cancelled || error || !threadId) return;
        threadCache.set(cacheKey, threadId as string);
        setActiveThreadId(threadId as string);

        // Load last 30 messages to hydrate the dock so the user picks up
        // where they left off. Only the first time we touch this thread.
        if (loadedThreadsRef.current.has(threadId as string)) return;
        loadedThreadsRef.current.add(threadId as string);
        const { data: msgs } = await supabase
          .from('aurora_messages')
          .select('id, role, agent_slug, text, canvas, created_at')
          .eq('thread_id', threadId)
          .in('role', ['user', 'assistant'])
          .order('created_at', { ascending: true })
          .limit(30);
        if (cancelled || !msgs) return;
        const hydrated: AuroraMessage[] = msgs.map((m: any) => ({
          id: m.id,
          role: m.role === 'assistant' ? 'agent' : 'user',
          agent: m.agent_slug || undefined,
          text: m.text || '',
          canvas: m.canvas || undefined,
          createdAt: new Date(m.created_at).getTime(),
        }));
        // Replace messages — but only if the dock is empty (don't blow away an
        // in-flight conversation). If there's already a user typing flow, append.
        setMessages(prev => prev.length === 0 ? hydrated : prev);
      } catch (e) {
        // Silent — fall through to ephemeral mode.
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, agent]);

  const toggle = useCallback(() => setOpen(o => !o), []);

  const clear = useCallback(() => { setMessages([]); setLastError(null); }, []);

  const send = useCallback(async (text: string, forceAgent?: AgentSlug) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const targetAgent = forceAgent || agent;

    // user bubble
    setMessages(m => [...m, { id: uid(), role: 'user', text: trimmed, createdAt: Date.now() }]);
    setStatus('sending');
    setLastError(null);

    let response: AgentResponse;
    try {
      if (LIVE) {
        // Find or create the thread for (user × targetAgent). Cache hits skip the RPC.
        let threadId: string | null = activeThreadId;
        if (user?.id) {
          const cacheKey: ThreadKey = `${user.id}:${targetAgent}`;
          threadId = threadCache.get(cacheKey) || null;
          if (!threadId) {
            const { data: t } = await supabase.rpc('aurora_get_or_create_thread', { p_agent_slug: targetAgent });
            if (t) {
              threadId = t as string;
              threadCache.set(cacheKey, threadId);
            }
          }
        }

        const { data, error } = await supabase.functions.invoke<any>('aurora-chat', {
          body: {
            agent: targetAgent,
            message: trimmed,
            tenant_id: tenantCtx?.currentTenant?.id ?? null,
            thread_id: threadId,
          },
        });
        if (error) throw new Error(error?.message || 'aurora-chat error');
        if (!data || data.error) {
          throw new Error(data?.error || 'aurora-chat empty response');
        }
        response = data as AgentResponse;
        // Update the active thread if the backend created one
        if (data.thread_id && data.thread_id !== threadId) {
          setActiveThreadId(data.thread_id);
          if (user?.id) threadCache.set(`${user.id}:${targetAgent}`, data.thread_id);
        }
      } else {
        response = auroraMockRespond(targetAgent, trimmed);
      }
    } catch (e: any) {
      // Soft fallback to mock so the user always gets a response.
      console.warn('[Aurora] Live call failed, falling back to mock:', e?.message);
      setLastError(e?.message ?? 'unknown');
      response = auroraMockRespond(targetAgent, trimmed);
    }

    // Atlas route → swap active agent + replay the question.
    if (response.canvas?.type === 'route' && response.canvas.target_agent && response.canvas.target_agent !== targetAgent) {
      setMessages(m => [...m, { id: uid(), role: 'agent', agent: 'atlas', text: response.text, canvas: response.canvas, createdAt: Date.now() }]);
      setTimeout(() => {
        const next = response.canvas!.target_agent!;
        setAgent(next);
        // re-send to the routed agent
        setTimeout(() => { void send(trimmed, next); }, 200);
      }, 400);
      setStatus('idle');
      return;
    }

    setMessages(m => [...m, {
      id: uid(),
      role: 'agent',
      agent: response.agent,
      text: response.text,
      canvas: response.canvas,
      createdAt: Date.now(),
    }]);
    setStatus('idle');
  }, [agent, tenantCtx?.currentTenant?.id, setAgent, activeThreadId, user?.id]);

  const value = useMemo<AuroraContextValue>(() => ({
    open, setOpen, toggle,
    agent, setAgent,
    mode, setMode,
    messages, status, lastError,
    send, clear,
  }), [open, toggle, agent, setAgent, mode, setMode, messages, status, lastError, send, clear]);

  return <AuroraContext.Provider value={value}>{children}</AuroraContext.Provider>;
};

export function useAurora(): AuroraContextValue {
  const ctx = useContext(AuroraContext);
  if (!ctx) throw new Error('useAurora must be used inside <AuroraProvider>');
  return ctx;
}

function openerFor(a: AgentSlug): string {
  if (a === 'atlas')  return 'Hola. Decime qué necesitás y te paso con quien lo lleva.';
  if (a === 'solara') return `${auroraAgents.solara.display_name}. ¿Qué movemos del pipeline?`;
  if (a === 'marina') return `${auroraAgents.marina.display_name}. Decime qué número querés ver.`;
  if (a === 'nova')   return `${auroraAgents.nova.display_name}. Ventana y métrica, dale.`;
  if (a === 'lumen')  return `${auroraAgents.lumen.display_name}. ¿Querés revisar ICPs, packages o ver drift?`;
  if (a === 'vega')   return `${auroraAgents.vega.display_name}. Voice + canal + ICP — pedime drafts o cadence.`;
  if (a === 'orion')  return `${auroraAgents.orion.display_name}. Buenos días. Qué cambió overnight y qué movemos hoy.`;
  if (a === 'iris')   return `${auroraAgents.iris.display_name}. Decime el cliente y el framework — armo todo (project + tasks + invoice).`;
  if (a === 'halo')   return `${auroraAgents.halo.display_name}. 12 mensajes nuevos. ¿Triage por VIP, patrón repetido, o draft de respuesta?`;
  if (a === 'cobra')  return `${auroraAgents.cobra.display_name}. 4 retainers — 1 en rojo. ¿Veamos health, churn risk o expansion?`;
  if (a === 'selva')  return `${auroraAgents.selva.display_name}. Lucía al 110% por 3 semanas. ¿Vemos capacity, hire window o burnout signals?`;
  if (a === 'rune')   return `${auroraAgents.rune.display_name}. Pulse Studio está 22% abajo de market. ¿Pricing, tier psych o conversion?`;
  if (a === 'echo')   return `${auroraAgents.echo.display_name}. 8 partners dormidos +60d. ¿Top performers, re-engagement, attribution?`;
  if (a === 'pulse')  return `${auroraAgents.pulse.display_name}. 1 tenant en riesgo de churn — ventana cierra en 10d. ¿Veamos?`;
  // ── livv OS openers (studio level — founder only) ─────────────────
  if (a === 'norte')   return `${auroraAgents.norte.display_name}. ¿Empezamos por el daily brief o vamos a algo puntual?`;
  if (a === 'tesoro')  return `${auroraAgents.tesoro.display_name}. Runway, burn, AI cost — ¿qué número querés ver?`;
  if (a === 'pulso')   return `${auroraAgents.pulso.display_name}. Portfolio snapshot listo. ¿Vemos health score o stats por producto?`;
  if (a === 'memoria') return `${auroraAgents.memoria.display_name}. ¿Buscamos una lección de Payper, registramos una nueva, o arrancamos el journal del día?`;
  if (a === 'cumbre')  return `${auroraAgents.cumbre.display_name}. ¿Boston matrix, simulación de escenario, o stress test?`;
  if (a === 'forja')   return `${auroraAgents.forja.display_name}. Infra health, deploys, o concentración de AI provider — ¿qué mirás?`;
  if (a === 'trazo')   return `${auroraAgents.trazo.display_name}. Voice del studio, critique de mockup, o asset audit?`;
  if (a === 'ola')     return `${auroraAgents.ola.display_name}. Tenés algo que valga la pena contar afuera. ¿Te armo un hilo o newsletter?`;
  if (a === 'raiz')    return `${auroraAgents.raiz.display_name}. Equipo = ${'1'} hoy. ¿Vemos signals de hire o armamos una JD?`;
  if (a === 'brujula') return `${auroraAgents.brujula.display_name}. ¿Adyacencias verticales, partners dormidos, o exploramos algo nuevo?`;
  return 'Hola.';
}

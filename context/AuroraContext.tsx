// AuroraContext — multi-agent chat state (Solara / Marina / Nova + Atlas router).
// Follows the same provider pattern as the other 12 contexts in Livv.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentSlug, AgentResponse, AuroraMessage, AuroraMode, Canvas } from '../types/aurora';
import { auroraAgents } from '../lib/aurora/tokens';
import { auroraMockRespond } from '../lib/aurora/mockBackend';
import { supabase } from '../lib/supabase';
import { useTenant } from './TenantContext';

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
// Set VITE_AURORA_LIVE=true once the edge fn is deployed AND ANTHROPIC_API_KEY is set as a Supabase secret.
const LIVE = ((import.meta as any).env?.VITE_AURORA_LIVE === 'true');

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'm_' + Math.random().toString(36).slice(2);
}

export const AuroraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // AuroraProvider is mounted deep in the stack inside TenantProvider — useTenant is always available.
  const tenantCtx = useTenant();

  const [open, setOpen] = useState(false);
  const [agent, setAgentState] = useState<AgentSlug>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY_AGENT);
      const valid: AgentSlug[] = ['atlas', 'solara', 'marina', 'nova', 'lumen', 'vega', 'orion', 'iris'];
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
        const { data, error } = await supabase.functions.invoke<AgentResponse>('aurora-chat', {
          body: {
            agent: targetAgent,
            message: trimmed,
            tenant_id: tenantCtx?.currentTenant?.id ?? null,
          },
        });
        if (error || !data) throw new Error(error?.message || 'aurora-chat empty response');
        response = data;
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
  }, [agent, tenantCtx?.currentTenant?.id, setAgent]);

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
  return 'Hola.';
}

// AuroraDock — the right-side chat dock that opens from AuroraFab.

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Eraser } from 'lucide-react';
import { useAurora } from '../../context/AuroraContext';
import { auroraAgents, cssVarsForAgent } from '../../lib/aurora/tokens';
import { auroraRegistry, livvStudioRegistry } from '../../lib/aurora/agents';
import type { AgentSlug, AgentMeta } from '../../types/aurora';
import { AuroraCanvas } from './AuroraCanvas';
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin';
import { AgentPopover } from './AgentPopover';

export const AuroraDock: React.FC = () => {
  const { open, setOpen, agent, setAgent, mode, setMode, messages, status, send, clear } = useAurora();
  const [input, setInput] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  // Gate the livv OS agents (Norte/Tesoro/Pulso/Memoria) to founders only.
  // Server-side guard also blocks non-admins, but hiding the chips avoids
  // confusion for tenant users who would just get 403s.
  const { isPlatformAdmin } = usePlatformAdmin();

  // Auto-scroll on new messages
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  if (!open) return null;
  const meta = auroraAgents[agent];

  return (
    <motion.aside
      initial={{ x: 480, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 480, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={cssVarsForAgent(agent)}
      className="fixed top-0 right-0 h-screen w-full sm:w-[440px] z-[60] bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <header className="px-5 py-4 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800">
        <div
          className="w-8 h-8 rounded-full flex-shrink-0"
          style={{ background: 'var(--aurora-accent)', boxShadow: '0 0 0 4px var(--aurora-accent-soft)' }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {mode === 'unified' ? 'Livv Assistant' : meta.display_name}
          </div>
          <div className="text-xs text-zinc-500 truncate">
            {mode === 'unified' ? 'Todo en uno' : meta.tagline}
          </div>
        </div>
        <button
          onClick={clear}
          aria-label="Limpiar chat"
          title="Limpiar chat"
          className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
        >
          <Eraser size={16} />
        </button>
        <button
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
        >
          <X size={18} />
        </button>
      </header>

      {/* Agent switcher (only in multi mode) */}
      {mode === 'multi' && (
        <div className="px-5 py-2.5 flex flex-col gap-1.5 border-b border-zinc-100 dark:border-zinc-900">
          {/* Aurora chips — product-level agents (always visible) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {auroraRegistry.map(a => (
              <AgentChip
                key={a.slug}
                agent={a}
                active={a.slug === agent}
                onClick={() => setAgent(a.slug as AgentSlug)}
                onExamplePick={(prompt) => { setInput(prompt); setAgent(a.slug as AgentSlug); }}
              />
            ))}
            <div className="ml-auto">
              <button
                onClick={() => setMode(mode === 'multi' ? 'unified' : 'multi')}
                className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                title="Cambiar entre multi y unificado"
              >
                modo: {mode}
              </button>
            </div>
          </div>
          {/* livv OS chips — studio-level agents (founder only) */}
          {isPlatformAdmin && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-zinc-100 dark:border-zinc-900">
              <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-400 mr-1">livv OS</span>
              {livvStudioRegistry.map(a => (
                <AgentChip
                  key={a.slug}
                  agent={a}
                  active={a.slug === agent}
                  onClick={() => setAgent(a.slug as AgentSlug)}
                  onExamplePick={(prompt) => { setInput(prompt); setAgent(a.slug as AgentSlug); }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {mode === 'unified' && (
        <div className="px-5 py-1.5 border-b border-zinc-100 dark:border-zinc-900 flex justify-end">
          <button
            onClick={() => setMode('multi')}
            className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            modo: unified
          </button>
        </div>
      )}

      {/* Body */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-zinc-500">
            <div className="mb-3">{openerFor(agent)}</div>
            <div className="text-xs text-zinc-400">Sugerencias:</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chipsFor(agent).map(c => (
                <button
                  key={c}
                  onClick={() => { setInput(c); void send(c); }}
                  className="px-2.5 py-1 text-xs rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:opacity-80"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'user' ? (
              <div
                className="max-w-[85%] px-3.5 py-2 rounded-2xl text-sm"
                style={{ background: 'var(--aurora-accent-soft)', color: 'var(--aurora-accent-text)' }}
              >{m.text}</div>
            ) : (
              <div className="max-w-[92%] space-y-2" style={m.agent ? cssVarsForAgent(m.agent) : undefined}>
                {m.text && (
                  <div className="px-3.5 py-2 rounded-2xl text-sm bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                    {m.text}
                  </div>
                )}
                {m.canvas && <AuroraCanvas canvas={m.canvas} />}
              </div>
            )}
          </div>
        ))}
        {status === 'sending' && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--aurora-accent)' }} />
            pensando…
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2"
        onSubmit={e => { e.preventDefault(); const t = input; setInput(''); void send(t); }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`Escribile a ${mode === 'unified' ? 'Livv' : meta.display_name}...`}
          className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-offset-0"
          style={{ outlineColor: 'var(--aurora-accent)' as any }}
          disabled={status === 'sending'}
        />
        <button
          type="submit"
          disabled={status === 'sending' || !input.trim()}
          className="px-3 py-2 rounded-lg text-white disabled:opacity-40"
          style={{ background: 'var(--aurora-accent)' }}
          aria-label="Enviar"
        >
          <Send size={16} />
        </button>
      </form>
    </motion.aside>
  );
};

function openerFor(a: AgentSlug): string {
  if (a === 'solara') return 'Solara. ¿Qué movemos del pipeline?';
  if (a === 'marina') return 'Marina. Decime qué número querés ver.';
  if (a === 'nova')   return 'Nova. Decime ventana y métrica.';
  if (a === 'lumen')  return 'Lumen. ¿Revisamos ICPs, packages o drift?';
  if (a === 'vega')   return 'Vega. Voice + canal + ICP — pedime drafts.';
  if (a === 'orion')  return 'Orion. Buenos días. ¿Qué movemos hoy?';
  if (a === 'iris')   return 'Iris. Decime cliente + framework — armo todo.';
  if (a === 'halo')   return 'Halo. 12 mensajes — 1 hot. ¿Triage?';
  if (a === 'cobra')  return 'Cobra. 4 retainers, 1 rojo. ¿Health o expansion?';
  if (a === 'selva')  return 'Selva. Lucía al 110% por 3 semanas. ¿Capacity?';
  if (a === 'rune')   return 'Rune. Pulse Studio -22% vs market. ¿Pricing?';
  if (a === 'echo')   return 'Echo. 8 partners dormidos. ¿Re-engagement?';
  if (a === 'pulse')  return 'Pulse. 1 tenant en riesgo. ¿Veamos?';
  return 'Atlas. Decime qué necesitás y te paso con quien lo lleva.';
}

function chipsFor(a: AgentSlug): string[] {
  if (a === 'solara') return [
    '¿Cómo está mi pipeline?',
    '¿Qué tengo stale esta semana?',
    'Draftéame un follow-up para Martín',
  ];
  if (a === 'marina') return [
    '¿Cómo va mi mes?',
    'AR aging',
    'Cobremos a Lucía',
  ];
  if (a === 'nova') return [
    'Mostrame el funnel',
    '¿De dónde vienen los leads?',
    'Forecast del trimestre',
  ];
  if (a === 'lumen') return [
    'Mostrame los ICPs',
    'Hay drift en la estrategia?',
    'Top principio de positioning',
  ];
  if (a === 'vega') return [
    'Cómo va la cadencia?',
    'Drafteame 3 variantes para LinkedIn',
    'Qué repurpose tengo?',
  ];
  if (a === 'orion') return [
    'Catch me up — qué cambió overnight',
    'Plan del día',
    'Qué está blocked?',
    'Workload de la semana',
  ];
  if (a === 'iris') return [
    'Mostrame los frameworks',
    'Usar Positioning Sprint con Mulberry',
    'Editar prompt de Outreach generator',
  ];
  if (a === 'halo') return [
    'Qué tengo en el inbox',
    'Patrones repetidos esta semana',
    'Draft de respuesta para Mulberry',
    'VIPs sin tocar hace +7 días',
  ];
  if (a === 'cobra') return [
    'Salud de los retainers',
    'Quién está en riesgo de churn?',
    'Señales de expansion',
    'Touchpoint gaps',
  ];
  if (a === 'selva') return [
    'Capacity del team esta semana',
    'Hay burnout signals?',
    'Cuándo hire?',
    'Comp benchmark para Designer',
  ];
  if (a === 'rune') return [
    'Pulse está bien priced?',
    'Distribución de tiers',
    'Top sellers',
    'Quién está embedeando?',
  ];
  if (a === 'echo') return [
    'Quién es mi top partner?',
    'Partners dormidos',
    'Cómo va la attribution?',
    'Payouts pendientes',
  ];
  if (a === 'pulse') return [
    'Tenants en riesgo de churn',
    'Señales de expansion',
    'Onboarding health',
    'Platform stats — cómo va?',
  ];
  return ['Mostrame el pipeline', 'AR aging', 'Funnel', 'Plan del día'];
}

// ─────────────────────────────────────────────────────────────────────
// AgentChip — chip individual con hover popover.
// El popover muestra: pitch marketinero + tagline + dominio + 3-4
// example prompts clickables que prefill el input del chat.
// ─────────────────────────────────────────────────────────────────────
const AgentChip: React.FC<{
  agent: AgentMeta;
  active: boolean;
  onClick: () => void;
  onExamplePick: (prompt: string) => void;
}> = ({ agent, active, onClick, onExamplePick }) => {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        onClick={onClick}
        className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
          active
            ? 'text-white border-transparent'
            : 'text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900'
        }`}
        style={active ? { background: agent.accent_hex } : undefined}
      >
        {agent.display_name}
      </button>
      <AgentPopover agent={agent} anchorRef={ref} onExamplePick={onExamplePick} />
    </>
  );
};

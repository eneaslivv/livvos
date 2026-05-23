// AuroraDock — chat dock con jerarquía clara.
//
// v3 (2026-05-22): rediseño completo tras feedback del user — antes era un
// sopa de 23 chips sin contexto. Ahora:
//   • Header con AGENT ACTIVO destacado: avatar grande, name, domain.
//   • Botón "Cambiar" que abre un picker categorizado (no 23 chips siempre
//     visibles). Categorías: Operativo / Sales & Growth / Strategy & Content /
//     Team & Platform / Livv Studio (founder-only).
//   • Welcome state visual: opener del agent + 3-4 quick prompts como
//     buttons grandes con flecha, no chips.
//   • Composer con icon más prominente.
//   • Se removió el toggle críptico "modo: multi/unified" — siempre multi.

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Eraser, ChevronDown, Sparkles, ArrowRight } from 'lucide-react';
import { useAurora } from '../../context/AuroraContext';
import { auroraAgents, cssVarsForAgent } from '../../lib/aurora/tokens';
import { auroraRegistry, livvStudioRegistry } from '../../lib/aurora/agents';
import type { AgentSlug, AgentMeta } from '../../types/aurora';
import { AuroraCanvas } from './AuroraCanvas';
import { usePlatformAdmin } from '../../hooks/usePlatformAdmin';

// Category metadata for the agent picker. Groups the 24 agents into 5
// human-readable buckets so users can find what they need without scanning.
interface CategoryDef {
  id: string;
  label: string;
  desc: string;
  slugs: string[];
}

const AURORA_CATEGORIES: CategoryDef[] = [
  {
    id: 'daily',
    label: 'Día a día',
    desc: 'Brief, inbox, foco.',
    slugs: ['orion', 'halo', 'marina'],
  },
  {
    id: 'sales',
    label: 'Sales & Growth',
    desc: 'Pipeline, clientes, funnel.',
    slugs: ['solara', 'cobra', 'nova'],
  },
  {
    id: 'strategy',
    label: 'Strategy & Content',
    desc: 'ICPs, voz, frameworks.',
    slugs: ['lumen', 'vega', 'iris'],
  },
  {
    id: 'platform',
    label: 'Team & Platform',
    desc: 'Equipo, pricing, partners.',
    slugs: ['selva', 'rune', 'echo', 'pulse'],
  },
];

const LIVV_OS_CATEGORY: CategoryDef = {
  id: 'studio',
  label: 'Livv Studio',
  desc: 'Founder-level · decisiones, finanzas, lessons.',
  slugs: ['norte', 'tesoro', 'pulso', 'memoria', 'cumbre', 'forja', 'trazo', 'ola', 'raiz', 'brujula'],
};

export const AuroraDock: React.FC = () => {
  const { open, setOpen, agent, setAgent, messages, status, send, clear } = useAurora();
  const [input, setInput] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { isPlatformAdmin } = usePlatformAdmin();

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  if (!open) return null;
  const meta = auroraAgents[agent];

  const switchAgent = (slug: AgentSlug) => {
    setAgent(slug);
    setPickerOpen(false);
  };

  return (
    <motion.aside
      initial={{ x: 480, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 480, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      style={cssVarsForAgent(agent)}
      className="fixed top-0 right-0 h-screen w-full sm:w-[460px] z-[60] bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col"
    >
      {/* Header — agent activo destacado */}
      <header
        className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 relative"
        style={{
          backgroundImage: `linear-gradient(135deg, var(--aurora-accent-soft) 0%, transparent 80%)`,
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-base font-semibold shrink-0 shadow-sm"
            style={{
              background: `linear-gradient(135deg, var(--aurora-accent) 0%, var(--aurora-accent-text) 120%)`,
            }}
          >
            {meta.display_name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {meta.display_name}
              </span>
              <button
                onClick={() => setPickerOpen(o => !o)}
                className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-1.5 py-0.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Cambiar agente"
              >
                Cambiar
                <ChevronDown size={10} className={`transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div className="text-[11.5px] text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5 line-clamp-2">
              {meta.domain || meta.tagline}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={clear}
              aria-label="Limpiar chat"
              title="Limpiar chat"
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors"
            >
              <Eraser size={14} />
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Agent picker — collapsible, organized by category */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60"
          >
            <div className="px-4 py-3 space-y-3 max-h-[55vh] overflow-y-auto">
              {AURORA_CATEGORIES.map(cat => (
                <CategoryGroup
                  key={cat.id}
                  category={cat}
                  activeSlug={agent}
                  onPick={switchAgent}
                  allAgents={auroraRegistry}
                />
              ))}
              {isPlatformAdmin && (
                <CategoryGroup
                  category={LIVV_OS_CATEGORY}
                  activeSlug={agent}
                  onPick={switchAgent}
                  allAgents={livvStudioRegistry}
                  founderOnly
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <WelcomeState
            agent={agent}
            meta={meta}
            onSend={(prompt) => { setInput(prompt); void send(prompt); }}
          />
        ) : (
          <div className="space-y-3">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'user' ? (
                  <div
                    className="max-w-[85%] px-3.5 py-2 rounded-2xl text-[13px] leading-snug"
                    style={{ background: 'var(--aurora-accent-soft)', color: 'var(--aurora-accent-text)' }}
                  >{m.text}</div>
                ) : (
                  <div className="max-w-[92%] space-y-2" style={m.agent ? cssVarsForAgent(m.agent) : undefined}>
                    {m.text && (
                      <div className="px-3.5 py-2 rounded-2xl text-[13px] leading-snug bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                        {m.text}
                      </div>
                    )}
                    {m.canvas && <AuroraCanvas canvas={m.canvas} />}
                  </div>
                )}
              </div>
            ))}
            {status === 'sending' && (
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--aurora-accent)' }} />
                pensando…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2 bg-white dark:bg-zinc-950"
        onSubmit={e => { e.preventDefault(); const t = input; setInput(''); void send(t); }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`Escribile a ${meta.display_name}…`}
          className="flex-1 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-offset-0"
          style={{ outlineColor: 'var(--aurora-accent)' as any }}
          disabled={status === 'sending'}
        />
        <button
          type="submit"
          disabled={status === 'sending' || !input.trim()}
          className="px-3 py-2 rounded-xl text-white disabled:opacity-30 transition-opacity"
          style={{ background: 'var(--aurora-accent)' }}
          aria-label="Enviar"
        >
          <Send size={14} />
        </button>
      </form>
    </motion.aside>
  );
};

// ─────────────────────────────────────────────────────────────────────
// WelcomeState — primer view del chat con opener + quick prompts BIG.
// ─────────────────────────────────────────────────────────────────────
const WelcomeState: React.FC<{
  agent: AgentSlug;
  meta: AgentMeta;
  onSend: (prompt: string) => void;
}> = ({ agent, meta, onSend }) => {
  const prompts = chipsFor(agent);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5">
        <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--aurora-accent)' }} />
        <p className="text-[13px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
          {openerFor(agent)}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-zinc-400 px-1">
          Probá con
        </div>
        {prompts.slice(0, 4).map(p => (
          <button
            key={p}
            onClick={() => onSend(p)}
            className="group w-full text-left px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-transparent hover:shadow-sm transition-all flex items-center gap-2.5"
            style={{
              ['--hover-bg' as any]: 'var(--aurora-accent-soft)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--aurora-accent-soft)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
          >
            <span className="flex-1 text-[12.5px] text-zinc-800 dark:text-zinc-200 leading-snug">
              {p}
            </span>
            <ArrowRight
              size={12}
              className="text-zinc-300 dark:text-zinc-600 group-hover:text-[var(--aurora-accent)] transition-colors shrink-0"
            />
          </button>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// CategoryGroup — bucket de agentes con label + desc + chips compactos.
// ─────────────────────────────────────────────────────────────────────
const CategoryGroup: React.FC<{
  category: CategoryDef;
  activeSlug: AgentSlug;
  onPick: (slug: AgentSlug) => void;
  allAgents: AgentMeta[];
  founderOnly?: boolean;
}> = ({ category, activeSlug, onPick, allAgents, founderOnly }) => {
  const agents = category.slugs
    .map(s => allAgents.find(a => a.slug === s))
    .filter(Boolean) as AgentMeta[];
  if (agents.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5 px-0.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600 dark:text-zinc-300">
          {category.label}
          {founderOnly && (
            <span className="ml-1.5 text-[8.5px] font-medium normal-case tracking-normal text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1 py-0.5 rounded">
              founder
            </span>
          )}
        </span>
        <span className="text-[10px] text-zinc-400">{category.desc}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {agents.map(a => {
          const active = a.slug === activeSlug;
          return (
            <button
              key={a.slug}
              onClick={() => onPick(a.slug)}
              className={`px-2.5 py-1 text-[11.5px] font-medium rounded-full border transition-all ${
                active
                  ? 'text-white border-transparent shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600'
              }`}
              style={active ? { background: a.accent_hex } : undefined}
              title={a.tagline}
            >
              {a.display_name}
            </button>
          );
        })}
      </div>
    </div>
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

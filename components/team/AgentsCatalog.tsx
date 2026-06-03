/**
 * AgentsCatalog — surfaces the AI agents defined in the agent registry
 * (lib/agents/registry) on the Team → Agents tab: what each agent does, its
 * skills/actions (read vs write), what triggers it, and its full knowledge
 * (system prompt) on demand. This is the "what can the AI actually do" audit
 * surface the user asked for.
 */
import React, { useState } from 'react';
import { Icons } from '../ui/Icons';
import { AGENTS } from '../../lib/agents/registry';

const DOMAIN_ICON: Record<string, React.ReactNode> = {
  tasks:      <Icons.SquareCheck size={18} />,
  finance:    <Icons.DollarSign size={18} />,
  calendar:   <Icons.Calendar size={18} />,
  clients:    <Icons.Users size={18} />,
  projects:   <Icons.Briefcase size={18} />,
  inbox:      <Icons.Mail size={18} />,
  onboarding: <Icons.Sparkles size={18} />,
};

const BLURB: Record<string, string> = {
  'tasks-agent':      'Prioriza y gestiona tareas: triage por urgencia, vencimientos, crear / mover / cerrar.',
  'finance-agent':    'Finanzas del negocio: ingresos, gastos, cobranzas, márgenes y proyección de caja.',
  'calendar-agent':   'Agenda: próximos eventos, disponibilidad, crear y mover reuniones.',
  'clients-agent':    'CRM: contexto de clientes, historial, contactos y oportunidades.',
  'projects-agent':   'Proyectos: estado, fases, equipo, presupuesto y avance.',
  'inbox-agent':      'Comunicaciones (Gmail + Slack): resume, prioriza y ayuda a responder.',
  'onboarding-agent': 'Onboarding guiado: alta de clientes, proyectos y tareas paso a paso.',
};

// Some agent prompt strings were stored with UTF-8 mojibake (â€" Â· Ã©…).
// Repair the common sequences just for display.
const clean = (s: string): string =>
  (s || '')
    .replace(/â€"/g, '—').replace(/â€“/g, '–').replace(/â€™/g, '’')
    .replace(/â€œ/g, '“').replace(/â€/g, '”').replace(/Â·/g, '·')
    .replace(/Ã©/g, 'é').replace(/Ã³/g, 'ó').replace(/Ã­/g, 'í').replace(/Ã¡/g, 'á')
    .replace(/Ãº/g, 'ú').replace(/Ã±/g, 'ñ').replace(/Â¿/g, '¿').replace(/Â¡/g, '¡');

export const AgentsCatalog: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  const totalSkills = AGENTS.reduce((n, a) => n + a.skills.length, 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI Agents</h3>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {AGENTS.length} activos · {totalSkills} acciones
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {AGENTS.map(a => {
          const writes = a.skills.filter(s => s.kind === 'write').length;
          const reads = a.skills.length - writes;
          const isOpen = openId === a.id;
          const blurb = BLURB[a.id] || clean(a.systemPrompt.split('\n').find(l => l.trim()) || '');
          return (
            <div key={a.id} className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shrink-0">
                  {DOMAIN_ICON[a.domain] || <Icons.Bot size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{a.name}</h4>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
                      {a.domain}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 ml-auto">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> activo
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">{blurb}</p>
                </div>
              </div>

              {/* Counts */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">{a.skills.length} skills</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">{reads} lectura</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">{writes} acción</span>
              </div>

              {/* Skills / actions */}
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">Acciones / skills</div>
                <ul className="space-y-1.5">
                  {a.skills.map(s => (
                    <li key={s.id} className="flex items-start gap-2">
                      <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${s.kind === 'write' ? 'bg-amber-500' : 'bg-sky-400'}`} title={s.kind} />
                      <span className="flex-1 min-w-0">
                        <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">{s.id}</span>
                        <span className="block text-[12px] text-zinc-600 dark:text-zinc-300 leading-snug">{clean(s.description)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Triggers */}
              {a.routingHints && a.routingHints.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">Se activa con</div>
                  <div className="flex flex-wrap gap-1">
                    {a.routingHints.slice(0, 10).map((h, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-md text-[10px] bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-800">{clean(h)}</span>
                    ))}
                    {a.routingHints.length > 10 && (
                      <span className="text-[10px] text-zinc-400 self-center">+{a.routingHints.length - 10}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Knowledge / instructions */}
              <button
                onClick={() => setOpenId(isOpen ? null : a.id)}
                className="mt-3 text-[11px] font-medium text-violet-600 dark:text-violet-400 inline-flex items-center gap-1 hover:underline"
              >
                <Icons.ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                {isOpen ? 'Ocultar' : 'Ver'} knowledge / instrucciones
              </button>
              {isOpen && (
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg p-3 border border-zinc-100 dark:border-zinc-800 font-sans">
                  {clean(a.systemPrompt)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

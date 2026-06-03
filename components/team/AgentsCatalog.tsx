/**
 * AgentsCatalog — the AI agents the workspace runs, surfaced on Team → Agents.
 *
 *  • Core agents (lib/agents/registry): domain skills with read/write actions,
 *    triggers, and full knowledge/instructions. EDITABLE — extra instructions
 *    + enable/disable skills, persisted to agent_overrides (applied live by the
 *    orchestrator via lib/agents/overrides).
 *  • Aurora agents (lib/aurora): the conversational specialists with their pitch.
 *  • Per-agent usage metrics (agent_conversations): turns + last activity.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../ui/Icons';
import { AGENTS } from '../../lib/agents/registry';
import { invalidateOverridesCache } from '../../lib/agents/overrides';
import { auroraRegistry } from '../../lib/aurora/agents';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

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
const clean = (s: string): string =>
  (s || '')
    .replace(/â€"/g, '—').replace(/â€“/g, '–').replace(/â€™/g, '’')
    .replace(/â€œ/g, '“').replace(/â€/g, '”').replace(/Â·/g, '·')
    .replace(/Ã©/g, 'é').replace(/Ã³/g, 'ó').replace(/Ã­/g, 'í').replace(/Ã¡/g, 'á')
    .replace(/Ãº/g, 'ú').replace(/Ã±/g, 'ñ').replace(/Â¿/g, '¿').replace(/Â¡/g, '¡');

const relativeEs = (iso?: string | null): string => {
  if (!iso) return '';
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(diffMin)) return '';
  if (diffMin < 1) return 'recién';
  if (diffMin < 60) return `hace ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

interface Usage { count: number; last: string }
interface OverrideState { prompt_suffix: string | null; disabled_skills: string[] }

const UsageChip: React.FC<{ usage?: Usage }> = ({ usage }) => {
  if (!usage || usage.count === 0) return <span className="text-[10px] text-zinc-400 dark:text-zinc-500">sin uso (90d)</span>;
  return (
    <span className="inline-flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
      <span className="inline-flex items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-200">
        <Icons.Activity size={10} /> {usage.count} {usage.count === 1 ? 'uso' : 'usos'}
      </span>
      <span>· última {relativeEs(usage.last)}</span>
    </span>
  );
};

export const AgentsCatalog: React.FC = () => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const tenantId = currentTenant?.id || null;

  const [openId, setOpenId] = useState<string | null>(null);
  const [usage, setUsage] = useState<Record<string, Usage>>({});
  const [overrides, setOverrides] = useState<Record<string, OverrideState>>({});

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftSuffix, setDraftSuffix] = useState('');
  const [draftDisabled, setDraftDisabled] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Usage (last 90 days) from the conversation log.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 90 * 86400000).toISOString();
        const { data } = await supabase.from('agent_conversations')
          .select('agent_id, created_at').eq('tenant_id', tenantId)
          .gte('created_at', since).order('created_at', { ascending: false }).limit(5000);
        if (cancelled || !data) return;
        const agg: Record<string, Usage> = {};
        for (const r of data as any[]) {
          const id = String(r.agent_id || 'unknown');
          if (!agg[id]) agg[id] = { count: 0, last: r.created_at };
          agg[id].count += 1;
          if (r.created_at > agg[id].last) agg[id].last = r.created_at;
        }
        setUsage(agg);
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  // Active overrides (tenant edits) so the catalog reflects custom instructions
  // + disabled skills.
  const loadOverrides = React.useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data } = await supabase.from('agent_overrides')
        .select('agent_id, prompt_suffix, disabled_skills')
        .eq('tenant_id', tenantId).eq('status', 'active');
      const map: Record<string, OverrideState> = {};
      for (const r of (data || []) as any[]) {
        map[r.agent_id] = {
          prompt_suffix: r.prompt_suffix || null,
          disabled_skills: Array.isArray(r.disabled_skills) ? r.disabled_skills : [],
        };
      }
      setOverrides(map);
    } catch { /* best-effort */ }
  }, [tenantId]);

  useEffect(() => { void loadOverrides(); }, [loadOverrides]);

  const startEdit = (agentId: string) => {
    const ov = overrides[agentId];
    setDraftSuffix(ov?.prompt_suffix || '');
    setDraftDisabled(new Set(ov?.disabled_skills || []));
    setSaveError(null);
    setEditingId(agentId);
  };

  const toggleSkill = (skillId: string) => {
    setDraftDisabled(prev => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId); else next.add(skillId);
      return next;
    });
  };

  const saveEdit = async (agentId: string) => {
    if (!tenantId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        prompt_suffix: draftSuffix.trim() || null,
        disabled_skills: Array.from(draftDisabled),
        auto_applied: false,
        applied_at: new Date().toISOString(),
        applied_by: user?.id ?? null,
      };
      const { data: existing } = await supabase.from('agent_overrides')
        .select('id').eq('tenant_id', tenantId).eq('agent_id', agentId).eq('status', 'active').limit(1);
      if (existing && existing.length > 0) {
        const { error } = await supabase.from('agent_overrides').update(payload).eq('id', (existing[0] as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('agent_overrides').insert({
          tenant_id: tenantId, agent_id: agentId, status: 'active',
          routing_hints_add: [], routing_hints_remove: [], skill_overrides: {},
          rationale: 'Edited from Agents catalog',
          proposed_at: new Date().toISOString(),
          ...payload,
        });
        if (error) throw error;
      }
      invalidateOverridesCache(tenantId);
      setOverrides(prev => ({ ...prev, [agentId]: { prompt_suffix: payload.prompt_suffix, disabled_skills: payload.disabled_skills } }));
      setEditingId(null);
    } catch (e: any) {
      setSaveError(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const totalSkills = useMemo(() => AGENTS.reduce((n, a) => n + a.skills.length, 0), []);

  return (
    <div className="space-y-6">
      {/* ── Core agents ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Core agents</h3>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{AGENTS.length} activos · {totalSkills} acciones</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {AGENTS.map(a => {
            const ov = overrides[a.id];
            const disabledSet = new Set(ov?.disabled_skills || []);
            const writes = a.skills.filter(s => s.kind === 'write').length;
            const reads = a.skills.length - writes;
            const isOpen = openId === a.id;
            const isEditing = editingId === a.id;
            const blurb = BLURB[a.id] || clean(a.systemPrompt.split('\n').find(l => l.trim()) || '');
            return (
              <div key={a.id} className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shrink-0">
                    {DOMAIN_ICON[a.domain] || <Icons.Bot size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{a.name}</h4>
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">{a.domain}</span>
                      {(ov?.prompt_suffix || disabledSet.size > 0) && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">personalizado</span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 ml-auto"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> activo</span>
                    </div>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">{blurb}</p>
                    <div className="mt-1.5"><UsageChip usage={usage[a.id]} /></div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">{a.skills.length - disabledSet.size}/{a.skills.length} skills on</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">{reads} lectura</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">{writes} acción</span>
                </div>

                {/* Skills (disabled ones struck through) */}
                <div className="mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">Acciones / skills</div>
                  <ul className="space-y-1.5">
                    {a.skills.map(s => {
                      const off = disabledSet.has(s.id);
                      return (
                        <li key={s.id} className={`flex items-start gap-2 ${off ? 'opacity-45' : ''}`}>
                          <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${off ? 'bg-zinc-300 dark:bg-zinc-600' : s.kind === 'write' ? 'bg-amber-500' : 'bg-sky-400'}`} title={off ? 'desactivado' : s.kind} />
                          <span className="flex-1 min-w-0">
                            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">{s.id}{off && ' · off'}</span>
                            <span className={`block text-[12px] leading-snug ${off ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-600 dark:text-zinc-300'}`}>{clean(s.description)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Custom instructions preview */}
                {ov?.prompt_suffix && !isEditing && (
                  <div className="mt-3 rounded-lg bg-amber-50/60 dark:bg-amber-500/5 border border-amber-200/60 dark:border-amber-500/20 p-2.5">
                    <div className="text-[9.5px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-0.5">Instrucciones extra</div>
                    <p className="text-[11.5px] text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{ov.prompt_suffix}</p>
                  </div>
                )}

                {/* Edit panel */}
                {isEditing ? (
                  <div className="mt-3 rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50/40 dark:bg-violet-500/5 p-3 space-y-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1 block">Instrucciones extra (knowledge)</label>
                      <textarea
                        value={draftSuffix}
                        onChange={e => setDraftSuffix(e.target.value)}
                        rows={4}
                        placeholder="Guía específica para tu equipo. Se AGREGA al prompt base (nunca lo reemplaza)."
                        className="w-full text-[12px] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-2 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-400 resize-y"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1 block">Skills activas</label>
                      <div className="space-y-1">
                        {a.skills.map(s => {
                          const enabled = !draftDisabled.has(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => toggleSkill(s.id)}
                              className="w-full flex items-center gap-2 text-left py-1 px-1.5 rounded-md hover:bg-white/60 dark:hover:bg-zinc-800/40"
                            >
                              <span className={`w-8 h-[18px] rounded-full shrink-0 relative transition-colors ${enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
                                <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${enabled ? 'left-[16px]' : 'left-[2px]'}`} />
                              </span>
                              <span className="font-mono text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate">{s.id}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {saveError && <p className="text-[11px] text-rose-500">{saveError}</p>}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveEdit(a.id)}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
                      >
                        {saving ? <Icons.Loader size={12} className="animate-spin" /> : <Icons.Check size={12} />}
                        {saving ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button onClick={() => setEditingId(null)} disabled={saving} className="px-3 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-3">
                    <button onClick={() => startEdit(a.id)} className="text-[11px] font-medium text-violet-600 dark:text-violet-400 inline-flex items-center gap-1 hover:underline">
                      <Icons.Edit size={12} /> Editar
                    </button>
                    <button onClick={() => setOpenId(isOpen ? null : a.id)} className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1 hover:underline">
                      <Icons.ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      {isOpen ? 'Ocultar' : 'Ver'} knowledge
                    </button>
                  </div>
                )}
                {isOpen && !isEditing && (
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg p-3 border border-zinc-100 dark:border-zinc-800 font-sans">
                    {clean(a.systemPrompt)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Aurora specialists ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Aurora</h3>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{auroraRegistry.length} especialistas conversacionales</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {auroraRegistry.map((a: any) => (
            <div key={a.slug} className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0" style={{ background: a.accent_soft, color: a.accent_text }}>
                  {String(a.display_name || a.slug).slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{a.display_name}</h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">{a.domain}</p>
                </div>
              </div>
              {a.tagline && <p className="text-[11px] italic text-zinc-400 dark:text-zinc-500 mt-2">“{a.tagline}”</p>}
              {a.pitch && <p className="text-[12px] text-zinc-600 dark:text-zinc-300 mt-2 leading-relaxed line-clamp-4">{a.pitch}</p>}
              {Array.isArray(a.example_prompts) && a.example_prompts.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Ejemplos</div>
                  {a.example_prompts.slice(0, 3).map((p: string, i: number) => (
                    <div key={i} className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">· {p}</div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800"><UsageChip usage={usage[a.slug]} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

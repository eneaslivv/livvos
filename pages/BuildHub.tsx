/**
 * BuildHub — landing page que reemplaza 5 botones del sidebar (Strategy /
 * Content / Products / Toolkit / Scaling) por 1 solo hub.
 *
 * El razonamiento (per Eneas): "que de todo eso lo podemos simplificar
 * en menos botones o juntarlos y que pueden ser más sencillos si solo se
 * rellena en base a los objetivos y después queda mostrado como activo
 * pero solo para editar".
 *
 * Estructura:
 *
 *   1. Hero — los objetivos activos del trimestre (growth_kpis o
 *      tenant_config.okrs). Si no hay objetivos definidos, CTA para
 *      definirlos primero.
 *
 *   2. Grid de módulos (5 cards). Cada card:
 *        - Estado: configured (verde) vs empty (muted)
 *        - Métrica resumen (ej "3 ICPs definidos", "8 piezas activas")
 *        - Click → te lleva a la página existente del módulo
 *        - Una vez configurado, queda como "Editar" — no compite por
 *          atención en el sidebar.
 *
 *   3. Footer hint sobre qué módulos sugiere para qué objetivos.
 *
 * Las páginas existentes (StrategyHub, ContentEngine, Products,
 * StrategyToolkit, TeamScaling) NO se tocan — siguen siendo accesibles
 * directamente vía URL. Sólo cambia el entry point dominante.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { SPRING_ENTER } from '../lib/ui/motion';
import { errorLogger } from '../lib/errorLogger';
import type { PageView } from '../types';

interface BuildHubProps {
  onNavigate?: (page: PageView) => void;
}

interface ModuleStat {
  id: string;
  page: PageView;
  label: string;
  description: string;
  icon: keyof typeof Icons;
  accent: string;
  count: number;
  countLabel: string;
  /** Why you would activate this module — shown when empty. */
  purpose: string;
}

interface Objective {
  id: string;
  title: string;
  progress?: number | null;
  target?: number | null;
  unit?: string | null;
}

export const BuildHub: React.FC<BuildHubProps> = ({ onNavigate }) => {
  const { currentTenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [counts, setCounts] = useState({
    icps: 0,
    packages: 0,
    positioning: 0,
    brand_kits: 0,
    content_channels: 0,
    content_pieces: 0,
    products: 0,
    frameworks: 0,
    client_engagements: 0,
    team_members: 0,
    team_roles: 0,
  });

  useEffect(() => {
    if (!currentTenant?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const fetches = await Promise.all([
          supabase.from('strategy_icps').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('strategy_packages').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('strategy_positioning').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('brand_kits').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('content_channels').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('content_pieces').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('strategy_frameworks').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('client_strategy_projects').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('team_member_profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('team_role_definitions').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
          supabase.from('growth_kpis').select('id, metric_name, current_value, target_value, target_unit')
            .eq('tenant_id', currentTenant.id).limit(4),
        ]);
        if (cancelled) return;
        setCounts({
          icps:               fetches[0].count || 0,
          packages:           fetches[1].count || 0,
          positioning:        fetches[2].count || 0,
          brand_kits:         fetches[3].count || 0,
          content_channels:   fetches[4].count || 0,
          content_pieces:     fetches[5].count || 0,
          products:           fetches[6].count || 0,
          frameworks:         fetches[7].count || 0,
          client_engagements: fetches[8].count || 0,
          team_members:       fetches[9].count || 0,
          team_roles:         fetches[10].count || 0,
        });
        const kpis = (fetches[11].data || []) as any[];
        setObjectives(kpis.map(k => ({
          id: k.id,
          title: k.metric_name,
          progress: k.current_value,
          target: k.target_value,
          unit: k.target_unit,
        })));
      } catch (e) {
        errorLogger.warn('build hub fetch failed', e);
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentTenant?.id]);

  const modules: ModuleStat[] = useMemo(() => [
    {
      id: 'strategy',
      page: 'strategy_hub',
      label: 'Strategy',
      description: 'ICPs, packages, positioning principles, brand kits',
      icon: 'Target',
      accent: '#A855F7',
      count: counts.icps + counts.packages + counts.positioning + counts.brand_kits,
      countLabel: `${counts.icps} ICPs · ${counts.packages} packages · ${counts.brand_kits} brand kits`,
      purpose: 'Define a quién le vendés, qué le vendés y cómo se diferencia. Es la pieza de la que parten todas las demás.',
    },
    {
      id: 'content',
      page: 'content_engine',
      label: 'Content',
      description: 'Canales, calendario, drafts, performance',
      icon: 'Sparkles',
      accent: '#F1ADD8',
      count: counts.content_channels + counts.content_pieces,
      countLabel: `${counts.content_channels} canales · ${counts.content_pieces} piezas`,
      purpose: 'Convierte la estrategia en publicaciones consistentes. Sin esto, los ICPs no se enteran de que existís.',
    },
    {
      id: 'products',
      page: 'products',
      label: 'Products',
      description: 'Marketplace de apps, sistemas, templates',
      icon: 'Briefcase',
      accent: '#C4A35A',
      count: counts.products,
      countLabel: counts.products === 1 ? '1 producto activo' : `${counts.products} productos activos`,
      purpose: 'Productizá lo que ya entregaste antes. Vende mientras dormís — apps, systems, templates con Stripe.',
    },
    {
      id: 'toolkit',
      page: 'strategy_toolkit',
      label: 'Toolkit',
      description: 'Frameworks productizados + engagements activos',
      icon: 'Briefcase',
      accent: '#0F766E',
      count: counts.frameworks + counts.client_engagements,
      countLabel: `${counts.frameworks} frameworks · ${counts.client_engagements} engagements`,
      purpose: 'Tomá tus frameworks internos y vendelos como engagements con horas + entregables claros.',
    },
    {
      id: 'scaling',
      page: 'team_scaling',
      label: 'Scaling',
      description: 'Roles, personas, roadmap de contratación, KPIs',
      icon: 'Users',
      accent: '#15803D',
      count: counts.team_members + counts.team_roles,
      countLabel: `${counts.team_members} personas · ${counts.team_roles} roles`,
      purpose: 'Cuándo y a quién contratar para que dejes de ser el bottleneck. Roadmap 12 meses + cost tracker.',
    },
  ], [counts]);

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-6">
      {/* Page header */}
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
            Workspace
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">
            Build
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-xl">
            Los cimientos del negocio. Configurá una vez, editás cuando cambia. Cada módulo
            es opcional — activá lo que tu objetivo del trimestre necesita.
          </p>
        </div>
      </header>

      {/* Objectives hero — KPIs si están definidos */}
      <section className="mb-7 p-5 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-gradient-to-br from-amber-50/40 via-white to-emerald-50/30 dark:from-amber-950/10 dark:via-zinc-900 dark:to-emerald-950/10">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300 inline-flex items-center gap-1.5 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Objetivos del trimestre
        </div>
        {loading ? (
          <div className="text-[12.5px] text-zinc-400">Cargando…</div>
        ) : objectives.length === 0 ? (
          <div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-2.5 max-w-xl">
              Todavía no definiste objetivos. Cuando agregues KPIs en Growth → North-star metrics,
              vas a ver acá qué módulos te sirven para empujar cada objetivo.
            </p>
            <button
              onClick={() => onNavigate?.('growth_dashboard')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold hover:opacity-90"
            >
              <Icons.Plus size={11} />
              Definir objetivos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {objectives.map(obj => {
              const pct = obj.progress != null && obj.target ? Math.min(100, Math.round((obj.progress / obj.target) * 100)) : null;
              return (
                <div key={obj.id} className="bg-white/60 dark:bg-zinc-900/40 backdrop-blur rounded-xl border border-zinc-200/60 dark:border-zinc-800 px-3 py-2.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 truncate" title={obj.title}>
                    {obj.title}
                  </div>
                  <div className="text-[18px] font-light text-zinc-900 dark:text-zinc-100 tabular-nums mt-1" style={{ letterSpacing: '-0.02em' }}>
                    {obj.progress ?? '—'}
                    {obj.unit && <span className="text-[12px] text-zinc-400 ml-0.5">{obj.unit}</span>}
                  </div>
                  {pct != null && (
                    <>
                      <div className="text-[10px] font-mono text-zinc-400 mt-1">
                        {pct}% de {obj.target}{obj.unit}
                      </div>
                      <div className="h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modules grid */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">
            Módulos del workspace
          </h2>
          <span className="text-[10px] font-mono text-zinc-400 tracking-wider">
            {modules.filter(m => m.count > 0).length} de {modules.length} activos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((m, idx) => {
            const isActive = m.count > 0;
            const IconCmp = (Icons as any)[m.icon] || Icons.Sparkles;
            return (
              <motion.button
                key={m.id}
                onClick={() => onNavigate?.(m.page)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING_ENTER, delay: idx * 0.04 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className={`relative text-left p-4 rounded-2xl border transition-colors group ${
                  isActive
                    ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                    : 'border-dashed border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50/40 dark:bg-zinc-900/40 hover:bg-white dark:hover:bg-zinc-900'
                }`}
              >
                {/* Status pill */}
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                      background: isActive ? `color-mix(in oklab, ${m.accent} 14%, transparent)` : 'rgba(161,161,170,0.10)',
                      color: isActive ? m.accent : '#a1a1aa',
                    }}
                  >
                    <IconCmp size={16} />
                  </div>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      activo
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                      vacío
                    </span>
                  )}
                </div>

                <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                  {m.label}
                </h3>
                <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                  {m.description}
                </p>

                <div className="mt-3 pt-3 border-t border-dashed border-zinc-100 dark:border-zinc-800/60">
                  {isActive ? (
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] text-zinc-600 dark:text-zinc-300 truncate">
                        {m.countLabel}
                      </span>
                      <span
                        className="text-[10.5px] font-mono uppercase tracking-wider inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: m.accent }}
                      >
                        Editar
                        <Icons.ChevronRight size={11} />
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug italic mb-2">
                        {m.purpose}
                      </p>
                      <span
                        className="text-[10.5px] font-mono uppercase tracking-wider inline-flex items-center gap-0.5"
                        style={{ color: m.accent }}
                      >
                        <Icons.Plus size={10} />
                        Configurar
                      </span>
                    </div>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Footer — micro hint */}
      <footer className="mt-6 text-[11px] text-zinc-400 dark:text-zinc-500 italic">
        Una vez que un módulo tiene contenido, queda como "activo" y entrás solo para editar.
        Los vacíos aparecen como sugerencias — activalos cuando tu objetivo lo pida.
      </footer>
    </div>
  );
};

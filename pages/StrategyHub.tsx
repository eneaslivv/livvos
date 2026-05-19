/**
 * Strategy Hub — single source of truth for ICPs (target audiences),
 * service packages, and positioning principles. Lives at /strategy_hub
 * in the OS sidebar.
 *
 * Three tabs:
 *   1. ICPs       — target-audience cards with pain points, modules,
 *                   pricing. Click to edit, "+ New ICP" to create.
 *   2. Packages   — service packages built from ICPs + modules. Links
 *                   each package to its target ICP.
 *   3. Positioning — short principles ("show don't tell") with
 *                    examples + which surfaces they apply to.
 *
 * Data flow: thin direct-supabase reads scoped to the active tenant
 * via RLS. Creates/updates run inline modals + optimistic local
 * append on success.
 *
 * Not done yet (deferred to future passes):
 *   • AI features (ICP suggestion from lead, package recommender)
 *   • Per-ICP conversion metrics
 *   • Cross-link to Sales pipeline (the spec's Phase 2)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';
import { SPRING_ENTER, SPRING_TAP } from '../lib/ui/motion';
import { CoachFlow } from '../components/livv/CoachFlow';
import { ICP_CREATION_FLOW, type IcpData } from '../components/livv/flows/IcpCreationFlow';

// ── Types mirroring the DB schema ─────────────────────────────────
interface ICP {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  pain_points: string[];
  entry_module: string | null;
  expansion_path: string[];
  market_geo: string[];
  ticket_implementation: number | null;
  ticket_retainer_monthly: number | null;
  status: 'active' | 'testing' | 'deprecated';
  vertical_playbook: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface Package {
  id: string;
  tenant_id: string;
  name: string;
  target_icp_id: string | null;
  modules_included: string[];
  implementation_weeks: number | null;
  price_implementation: number | null;
  price_monthly: number | null;
  deliverables: string[];
  status: 'draft' | 'active' | 'deprecated';
  created_at: string;
}

interface Positioning {
  id: string;
  tenant_id: string;
  principle: string;
  description: string | null;
  examples: string[];
  applies_to: string[];
  created_at: string;
}

type Tab = 'icps' | 'packages' | 'positioning';

// Defaults for the ICP create form — pre-fills the common shape so the
// user only has to type the unique parts.
const EMPTY_ICP: Omit<ICP, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> = {
  name: '',
  description: '',
  pain_points: [],
  entry_module: null,
  expansion_path: [],
  market_geo: [],
  ticket_implementation: null,
  ticket_retainer_monthly: null,
  status: 'active',
  vertical_playbook: {},
};

const EMPTY_PACKAGE: Omit<Package, 'id' | 'tenant_id' | 'created_at'> = {
  name: '',
  target_icp_id: null,
  modules_included: [],
  implementation_weeks: null,
  price_implementation: null,
  price_monthly: null,
  deliverables: [],
  status: 'draft',
};

const EMPTY_POSITIONING: Omit<Positioning, 'id' | 'tenant_id' | 'created_at'> = {
  principle: '',
  description: '',
  examples: [],
  applies_to: [],
};

export const StrategyHub: React.FC = () => {
  const { currentTenant } = useTenant();
  const [tab, setTab] = useState<Tab>('icps');
  const [icps, setIcps] = useState<ICP[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [positioning, setPositioning] = useState<Positioning[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingIcp, setEditingIcp] = useState<ICP | 'new' | null>(null);
  const [editingPackage, setEditingPackage] = useState<Package | 'new' | null>(null);
  const [editingPositioning, setEditingPositioning] = useState<Positioning | 'new' | null>(null);
  // CoachFlow — guided wizard for creating a new ICP via a 5-step flow.
  // Triggered by the "Guided" button next to "+ New ICP".
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachSaving, setCoachSaving] = useState(false);

  // ── Load all three slices in parallel on mount + tenant change ───
  const refetch = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      const [iRes, pRes, posRes] = await Promise.all([
        supabase.from('strategy_icps').select('*').eq('tenant_id', currentTenant.id).order('created_at', { ascending: false }),
        supabase.from('strategy_packages').select('*').eq('tenant_id', currentTenant.id).order('created_at', { ascending: false }),
        supabase.from('strategy_positioning').select('*').eq('tenant_id', currentTenant.id).order('created_at', { ascending: false }),
      ]);
      setIcps((iRes.data || []) as ICP[]);
      setPackages((pRes.data || []) as Package[]);
      setPositioning((posRes.data || []) as Positioning[]);
    } catch (e) {
      errorLogger.warn('strategy hub load failed', e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => { refetch(); }, [refetch]);

  // CoachFlow finish handler — inserts a row in strategy_icps with the
  // collected wizard data, then refetches the list so the new ICP appears.
  const handleCoachFinish = useCallback(async (data: IcpData) => {
    if (!currentTenant?.id) return;
    setCoachSaving(true);
    try {
      const { error } = await supabase.from('strategy_icps').insert({
        tenant_id: currentTenant.id,
        name: data.name,
        short_code: data.short,
        color: data.color,
        status: data.status,
        pain_points: (data.pains || []).filter(Boolean),
        modules: data.path || [],
      });
      if (error) throw error;
      setCoachOpen(false);
      await refetch();
    } catch (err: any) {
      errorLogger.logError(err, { feature: 'strategy_icp_coach_finish' });
      alert(`Could not save ICP: ${err.message}`);
    } finally {
      setCoachSaving(false);
    }
  }, [currentTenant?.id, refetch]);

  // ── Counters for the tab strip ───────────────────────────────────
  const counts = useMemo(() => ({
    icps: icps.length,
    packages: packages.length,
    positioning: positioning.length,
  }), [icps.length, packages.length, positioning.length]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Strategy</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Target audiences, service packages, and positioning principles. The single source of truth
          that feeds content production, sales, and delivery.
        </p>
      </header>

      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 mb-6">
        {([
          { id: 'icps' as const,        label: 'ICPs',        icon: 'Target' },
          { id: 'packages' as const,    label: 'Packages',    icon: 'Briefcase' },
          { id: 'positioning' as const, label: 'Positioning', icon: 'Sparkles' },
        ]).map(t => {
          const IconCmp = (Icons as any)[t.icon] || Icons.Sparkles;
          const active = tab === t.id;
          return (
            <motion.button
              key={t.id}
              onClick={() => setTab(t.id)}
              whileTap={{ scale: 0.96, transition: SPRING_TAP }}
              className={`relative px-3 py-2 text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors ${
                active
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <IconCmp size={13} />
              {t.label}
              <span className={`text-[9px] tabular-nums font-mono px-1 py-0.5 rounded ${
                active ? 'bg-zinc-900/10 dark:bg-zinc-100/10' : 'bg-zinc-100 dark:bg-zinc-800'
              }`}>{counts[t.id]}</span>
              {active && <span className="absolute -bottom-px left-2 right-2 h-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-full" />}
            </motion.button>
          );
        })}
        {/* Guided wizard — opens the CoachFlow with the matching flow.
           Only ICPs has a flow defined yet — Packages / Principles to follow. */}
        {tab === 'icps' && (
          <motion.button
            onClick={() => setCoachOpen(true)}
            whileTap={{ scale: 0.97, transition: SPRING_TAP }}
            whileHover={{ y: -1, transition: SPRING_TAP }}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-lg border border-amber-300/60 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-500/20 transition-colors mb-1.5"
            title="Step-by-step wizard with live preview"
          >
            <Icons.Sparkles size={12} />
            Guided
          </motion.button>
        )}
        <motion.button
          onClick={() => {
            if (tab === 'icps') setEditingIcp('new');
            else if (tab === 'packages') setEditingPackage('new');
            else setEditingPositioning('new');
          }}
          whileTap={{ scale: 0.97, transition: SPRING_TAP }}
          whileHover={{ y: -1, transition: SPRING_TAP }}
          className={`${tab === 'icps' ? '' : 'ml-auto'} inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity mb-1.5`}
        >
          <Icons.Plus size={12} />
          New {tab === 'icps' ? 'ICP' : tab === 'packages' ? 'Package' : 'Principle'}
        </motion.button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Icons.Loader className="animate-spin text-zinc-400" size={20} />
        </div>
      )}

      {!loading && tab === 'icps' && (
        <ICPGrid
          icps={icps}
          onEdit={(icp) => setEditingIcp(icp)}
          onNew={() => setEditingIcp('new')}
        />
      )}

      {!loading && tab === 'packages' && (
        <PackageGrid
          packages={packages}
          icps={icps}
          onEdit={(p) => setEditingPackage(p)}
          onNew={() => setEditingPackage('new')}
        />
      )}

      {!loading && tab === 'positioning' && (
        <PositioningList
          rows={positioning}
          onEdit={(p) => setEditingPositioning(p)}
          onNew={() => setEditingPositioning('new')}
        />
      )}

      {/* Modals */}
      <AnimatePresence>
        {editingIcp && (
          <ICPModal
            value={editingIcp === 'new' ? null : editingIcp}
            onClose={() => setEditingIcp(null)}
            onSaved={() => { setEditingIcp(null); refetch(); }}
          />
        )}
        {editingPackage && (
          <PackageModal
            value={editingPackage === 'new' ? null : editingPackage}
            icps={icps}
            onClose={() => setEditingPackage(null)}
            onSaved={() => { setEditingPackage(null); refetch(); }}
          />
        )}
        {editingPositioning && (
          <PositioningModal
            value={editingPositioning === 'new' ? null : editingPositioning}
            onClose={() => setEditingPositioning(null)}
            onSaved={() => { setEditingPositioning(null); refetch(); }}
          />
        )}
      </AnimatePresence>

      {/* CoachFlow — fullscreen guided wizard. Renders only when open. */}
      {coachOpen && (
        <CoachFlow
          flow={ICP_CREATION_FLOW}
          onComplete={handleCoachFinish}
          onClose={() => !coachSaving && setCoachOpen(false)}
        />
      )}
    </div>
  );
};

// ── ICP grid ──────────────────────────────────────────────────────
const STATUS_TONE: Record<string, string> = {
  active:     'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30',
  testing:    'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-500/30',
  deprecated: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
  draft:      'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-500/30',
};

const fmtMoney = (n: number | null | undefined): string =>
  n == null ? '—' : `$${n.toLocaleString('en-US')}`;

const ICPGrid: React.FC<{
  icps: ICP[];
  onEdit: (icp: ICP) => void;
  onNew: () => void;
}> = ({ icps, onEdit, onNew }) => {
  if (icps.length === 0) {
    return (
      <EmptyState
        icon="Target"
        title="No ICPs defined yet"
        body="Start by defining 1–3 target audiences. Each ICP is a group with shared pain points, pricing, and an entry module — the door-opener product you sell them first."
        cta="Define your first ICP"
        onClick={onNew}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {icps.map((icp, idx) => (
        <motion.button
          key={icp.id}
          onClick={() => onEdit(icp)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
          whileTap={{ scale: 0.98, transition: SPRING_TAP }}
          whileHover={{ y: -2, transition: SPRING_TAP }}
          className="text-left p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 transition-colors"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{icp.name}</h3>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_TONE[icp.status]}`}>
              {icp.status}
            </span>
          </div>
          {icp.description && (
            <p className="text-[12px] text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-3">{icp.description}</p>
          )}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Implementation</div>
              <div className="text-zinc-800 dark:text-zinc-200 tabular-nums font-semibold mt-0.5">{fmtMoney(icp.ticket_implementation)}</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Retainer / mo</div>
              <div className="text-zinc-800 dark:text-zinc-200 tabular-nums font-semibold mt-0.5">{fmtMoney(icp.ticket_retainer_monthly)}</div>
            </div>
          </div>
          {(icp.pain_points.length > 0 || icp.market_geo.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
              {icp.market_geo.map(g => (
                <span key={g} className="text-[9.5px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-mono uppercase">
                  {g}
                </span>
              ))}
              {icp.pain_points.slice(0, 3).map(p => (
                <span key={p} className="text-[9.5px] px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 truncate max-w-[160px]" title={p}>
                  {p}
                </span>
              ))}
              {icp.pain_points.length > 3 && (
                <span className="text-[9.5px] text-zinc-400">+{icp.pain_points.length - 3}</span>
              )}
            </div>
          )}
        </motion.button>
      ))}
    </div>
  );
};

// ── Package grid ──────────────────────────────────────────────────
const PackageGrid: React.FC<{
  packages: Package[];
  icps: ICP[];
  onEdit: (p: Package) => void;
  onNew: () => void;
}> = ({ packages, icps, onEdit, onNew }) => {
  const icpById = useMemo(() => new Map(icps.map(i => [i.id, i])), [icps]);
  if (packages.length === 0) {
    return (
      <EmptyState
        icon="Briefcase"
        title="No service packages yet"
        body="Packages combine 1+ modules into a sellable offer: name, price, what's included, target ICP. Sales uses these in proposals; the system uses them to auto-create projects when a deal closes."
        cta="Create your first package"
        onClick={onNew}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {packages.map((p, idx) => {
        const icp = p.target_icp_id ? icpById.get(p.target_icp_id) : null;
        return (
          <motion.button
            key={p.id}
            onClick={() => onEdit(p)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
            whileTap={{ scale: 0.98, transition: SPRING_TAP }}
            whileHover={{ y: -2, transition: SPRING_TAP }}
            className="text-left p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{p.name}</h3>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_TONE[p.status]}`}>
                {p.status}
              </span>
            </div>
            {icp && (
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2 inline-flex items-center gap-1">
                <Icons.Target size={10} />
                {icp.name}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Implementation</div>
                <div className="text-zinc-800 dark:text-zinc-200 tabular-nums font-semibold mt-0.5">{fmtMoney(p.price_implementation)}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Monthly</div>
                <div className="text-zinc-800 dark:text-zinc-200 tabular-nums font-semibold mt-0.5">{fmtMoney(p.price_monthly)}</div>
              </div>
            </div>
            {p.modules_included.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
                {p.modules_included.map(m => (
                  <span key={m} className="text-[9.5px] px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 font-mono">
                    {m}
                  </span>
                ))}
                {p.implementation_weeks != null && (
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 tabular-nums ml-auto">
                    {p.implementation_weeks}w
                  </span>
                )}
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

// ── Positioning list ──────────────────────────────────────────────
const PositioningList: React.FC<{
  rows: Positioning[];
  onEdit: (p: Positioning) => void;
  onNew: () => void;
}> = ({ rows, onEdit, onNew }) => {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title="No positioning principles yet"
        body="Short rules that shape how you communicate (e.g. 'Show don't tell', 'Use real numbers'). Captured here so content + sales + delivery all reference the same playbook."
        cta="Add your first principle"
        onClick={onNew}
      />
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((p, idx) => (
        <motion.button
          key={p.id}
          onClick={() => onEdit(p)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_ENTER, delay: idx * 0.025 }}
          whileTap={{ scale: 0.995, transition: SPRING_TAP }}
          whileHover={{ y: -1, transition: SPRING_TAP }}
          className="w-full text-left p-3 rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100">{p.principle}</h3>
            {p.applies_to.length > 0 && (
              <div className="flex flex-wrap gap-1 shrink-0">
                {p.applies_to.map(a => (
                  <span key={a} className="text-[9.5px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono uppercase">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
          {p.description && (
            <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-1.5">{p.description}</p>
          )}
          {p.examples.length > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/60 space-y-0.5">
              {p.examples.slice(0, 3).map((ex, i) => (
                <div key={i} className="text-[11px] text-zinc-500 dark:text-zinc-400 italic">
                  · {ex}
                </div>
              ))}
            </div>
          )}
        </motion.button>
      ))}
    </div>
  );
};

// ── Empty state ───────────────────────────────────────────────────
const EmptyState: React.FC<{ icon: string; title: string; body: string; cta: string; onClick: () => void }> = ({
  icon, title, body, cta, onClick,
}) => {
  const IconCmp = (Icons as any)[icon] || Icons.Sparkles;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_ENTER}
      className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 p-12 text-center max-w-xl mx-auto"
    >
      <IconCmp size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
      <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">{title}</h3>
      <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">{body}</p>
      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.97, transition: SPRING_TAP }}
        whileHover={{ y: -1, transition: SPRING_TAP }}
        className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold hover:opacity-90 transition-opacity"
      >
        <Icons.Plus size={12} />
        {cta}
      </motion.button>
    </motion.div>
  );
};

// ── Shared modal shell ───────────────────────────────────────────
const ModalShell: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}> = ({ title, onClose, children, footer }) => (
  <motion.div
    key="overlay"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.18 }}
    onClick={onClose}
    className="fixed inset-0 z-[70] bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <motion.div
      onClick={e => e.stopPropagation()}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={SPRING_ENTER}
      className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <button onClick={onClose} className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          <Icons.X size={14} />
        </button>
      </div>
      <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
        {children}
      </div>
      <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
        {footer}
      </div>
    </motion.div>
  </motion.div>
);

// Shared form-field primitives
const inputClass =
  'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12.5px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <div className="flex items-baseline gap-2 mb-1.5">
      <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
      {hint && <span className="text-[10px] text-zinc-400">{hint}</span>}
    </div>
    {children}
  </label>
);

// Comma-separated text → string[] (trimmed, no empties).
const splitList = (s: string): string[] =>
  s.split(',').map(x => x.trim()).filter(Boolean);

// ── ICP modal ─────────────────────────────────────────────────────
const ICPModal: React.FC<{ value: ICP | null; onClose: () => void; onSaved: () => void }> = ({ value, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_ICP>({
    ...EMPTY_ICP,
    ...(value
      ? {
          name: value.name,
          description: value.description || '',
          pain_points: value.pain_points,
          entry_module: value.entry_module,
          expansion_path: value.expansion_path,
          market_geo: value.market_geo,
          ticket_implementation: value.ticket_implementation,
          ticket_retainer_monthly: value.ticket_retainer_monthly,
          status: value.status,
          vertical_playbook: value.vertical_playbook,
        }
      : {}),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!currentTenant?.id) return;
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (value) {
        const { error: err } = await supabase.from('strategy_icps').update(form).eq('id', value.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('strategy_icps').insert({ ...form, tenant_id: currentTenant.id });
        if (err) throw err;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!value || !confirm(`Delete ICP "${value.name}"? Packages targeting it will lose the link.`)) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.from('strategy_icps').delete().eq('id', value.id);
      if (err) throw err;
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalShell
      title={value ? `Edit ICP — ${value.name}` : 'New ICP'}
      onClose={onClose}
      footer={
        <>
          {value && (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors"
            >{deleting ? 'Deleting…' : 'Delete'}</button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
          >
            {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
          </button>
        </>
      }
    >
      {error && <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}
      <Field label="Name" hint="Short, distinctive name like 'Gastronomía & Nightlife'">
        <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Boutique restaurants" />
      </Field>
      <Field label="Description" hint="Who they are, in one sentence">
        <textarea rows={2} className={inputClass} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Mid-market venues that book talent + need fast operations." />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ICP['status'] }))}>
            <option value="active">active</option>
            <option value="testing">testing</option>
            <option value="deprecated">deprecated</option>
          </select>
        </Field>
        <Field label="Entry module" hint="The door opener product">
          <input className={inputClass} value={form.entry_module || ''} onChange={e => setForm(f => ({ ...f, entry_module: e.target.value || null }))} placeholder="payper" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Implementation $">
          <input type="number" className={inputClass} value={form.ticket_implementation ?? ''} onChange={e => setForm(f => ({ ...f, ticket_implementation: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="3000" />
        </Field>
        <Field label="Retainer $ / mo">
          <input type="number" className={inputClass} value={form.ticket_retainer_monthly ?? ''} onChange={e => setForm(f => ({ ...f, ticket_retainer_monthly: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="800" />
        </Field>
      </div>
      <Field label="Pain points" hint="Comma-separated">
        <textarea rows={2} className={inputClass} value={form.pain_points.join(', ')} onChange={e => setForm(f => ({ ...f, pain_points: splitList(e.target.value) }))} placeholder="slow POS, no booking system, manual inventory" />
      </Field>
      <Field label="Expansion path" hint="Modules they add after the entry product">
        <input className={inputClass} value={form.expansion_path.join(', ')} onChange={e => setForm(f => ({ ...f, expansion_path: splitList(e.target.value) }))} placeholder="finance, content, projects" />
      </Field>
      <Field label="Markets" hint="ISO geo codes — AR, US, MX, ES, BR…">
        <input className={inputClass} value={form.market_geo.join(', ')} onChange={e => setForm(f => ({ ...f, market_geo: splitList(e.target.value).map(g => g.toUpperCase()) }))} placeholder="AR, LATAM, US" />
      </Field>
    </ModalShell>
  );
};

// ── Package modal ─────────────────────────────────────────────────
const PackageModal: React.FC<{ value: Package | null; icps: ICP[]; onClose: () => void; onSaved: () => void }> = ({ value, icps, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_PACKAGE>({
    ...EMPTY_PACKAGE,
    ...(value
      ? {
          name: value.name,
          target_icp_id: value.target_icp_id,
          modules_included: value.modules_included,
          implementation_weeks: value.implementation_weeks,
          price_implementation: value.price_implementation,
          price_monthly: value.price_monthly,
          deliverables: value.deliverables,
          status: value.status,
        }
      : {}),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!currentTenant?.id) return;
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (value) {
        const { error: err } = await supabase.from('strategy_packages').update(form).eq('id', value.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('strategy_packages').insert({ ...form, tenant_id: currentTenant.id });
        if (err) throw err;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!value || !confirm(`Delete package "${value.name}"?`)) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.from('strategy_packages').delete().eq('id', value.id);
      if (err) throw err;
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalShell
      title={value ? `Edit package — ${value.name}` : 'New package'}
      onClose={onClose}
      footer={
        <>
          {value && (
            <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Deleting…' : 'Delete'}</button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
            {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
          </button>
        </>
      }
    >
      {error && <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}
      <Field label="Name">
        <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Starter Gastro" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target ICP">
          <select className={inputClass} value={form.target_icp_id || ''} onChange={e => setForm(f => ({ ...f, target_icp_id: e.target.value || null }))}>
            <option value="">— None —</option>
            {icps.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Package['status'] }))}>
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="deprecated">deprecated</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Impl. $">
          <input type="number" className={inputClass} value={form.price_implementation ?? ''} onChange={e => setForm(f => ({ ...f, price_implementation: e.target.value === '' ? null : Number(e.target.value) }))} />
        </Field>
        <Field label="Monthly $">
          <input type="number" className={inputClass} value={form.price_monthly ?? ''} onChange={e => setForm(f => ({ ...f, price_monthly: e.target.value === '' ? null : Number(e.target.value) }))} />
        </Field>
        <Field label="Weeks">
          <input type="number" className={inputClass} value={form.implementation_weeks ?? ''} onChange={e => setForm(f => ({ ...f, implementation_weeks: e.target.value === '' ? null : Number(e.target.value) }))} />
        </Field>
      </div>
      <Field label="Modules included" hint="Comma-separated">
        <input className={inputClass} value={form.modules_included.join(', ')} onChange={e => setForm(f => ({ ...f, modules_included: splitList(e.target.value) }))} placeholder="payper, finance, content" />
      </Field>
      <Field label="Deliverables" hint="What the client gets — comma-separated">
        <textarea rows={2} className={inputClass} value={form.deliverables.join(', ')} onChange={e => setForm(f => ({ ...f, deliverables: splitList(e.target.value) }))} placeholder="POS setup, finance dashboard, 4 posts/week" />
      </Field>
    </ModalShell>
  );
};

// ── Positioning modal ─────────────────────────────────────────────
const PositioningModal: React.FC<{ value: Positioning | null; onClose: () => void; onSaved: () => void }> = ({ value, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_POSITIONING>({
    ...EMPTY_POSITIONING,
    ...(value ? {
      principle: value.principle,
      description: value.description || '',
      examples: value.examples,
      applies_to: value.applies_to,
    } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!currentTenant?.id) return;
    if (!form.principle.trim()) { setError('Principle is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (value) {
        const { error: err } = await supabase.from('strategy_positioning').update(form).eq('id', value.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('strategy_positioning').insert({ ...form, tenant_id: currentTenant.id });
        if (err) throw err;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!value || !confirm(`Delete principle "${value.principle}"?`)) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.from('strategy_positioning').delete().eq('id', value.id);
      if (err) throw err;
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalShell
      title={value ? `Edit principle — ${value.principle}` : 'New positioning principle'}
      onClose={onClose}
      footer={
        <>
          {value && (
            <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Deleting…' : 'Delete'}</button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
            {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
          </button>
        </>
      }
    >
      {error && <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}
      <Field label="Principle" hint="Short, declarative">
        <input className={inputClass} value={form.principle} onChange={e => setForm(f => ({ ...f, principle: e.target.value }))} placeholder="Show don't tell" />
      </Field>
      <Field label="Description" hint="When + why to apply it">
        <textarea rows={3} className={inputClass} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Demos beat decks. Loom screenshares beat case-study PDFs." />
      </Field>
      <Field label="Examples" hint="Comma-separated concrete examples">
        <textarea rows={2} className={inputClass} value={form.examples.join(', ')} onChange={e => setForm(f => ({ ...f, examples: splitList(e.target.value) }))} placeholder="60-sec Loom for every cold lead, screenshots in proposals" />
      </Field>
      <Field label="Applies to" hint="Comma-separated surfaces: content, sales, delivery">
        <input className={inputClass} value={form.applies_to.join(', ')} onChange={e => setForm(f => ({ ...f, applies_to: splitList(e.target.value) }))} placeholder="content, sales" />
      </Field>
    </ModalShell>
  );
};

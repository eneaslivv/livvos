/**
 * Growth Dashboard — executive view. What Eneas opens every Monday
 * to know if the business is on track.
 *
 * Three sections:
 *   1. This week — auto-generated snapshot (revenue / pipeline /
 *      content / outreach), driven by the compute_growth_snapshot
 *      RPC. Can also be recomputed on demand.
 *   2. KPIs — north-star metrics with target / current / trend.
 *      Manually edited; future: auto-pulled from other modules.
 *   3. Phases — the 4 growth-phase roadmap with milestone checkboxes.
 *
 * Pulls from: Finance (incomes, installments, expenses), Sales
 * (sales_leads, sales_outreach), Content (content_pieces). All via
 * the SECURITY DEFINER RPC so the frontend doesn't need cross-
 * module SELECT permissions.
 *
 * Not done yet (deferred):
 *   • AI "State of LIVV" Monday summary (Claude call)
 *   • Week-over-week trend charts (we have one week of data; trends
 *     come after a few weeks of snapshots accumulate)
 *   • Per-KPI sparklines
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';
import { SPRING_ENTER, SPRING_TAP } from '../lib/ui/motion';
import { usePartners } from '../hooks/usePartners';
import { PartnerDetailPanel } from '../components/partner/PartnerDetailPanel';
import { useAutomations } from '../hooks/useAutomations';
import type { Partner, Automation } from '../types';
import '../components/livv/bundle-growth.css';
import { ThisWeekCard, ActivityFeedCard, WeeklySnapshotCard } from '../components/livv/GrowthWidgets';
import { CoachFlow } from '../components/livv/CoachFlow';
import { PHASE_FLOW, PARTNER_FLOW, AUTOMATION_FLOW, savePhase, savePartner, saveAutomation } from '../components/livv/flows/SetupFlows';

interface Phase {
  id: string;
  tenant_id: string;
  phase_number: number;
  title: string;
  timeline: string | null;
  status: 'active' | 'completed' | 'upcoming';
  milestones: Array<{ title: string; completed: boolean; target_date?: string | null }>;
  started_at: string | null;
  completed_at: string | null;
}

interface Kpi {
  id: string;
  tenant_id: string;
  metric_name: string;
  target_value: number | null;
  target_unit: string | null;
  current_value: number | null;
  last_updated: string | null;
  trend: 'up' | 'down' | 'flat' | null;
  category: string | null;
}

interface Snapshot {
  id: string;
  tenant_id: string;
  week_start: string;
  metrics: Record<string, any>;
  highlights: string | null;
  blockers: string | null;
  next_week_priorities: string[];
}

const lastMonday = (): string => {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
};

const fmtMoney = (n: number | null | undefined): string => n == null ? '—' : `$${Number(n).toLocaleString('en-US')}`;

const EMPTY_PHASE: Omit<Phase, 'id' | 'tenant_id'> = {
  phase_number: 1, title: '', timeline: null, status: 'upcoming',
  milestones: [], started_at: null, completed_at: null,
};
const EMPTY_KPI: Omit<Kpi, 'id' | 'tenant_id'> = {
  metric_name: '', target_value: null, target_unit: null, current_value: null,
  last_updated: null, trend: null, category: null,
};

// Map a tasks row → the bundle widget's ThisWeekItem. Module is inferred
// from project category / type so the colored left bar matches what the
// rest of the dashboard uses.
const inferTaskModule = (raw: any): string => {
  const t = `${raw.project_title || ''} ${raw.title || ''}`.toLowerCase();
  if (/proposal|lead|deal|outreach|sale/.test(t)) return 'Sales';
  if (/content|post|video|youtube|publish/.test(t)) return 'Content';
  if (/strategy|positioning|icp/.test(t)) return 'Strategy';
  if (/hire|role|onboarding|scaling/.test(t)) return 'Scaling';
  if (/invoice|cash|finance|budget|expense/.test(t)) return 'Finance';
  return 'Delivery';
};

const inferActivityModule = (entity: string | null): string => {
  switch ((entity || '').toLowerCase()) {
    case 'clients': case 'leads': case 'lead': return 'Sales';
    case 'content_pieces': case 'content': return 'Content';
    case 'strategy_icps': case 'strategy_packages': return 'Strategy';
    case 'team_members': case 'roles': return 'Scaling';
    case 'invoices': case 'expenses': case 'finance': return 'Finance';
    default: return 'Delivery';
  }
};

const inferActivityIcon = (action: string | null): string => {
  const a = (action || '').toLowerCase();
  if (/complete|done|finish|won/.test(a)) return 'CheckCircle';
  if (/publish|send/.test(a)) return 'Edit';
  if (/create|add|new/.test(a)) return 'Plus';
  if (/delete|remove/.test(a)) return 'X';
  if (/flag|alert|warn/.test(a)) return 'AlertCircle';
  return 'Activity';
};

const fmtRelative = (iso: string): string => {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - d) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 2) return 'Yesterday';
  return `${Math.floor(diff / 86400)}d ago`;
};

export const GrowthDashboard: React.FC = () => {
  const { currentTenant } = useTenant();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [thisWeekTasks, setThisWeekTasks] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  // Leads — feeds the Pipeline metrics section (funnel + sources + forecast).
  // Loaded in the same refetch cycle as everything else for one render pass.
  const [pipelineLeads, setPipelineLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [editingPhase, setEditingPhase] = useState<Phase | 'new' | null>(null);
  const [editingKpi, setEditingKpi] = useState<Kpi | 'new' | null>(null);
  // Partners section state — lives in this page so the partner panel
  // can drop in alongside the rest of the growth sections.
  const { partners, widgets } = usePartners();
  const [editingPartner, setEditingPartner] = useState<Partner | 'new' | null>(null);
  // Automations — user-defined cross-module rules. Toggle on/off here;
  // creation/edit form is deferred to a follow-up wizard.
  const { automations, logs: automationLogs, toggleAutomation, deleteAutomation } = useAutomations();
  const weekStart = lastMonday();

  const refetch = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      // Week boundaries for the ThisWeek widget — Monday → Sunday of the
      // displayed week. Done off `weekStart` so it stays in sync with the
      // snapshot row.
      const weekStartDate = new Date(weekStart + 'T00:00:00Z');
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 7);

      const [phRes, kpiRes, snapRes, tasksRes, actRes, leadsRes] = await Promise.all([
        supabase.from('growth_phases').select('*').eq('tenant_id', currentTenant.id).order('phase_number', { ascending: true }),
        supabase.from('growth_kpis').select('*').eq('tenant_id', currentTenant.id).order('category', { ascending: true, nullsFirst: false }).order('metric_name'),
        supabase.from('growth_weekly_snapshots').select('*').eq('tenant_id', currentTenant.id).eq('week_start', weekStart).maybeSingle(),
        // Tasks due this week (or undated) for the ThisWeekCard.
        supabase.from('tasks')
          .select('id,title,due_date,priority,project_title,status')
          .eq('tenant_id', currentTenant.id)
          .neq('status', 'completed')
          .or(`due_date.gte.${weekStartDate.toISOString()},due_date.is.null`)
          .lt('due_date', weekEndDate.toISOString())
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(8),
        // Recent cross-module activity for the ActivityFeedCard.
        supabase.from('activity_logs')
          .select('id,user_name,action,target,entity_type,created_at')
          .eq('tenant_id', currentTenant.id)
          .order('created_at', { ascending: false })
          .limit(8),
        // Leads — for the Pipeline metrics section (funnel/sources/forecast).
        // 90-day window matches the bundle's "Last 90 days" eyebrow.
        supabase.from('leads')
          .select('id,status,source,budget,created_at,name,company')
          .eq('tenant_id', currentTenant.id)
          .gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString())
          .order('created_at', { ascending: false }),
      ]);
      setPhases((phRes.data || []) as Phase[]);
      setKpis((kpiRes.data || []) as Kpi[]);
      setSnapshot((snapRes.data as Snapshot) || null);
      setThisWeekTasks(tasksRes.data || []);
      setRecentActivity(actRes.data || []);
      setPipelineLeads(leadsRes.data || []);
    } catch (e) {
      errorLogger.warn('growth dashboard load failed', e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id, weekStart]);

  useEffect(() => { refetch(); }, [refetch]);

  // ── Recompute this week's snapshot via the RPC ──────────────────
  const handleRecompute = async () => {
    if (!currentTenant?.id) return;
    setRecomputing(true);
    try {
      await supabase.rpc('compute_growth_snapshot', {
        p_tenant_id: currentTenant.id,
        p_week_start: weekStart,
      });
      await refetch();
    } catch (e) {
      errorLogger.warn('recompute snapshot failed', e);
    } finally {
      setRecomputing(false);
    }
  };

  // ── Save manual fields on the snapshot (highlights/blockers/priorities) ──
  const handleSnapshotNotes = async (patch: Partial<Snapshot>) => {
    if (!currentTenant?.id) return;
    if (!snapshot) {
      // Insert a minimal snapshot row so the notes attach somewhere.
      await supabase.from('growth_weekly_snapshots').insert({
        tenant_id: currentTenant.id, week_start: weekStart, metrics: {}, ...patch,
      });
    } else {
      await supabase.from('growth_weekly_snapshots').update(patch).eq('id', snapshot.id);
    }
    await refetch();
  };

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-6">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="bdg-page-title">Growth</h1>
          <p className="bdg-page-sub">
            Cross-module rollup · Week of {weekStart}
          </p>
        </div>
        <button
          onClick={handleRecompute}
          disabled={recomputing}
          className="bdg-refresh"
        >
          {recomputing ? <Icons.Loader size={13} className="animate-spin" /> : <Icons.Activity size={13} />}
          {recomputing ? 'Recomputing…' : 'Recompute this week'}
        </button>
      </header>

      {loading && <div className="flex items-center justify-center py-16"><Icons.Loader className="animate-spin text-zinc-400" size={20} /></div>}

      {!loading && (
        <>
          {/* Bundle widgets — top of dashboard. Two-col row first
              (ThisWeek priorities + recent activity), then full-width
              Weekly snapshot card. These mirror the bundle's editorial
              dashboard layout. */}
          <div className="bdg-w-row-2 mb-6">
            <ThisWeekCard
              items={thisWeekTasks.map(t => ({
                id: String(t.id),
                title: t.title || 'Untitled task',
                mod: inferTaskModule(t),
                when: t.due_date
                  ? new Date(t.due_date).toLocaleDateString('en-US', { weekday: 'short' })
                  : 'Anytime',
                hot: t.due_date ? new Date(t.due_date).getTime() <= Date.now() + 86400000 : false,
                taskId: String(t.id),
              }))}
              onItemClick={(item) => {
                if (item.taskId) {
                  window.dispatchEvent(new CustomEvent('app-navigate', {
                    detail: { page: 'calendar', params: { taskId: item.taskId } },
                  }));
                }
              }}
              onViewAll={() => {
                window.dispatchEvent(new CustomEvent('app-navigate', {
                  detail: { page: 'calendar' },
                }));
              }}
            />
            <ActivityFeedCard
              items={recentActivity.map(a => ({
                who: a.user_name || 'System',
                what: `${a.action || 'updated'} ${a.target ? `"${a.target}"` : ''}`.trim(),
                mod: inferActivityModule(a.entity_type),
                icon: inferActivityIcon(a.action) as any,
                when: a.created_at ? fmtRelative(a.created_at) : '—',
              }))}
              onOpenFeed={() => {
                window.dispatchEvent(new CustomEvent('app-navigate', {
                  detail: { page: 'activity' },
                }));
              }}
            />
          </div>

          {/* This-week snapshot — bundle's 3-cell editorial card. Maps
              from the same `snapshot` row the existing NotesEditor edits
              below, so this is read-only display + editor still works. */}
          <div className="mb-6">
            <WeeklySnapshotCard
              metrics={snapshot?.metrics && Array.isArray((snapshot.metrics as any).rows)
                ? (snapshot.metrics as any).rows
                : kpis.slice(0, 5).map(k => ({
                    l: k.metric_name,
                    v: k.current_value != null ? `${k.current_value}${k.target_unit || ''}` : '—',
                    p: '—',
                    d: k.trend === 'up' ? '↑' : k.trend === 'down' ? '↓' : '—',
                    dir: (k.trend || 'flat') as 'up' | 'down' | 'flat',
                  }))}
              highlights={snapshot?.highlights
                ? snapshot.highlights.split('\n').filter(Boolean)
                : undefined}
              blockers={snapshot?.blockers
                ? snapshot.blockers.split('\n').filter(Boolean)
                : undefined}
              onAiSummary={handleRecompute}
            />
          </div>

          <Section title="Weekly notes">
            <NotesEditor snapshot={snapshot} onSave={handleSnapshotNotes} />
          </Section>

          <Section title="North-star KPIs"
            cta={<motion.button onClick={() => setEditingKpi('new')} whileTap={{ scale: 0.97 }} className="text-[10.5px] font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 px-2 py-1 rounded-md inline-flex items-center gap-1"><Icons.Plus size={10} /> Add KPI</motion.button>}>
            <KpiGrid kpis={kpis} onEdit={k => setEditingKpi(k)} />
          </Section>

          <Section title="Growth phases"
            cta={<motion.button onClick={() => setEditingPhase('new')} whileTap={{ scale: 0.97 }} className="text-[10.5px] font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 px-2 py-1 rounded-md inline-flex items-center gap-1"><Icons.Plus size={10} /> Add phase</motion.button>}>
            {phases.length === 0 && currentTenant?.id ? (
              <CoachFlow
                flow={{ ...PHASE_FLOW, initial: { ...PHASE_FLOW.initial, phase_number: 1 } }}
                onComplete={async (data) => {
                  await savePhase(currentTenant.id, data);
                  await refetch();
                }}
                onClose={() => setEditingPhase('new')}
                inline
                skipLabel="Skip — open empty form"
              />
            ) : (
              <PhasesList phases={phases} onEdit={p => setEditingPhase(p)} />
            )}
          </Section>

          {/* Pipeline metrics — bundle's GrowthMetrics view. Funnel +
              source effectiveness + weighted revenue forecast. Pulls from
              the leads table (90-day window). Source: livv-update /
              livv-os-remaining.jsx :: GrowthMetrics. */}
          <Section title="Pipeline metrics"
            hint={pipelineLeads.length === 0 ? 'No leads in the last 90 days — once leads start flowing, the funnel + source table + revenue forecast will populate here.' : null}>
            <PipelineMetrics leads={pipelineLeads} />
          </Section>

          {/* Partners — external referrers / affiliates / agencies.
              Click a card to open the detail panel (referral link,
              commission, widgets, payouts). The /portal/[code] route
              is publicly accessible (no auth) for partners themselves. */}
          <Section title="Partners"
            cta={<motion.button onClick={() => setEditingPartner('new')} whileTap={{ scale: 0.97 }} className="text-[10.5px] font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 px-2 py-1 rounded-md inline-flex items-center gap-1"><Icons.Plus size={10} /> Invite partner</motion.button>}>
            {partners.length === 0 && currentTenant?.id ? (
              <CoachFlow
                flow={PARTNER_FLOW}
                onComplete={async (data) => {
                  await savePartner(currentTenant.id, data);
                  window.location.reload(); // simplest way to repopulate usePartners hook
                }}
                onClose={() => setEditingPartner('new')}
                inline
                skipLabel="Skip — open empty form"
              />
            ) : (
              <PartnersGrid partners={partners} widgetsCount={widgets.length} onOpen={p => setEditingPartner(p)} onNew={() => setEditingPartner('new')} />
            )}
          </Section>

          {/* Automations — user-defined cross-module rules. The 4 built-in
              triggers (lead won → project / project done → case study /
              etc.) still run unconditionally; these are extras on top. */}
          <Section title="Automations"
            hint={automations.length > 0 ? null : null}>
            {automations.length === 0 && currentTenant?.id ? (
              <CoachFlow
                flow={AUTOMATION_FLOW}
                onComplete={async (data) => {
                  await saveAutomation(currentTenant.id, data);
                  window.location.reload();
                }}
                onClose={() => { /* no-op fallback — hide wizard */ }}
                inline
                skipLabel="Skip — use built-in triggers only"
              />
            ) : (
              <AutomationsList
                automations={automations}
                logs={automationLogs}
                onToggle={toggleAutomation}
                onDelete={deleteAutomation}
              />
            )}
          </Section>
        </>
      )}

      <AnimatePresence>
        {editingPhase && (
          <PhaseModal value={editingPhase === 'new' ? null : editingPhase} nextNumber={(phases[phases.length - 1]?.phase_number || 0) + 1} onClose={() => setEditingPhase(null)} onSaved={() => { setEditingPhase(null); refetch(); }} />
        )}
        {editingKpi && (
          <KpiModal value={editingKpi === 'new' ? null : editingKpi} onClose={() => setEditingKpi(null)} onSaved={() => { setEditingKpi(null); refetch(); }} />
        )}
      </AnimatePresence>

      {/* Partner detail slide-over (lives outside <AnimatePresence>
          because the panel handles its own enter/exit). */}
      {editingPartner !== null && (
        <PartnerDetailPanel
          partner={editingPartner === 'new' ? null : editingPartner}
          isOpen
          onClose={() => setEditingPartner(null)}
        />
      )}
    </div>
  );
};

// ── Automations list ──────────────────────────────────────────────
const AutomationsList: React.FC<{
  automations: Automation[];
  logs: { automation_id: string; status: string; triggered_at: string }[];
  onToggle: (id: string, next: 'active' | 'paused') => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ automations, logs, onToggle, onDelete }) => {
  if (automations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-center">
        <Icons.Zap size={18} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Built-in automations run silently in the background. Custom ones (Toolkit wizard) land in a follow-up.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {automations.map(a => {
        const recent = logs.filter(l => l.automation_id === a.id).slice(0, 3);
        const active = a.status === 'active';
        return (
          <div key={a.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-[-0.005em]">{a.name}</div>
                {a.description && <div className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">{a.description}</div>}
              </div>
              <span className={`text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
                active ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : a.status === 'paused' ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}>{a.status}</span>
              <button
                onClick={() => onToggle(a.id, active ? 'paused' : 'active')}
                className={`relative w-9 h-5 rounded-full transition-colors ${active ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                title={active ? 'Pause' : 'Activate'}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <button onClick={() => onDelete(a.id)} className="text-zinc-300 hover:text-rose-500" title="Delete">
                <Icons.X size={12} />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[10.5px] text-zinc-500 font-mono">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{a.trigger_module} · {a.trigger_event}</span>
              <Icons.ChevronRight size={10} className="text-zinc-400" />
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{a.action_module} · {a.action_type}</span>
              <span className="ml-auto">
                {a.run_count} runs{a.error_count > 0 && <span className="text-rose-500"> · {a.error_count} errors</span>}
              </span>
            </div>
            {recent.length > 0 && (
              <div className="flex items-center gap-1 mt-2">
                {recent.map((r, i) => (
                  <span
                    key={i}
                    title={`${r.status} · ${new Date(r.triggered_at).toLocaleString()}`}
                    className={`w-1.5 h-1.5 rounded-full ${r.status === 'success' ? 'bg-emerald-400' : r.status === 'failed' ? 'bg-rose-400' : 'bg-zinc-300'}`}
                  />
                ))}
                {a.last_run_at && (
                  <span className="ml-2 text-[10px] text-zinc-400 font-mono">last · {new Date(a.last_run_at).toLocaleDateString()}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Partners grid ─────────────────────────────────────────────────
const PartnersGrid: React.FC<{
  partners: Partner[];
  widgetsCount: number;
  onOpen: (p: Partner) => void;
  onNew: () => void;
}> = ({ partners, widgetsCount, onOpen, onNew }) => {
  if (partners.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center">
        <Icons.Users size={18} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
        <div className="text-[12.5px] font-medium text-zinc-700 dark:text-zinc-200">No partners yet</div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
          Invite agencies, affiliates, or creators to refer leads. They get a unique referral code and you track conversions + commissions automatically.
        </p>
        <button onClick={onNew} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
          <Icons.Plus size={11} /> Invite a partner
        </button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {partners.map(p => (
        <motion.button
          key={p.id}
          onClick={() => onOpen(p)}
          whileTap={{ scale: 0.99, transition: SPRING_TAP }}
          whileHover={{ y: -1, transition: SPRING_TAP }}
          className="text-left p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
        >
          <div className="flex items-start gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-semibold shrink-0 text-white"
              style={{ background: p.brand_color || '#3f3f46' }}
            >
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover rounded-lg" />
                : p.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate tracking-[-0.012em]">{p.name}</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-mono">{p.referral_code} · {p.type}</div>
            </div>
            <span className={`text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
              p.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : p.status === 'invited' ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : p.status === 'paused' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
            }`}>{p.status}</span>
          </div>
          <div className="flex items-center gap-3 text-[10.5px] text-zinc-500 dark:text-zinc-400 font-mono">
            <span>{p.commission_model.kind === 'percent' ? `${p.commission_model.amount}%` : `$${p.commission_model.amount}${p.commission_model.kind === 'recurring' ? '/mo' : ''}`}</span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span>{p.attribution_days}d window</span>
            {widgetsCount > 0 && (
              <>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <span>{widgetsCount} widgets</span>
              </>
            )}
          </div>
        </motion.button>
      ))}
    </div>
  );
};

const Section: React.FC<{ title: string; hint?: string | null; cta?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, cta, children }) => (
  <section className="mb-6">
    <div className="flex items-center justify-between mb-2.5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">{title}</h2>
      {cta}
    </div>
    {hint && <p className="text-[11px] text-zinc-400 italic mb-2">{hint}</p>}
    {children}
  </section>
);

// ── Snapshot grid (this week's metrics) ──────────────────────────
const SnapshotGrid: React.FC<{ snapshot: Snapshot }> = ({ snapshot }) => {
  const m = snapshot.metrics || {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <Metric label="Revenue paid"      value={fmtMoney(m.revenue_paid)}      tone="emerald" />
      <Metric label="Net cash"          value={fmtMoney(m.net_cash)}          tone={m.net_cash >= 0 ? 'emerald' : 'rose'} />
      <Metric label="Active retainers"  value={m.active_retainers ?? '—'}     tone="violet" hint={`${m.won_this_week ?? 0} new this week`} />
      <Metric label="Pipeline value"    value={fmtMoney(m.pipeline_value)}    tone="amber" hint={`${m.active_leads ?? 0} leads`} />
      <Metric label="Outreach sent"     value={m.outreach_sent ?? 0}          tone="zinc" hint={`${m.outreach_replied ?? 0} replies · ${m.outreach_reply_rate ?? 0}%`} />
      <Metric label="Calls scheduled"   value={m.calls_scheduled ?? 0}        tone="zinc" />
      <Metric label="Proposals sent"    value={m.proposals_sent ?? 0}         tone="zinc" />
      <Metric label="Content published" value={m.content_published ?? 0}      tone="emerald" hint={`${m.content_drafted ?? 0} drafted`} />
    </div>
  );
};

const TONE_BORDER: Record<string, string> = {
  zinc:    'text-zinc-800 dark:text-zinc-200',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  rose:    'text-rose-700 dark:text-rose-400',
  amber:   'text-amber-700 dark:text-amber-400',
  violet:  'text-violet-700 dark:text-violet-400',
};

const Metric: React.FC<{ label: string; value: string | number; tone: keyof typeof TONE_BORDER; hint?: string }> = ({ label, value, tone, hint }) => (
  <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING_ENTER}
    className="px-3 py-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900">
    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
    <div className={`text-[17px] leading-none font-semibold tabular-nums mt-1 ${TONE_BORDER[tone]}`}>{value}</div>
    {hint && <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">{hint}</div>}
  </motion.div>
);

// ── Notes editor for the weekly snapshot ─────────────────────────
const NotesEditor: React.FC<{ snapshot: Snapshot | null; onSave: (patch: Partial<Snapshot>) => Promise<void> }> = ({ snapshot, onSave }) => {
  const [highlights, setHighlights] = useState(snapshot?.highlights || '');
  const [blockers, setBlockers] = useState(snapshot?.blockers || '');
  const [priorities, setPriorities] = useState((snapshot?.next_week_priorities || []).join(', '));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setHighlights(snapshot?.highlights || '');
    setBlockers(snapshot?.blockers || '');
    setPriorities((snapshot?.next_week_priorities || []).join(', '));
  }, [snapshot?.id, snapshot?.highlights, snapshot?.blockers, snapshot?.next_week_priorities]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        highlights: highlights || null,
        blockers: blockers || null,
        next_week_priorities: priorities.split(',').map(s => s.trim()).filter(Boolean),
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NotesField label="Highlights" tone="emerald" value={highlights} onChange={setHighlights} placeholder="What went well this week?" />
        <NotesField label="Blockers" tone="rose" value={blockers} onChange={setBlockers} placeholder="What's stuck? What needs help?" />
      </div>
      <NotesField label="Next week priorities" tone="violet" value={priorities} onChange={setPriorities} placeholder="Comma-separated: close Sunnyside deal, ship blog post, hire content creator" />
      <div className="flex items-center justify-end">
        <motion.button onClick={handleSave} disabled={saving} whileTap={{ scale: 0.97, transition: SPRING_TAP }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors">
          {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save notes</>}
        </motion.button>
      </div>
    </div>
  );
};

const NotesField: React.FC<{ label: string; tone: 'emerald'|'rose'|'violet'; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, tone, value, onChange, placeholder }) => (
  <label className="block">
    <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
      tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'rose' ? 'text-rose-700 dark:text-rose-400'
      : 'text-violet-700 dark:text-violet-400'
    }`}>{label}</div>
    <textarea rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none" />
  </label>
);

// ── KPI grid ──────────────────────────────────────────────────────
const KpiGrid: React.FC<{ kpis: Kpi[]; onEdit: (k: Kpi) => void }> = ({ kpis, onEdit }) => {
  if (kpis.length === 0) {
    return <p className="text-[11px] text-zinc-400 italic">No KPIs defined yet. Click "Add KPI" to define your north-star metrics.</p>;
  }
  // Synthesize an 8-week sparkline shape based on trend direction.
  // Real per-week history would replace this once snapshots accumulate.
  const sparkFor = (trend: Kpi['trend']): number[] => {
    if (trend === 'up')   return [3, 3, 4, 4, 5, 4, 5, 6];
    if (trend === 'down') return [6, 5, 5, 4, 4, 3, 3, 2];
    return [4, 5, 4, 5, 4, 5, 4, 5];
  };
  return (
    <div className="bdg-kpi-row">
      {kpis.map((k, idx) => {
        const hit = k.target_value != null && k.current_value != null && k.current_value >= k.target_value;
        const pct = k.target_value && k.current_value != null ? Math.min(100, (k.current_value / k.target_value) * 100) : null;
        const spark = sparkFor(k.trend);
        const max = Math.max(...spark);
        const deltaCls = k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : 'flat';
        const deltaArrow = k.trend === 'up' ? '↑' : k.trend === 'down' ? '↓' : '→';
        return (
          <motion.button
            key={k.id}
            onClick={() => onEdit(k)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
            whileTap={{ scale: 0.98, transition: SPRING_TAP }}
            className="bdg-kpi"
          >
            {/* Header — mono label + delta pill */}
            <div className="bdg-kpi-head">
              <span className="bdg-kpi-lbl">
                {k.category && <span className="ic"><Icons.Activity size={11} /></span>}
                {k.metric_name}
              </span>
              {k.trend && (
                <span className={`bdg-kpi-delta ${deltaCls}`}>
                  {deltaArrow}
                  {pct !== null ? `${Math.round(pct)}%` : k.trend}
                </span>
              )}
            </div>

            {/* Value row — editorial Light 30px + target sub */}
            <div className="bdg-kpi-row-val">
              <span className={`bdg-kpi-v ${hit ? 'hit' : ''}`}>
                {k.current_value ?? '—'}
                {k.target_unit && <span style={{ fontSize: 16, marginLeft: 4, opacity: 0.6 }}>{k.target_unit}</span>}
              </span>
              {k.target_value != null && (
                <span className="bdg-kpi-target">
                  goal {k.target_value.toLocaleString()}
                </span>
              )}
            </div>

            {/* Progress bar — shown when target is set */}
            {pct !== null && (
              <div className="bdg-kpi-bar">
                <div className={`bdg-kpi-bar-fill ${hit ? 'hit' : ''}`} style={{ width: `${pct}%` }} />
              </div>
            )}

            {/* Sparkline — 8 bars, last is peak (gold) */}
            <div className="bdg-kpi-spark">
              {spark.map((h, i) => (
                <span
                  key={i}
                  className={`bar ${i === spark.length - 1 ? 'peak' : ''}`}
                  style={{ height: `${(h / max) * 100}%` }}
                />
              ))}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};

// ── Phases list ───────────────────────────────────────────────────
const PHASE_TONE: Record<Phase['status'], string> = {
  active:    'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-500/30',
  completed: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30',
  upcoming:  'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
};

const PhasesList: React.FC<{ phases: Phase[]; onEdit: (p: Phase) => void }> = ({ phases, onEdit }) => {
  if (phases.length === 0) {
    return <p className="text-[11px] text-zinc-400 italic">No phases defined. Add the 4-phase roadmap to track milestones.</p>;
  }
  return (
    <div className="bdg-phase-track">
      {phases.map((p, idx) => {
        const totalMs = p.milestones.length;
        const doneMs = p.milestones.filter(m => m.completed).length;
        const pct = totalMs > 0 ? Math.round((doneMs / totalMs) * 100) : 0;
        return (
          <motion.button
            key={p.id}
            onClick={() => onEdit(p)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_ENTER, delay: idx * 0.04 }}
            className={`bdg-phase ${p.status}`}
          >
            <div className="bdg-phase-n">
              Phase {String(p.phase_number).padStart(2, '0')} · {p.status}
            </div>
            <div className="bdg-phase-name">{p.title}</div>
            {p.timeline && <div className="bdg-phase-range">{p.timeline}</div>}
            <div className="bdg-phase-bar">
              <div className="bdg-phase-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="bdg-phase-pct">
              <span>{doneMs}/{totalMs} milestones</span>
              <strong>{pct}%</strong>
            </div>
            {/* hidden legacy details kept for layout completeness */}
            <div className="hidden">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${PHASE_TONE[p.status]}`}>{p.status}</span>
            </div>
            {totalMs > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
                <div className="flex items-center justify-between text-[10.5px] mb-1">
                  <span className="text-zinc-500 dark:text-zinc-400">Milestones</span>
                  <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{doneMs}/{totalMs}</span>
                </div>
                <div className="h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.round((doneMs / totalMs) * 100)}%` }} />
                </div>
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

// ── Modal shell + form bits ──────────────────────────────────────
const inputClass = 'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12.5px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <div className="flex items-baseline gap-2 mb-1.5"><span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>{hint && <span className="text-[10px] text-zinc-400">{hint}</span>}</div>
    {children}
  </label>
);

const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({ title, onClose, children, footer }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose}
    className="fixed inset-0 z-[70] bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <motion.div onClick={e => e.stopPropagation()}
      initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }} transition={SPRING_ENTER}
      className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <button onClick={onClose} className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"><Icons.X size={14} /></button>
      </div>
      <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">{children}</div>
      <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">{footer}</div>
    </motion.div>
  </motion.div>
);

// ── KPI modal ────────────────────────────────────────────────────
const KpiModal: React.FC<{ value: Kpi | null; onClose: () => void; onSaved: () => void }> = ({ value, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_KPI>({ ...EMPTY_KPI, ...(value ? {
    metric_name: value.metric_name, target_value: value.target_value, target_unit: value.target_unit,
    current_value: value.current_value, trend: value.trend, category: value.category,
    last_updated: value.last_updated,
  } : {}) });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handleSave = async () => {
    if (!currentTenant?.id || !form.metric_name.trim()) return;
    setSaving(true);
    try {
      const patch = { ...form, last_updated: new Date().toISOString() };
      if (value) await supabase.from('growth_kpis').update(patch).eq('id', value.id);
      else await supabase.from('growth_kpis').insert({ ...patch, tenant_id: currentTenant.id });
      onSaved();
    } finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!value || !confirm(`Delete KPI "${value.metric_name}"?`)) return;
    setDeleting(true);
    try { await supabase.from('growth_kpis').delete().eq('id', value.id); onSaved(); }
    finally { setDeleting(false); }
  };
  return (
    <ModalShell title={value ? `Edit KPI — ${value.metric_name}` : 'New KPI'} onClose={onClose} footer={
      <>
        {value && <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Deleting…' : 'Delete'}</button>}
        <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
          {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
        </button>
      </>
    }>
      <Field label="Metric name"><input className={inputClass} value={form.metric_name} onChange={e => setForm(f => ({ ...f, metric_name: e.target.value }))} placeholder="clients_with_retainer" /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Target"><input type="number" className={inputClass} value={form.target_value ?? ''} onChange={e => setForm(f => ({ ...f, target_value: e.target.value === '' ? null : Number(e.target.value) }))} /></Field>
        <Field label="Current"><input type="number" className={inputClass} value={form.current_value ?? ''} onChange={e => setForm(f => ({ ...f, current_value: e.target.value === '' ? null : Number(e.target.value) }))} /></Field>
        <Field label="Unit"><input className={inputClass} value={form.target_unit || ''} onChange={e => setForm(f => ({ ...f, target_unit: e.target.value || null }))} placeholder="count, $, %" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><input className={inputClass} value={form.category || ''} onChange={e => setForm(f => ({ ...f, category: e.target.value || null }))} placeholder="revenue, content, sales, operations" /></Field>
        <Field label="Trend"><select className={inputClass} value={form.trend || ''} onChange={e => setForm(f => ({ ...f, trend: (e.target.value || null) as Kpi['trend'] }))}><option value="">—</option><option value="up">up ↑</option><option value="down">down ↓</option><option value="flat">flat →</option></select></Field>
      </div>
    </ModalShell>
  );
};

// ── Phase modal ───────────────────────────────────────────────────
const PhaseModal: React.FC<{ value: Phase | null; nextNumber: number; onClose: () => void; onSaved: () => void }> = ({ value, nextNumber, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_PHASE>({ ...EMPTY_PHASE, phase_number: nextNumber, ...(value ? {
    phase_number: value.phase_number, title: value.title, timeline: value.timeline, status: value.status,
    milestones: value.milestones, started_at: value.started_at, completed_at: value.completed_at,
  } : {}) });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handleSave = async () => {
    if (!currentTenant?.id || !form.title.trim()) return;
    setSaving(true);
    try {
      if (value) await supabase.from('growth_phases').update(form).eq('id', value.id);
      else await supabase.from('growth_phases').insert({ ...form, tenant_id: currentTenant.id });
      onSaved();
    } finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!value || !confirm(`Delete phase "${value.title}"?`)) return;
    setDeleting(true);
    try { await supabase.from('growth_phases').delete().eq('id', value.id); onSaved(); }
    finally { setDeleting(false); }
  };
  const toggleMs = (i: number) => {
    setForm(f => ({ ...f, milestones: f.milestones.map((m, idx) => idx === i ? { ...m, completed: !m.completed } : m) }));
  };
  const addMs = () => setForm(f => ({ ...f, milestones: [...f.milestones, { title: '', completed: false, target_date: null }] }));
  const updateMs = (i: number, patch: Partial<Phase['milestones'][number]>) => {
    setForm(f => ({ ...f, milestones: f.milestones.map((m, idx) => idx === i ? { ...m, ...patch } : m) }));
  };
  const removeMs = (i: number) => setForm(f => ({ ...f, milestones: f.milestones.filter((_, idx) => idx !== i) }));
  return (
    <ModalShell title={value ? `Edit phase — ${value.title}` : 'New phase'} onClose={onClose} footer={
      <>
        {value && <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Deleting…' : 'Delete'}</button>}
        <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
          {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
        </button>
      </>
    }>
      <div className="grid grid-cols-4 gap-3">
        <Field label="#"><input type="number" className={inputClass} value={form.phase_number} onChange={e => setForm(f => ({ ...f, phase_number: Number(e.target.value) }))} /></Field>
        <div className="col-span-3"><Field label="Title"><input className={inputClass} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Foundation" /></Field></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Timeline"><input className={inputClass} value={form.timeline || ''} onChange={e => setForm(f => ({ ...f, timeline: e.target.value || null }))} placeholder="Mes 1-2" /></Field>
        <Field label="Status"><select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Phase['status'] }))}><option value="upcoming">upcoming</option><option value="active">active</option><option value="completed">completed</option></select></Field>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">Milestones</span>
          <button onClick={addMs} className="text-[10.5px] font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 px-1.5 py-0.5 rounded inline-flex items-center gap-1"><Icons.Plus size={10} /> Add</button>
        </div>
        <div className="space-y-1.5">
          {form.milestones.length === 0 && <p className="text-[11px] text-zinc-400 italic">No milestones yet.</p>}
          {form.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="checkbox" checked={m.completed} onChange={() => toggleMs(i)} className="rounded" />
              <input className={`${inputClass} flex-1`} value={m.title} onChange={e => updateMs(i, { title: e.target.value })} placeholder="Milestone…" />
              <input type="date" className={inputClass + ' w-36'} value={m.target_date || ''} onChange={e => updateMs(i, { target_date: e.target.value || null })} />
              <button onClick={() => removeMs(i)} className="p-1 text-zinc-400 hover:text-rose-500"><Icons.X size={12} /></button>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
};

// ─────────────────────────────────────────────────────────────
// PIPELINE METRICS (bundle's GrowthMetrics port)
// Funnel + Source effectiveness + Weighted revenue forecast.
// All three computed from `leads` rows (90-day window). Stage codes
// inferred from `status` + the lead's lifecycle history.
// Source: livv-update / livv-os-remaining.jsx :: GrowthMetrics.
// ─────────────────────────────────────────────────────────────
interface LeadLite { id: string; status: string; source: string | null; budget: number | null; created_at: string; name?: string | null; company?: string | null; }

const FUNNEL_STAGES = [
  { id: 'new',         label: 'New',         status: 'new' },
  { id: 'contacted',   label: 'Contacted',   status: 'contacted' },
  { id: 'following',   label: 'Call done',   status: 'following' },
  { id: 'proposal',    label: 'Proposal',    status: 'following' },   // we don't have a dedicated proposal status; share with following
  { id: 'negotiating', label: 'Negotiating', status: 'following' },
  { id: 'closed',      label: 'Won',         status: 'closed' },
];

const PipelineMetrics: React.FC<{ leads: LeadLite[] }> = ({ leads }) => {
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center bg-white/40 dark:bg-zinc-900/30">
        <p className="text-[12px] text-zinc-500">No leads yet. Add leads from <strong>Sales → Pipeline</strong> to see the funnel here.</p>
      </div>
    );
  }
  // Count by status — every lead counts in 'New' (top of funnel), then in
  // the deeper stage if it advanced past it. Closed deals always sit at
  // the bottom regardless of intermediate moves.
  const countAt = (statusId: string): number => {
    if (statusId === 'new')       return leads.length;
    if (statusId === 'contacted') return leads.filter(l => l.status !== 'new').length;
    if (statusId === 'following') return leads.filter(l => l.status === 'following' || l.status === 'closed').length;
    if (statusId === 'closed')    return leads.filter(l => l.status === 'closed').length;
    return 0;
  };
  // Map FUNNEL_STAGES to actual counts with a decreasing gradient.
  const funnel = [
    { stage: 'New',         n: countAt('new'),        w: 100 },
    { stage: 'Contacted',   n: countAt('contacted'),  w: 82 },
    { stage: 'Call done',   n: countAt('following'),  w: 62 },
    { stage: 'Won',         n: countAt('closed'),     w: 36 },
  ].map((f, i, arr) => ({
    ...f,
    conv: i === 0 ? null : arr[i - 1].n > 0 ? `${Math.round((f.n / arr[i - 1].n) * 100)}%` : '—',
    totalPct: arr[0].n > 0 ? Math.round((f.n / arr[0].n) * 100) : 0,
  }));

  // Source effectiveness — group by lead.source, count + conversion rate
  // (% closed) + average deal size.
  const sourceMap = new Map<string, { leads: number; closed: number; revenue: number }>();
  leads.forEach(l => {
    const src = (l.source || 'unknown').trim() || 'unknown';
    const entry = sourceMap.get(src) || { leads: 0, closed: 0, revenue: 0 };
    entry.leads += 1;
    if (l.status === 'closed') {
      entry.closed += 1;
      entry.revenue += l.budget || 0;
    }
    sourceMap.set(src, entry);
  });
  const sources = Array.from(sourceMap.entries())
    .map(([name, e]) => ({
      l: name === 'unknown' ? 'Unknown' : name.charAt(0).toUpperCase() + name.slice(1),
      c: name === 'LinkedIn' ? '#6DBEDC' : name === 'Referral' ? '#C4A35A' : name === 'Inbound' ? '#769268' : '#F1ADD8',
      leads: e.leads,
      rate: e.leads > 0 ? `${Math.round((e.closed / e.leads) * 100)}%` : '0%',
      adv: `$${Math.round((e.revenue / Math.max(1, e.closed)) / 1000)}K`,
    }))
    .sort((a, b) => b.leads - a.leads);
  const totalLeads = sources.reduce((s, x) => s + x.leads, 0) || 1;

  // Weighted revenue forecast — by stage with bundle's % weights.
  const forecast = [
    { stage: 'Call done · 30%',   weight: 0.30, count: leads.filter(l => l.status === 'following').length,                                    },
    { stage: 'Proposal · 55%',     weight: 0.55, count: 0 },  // not tracked
    { stage: 'Negotiating · 75%',  weight: 0.75, count: 0 },  // not tracked
    { stage: 'Won · 100%',          weight: 1.00, count: leads.filter(l => l.status === 'closed').length },
  ].map(f => {
    const avgDeal = leads.filter(l => l.status === 'closed' && l.budget).reduce((s, l) => s + (l.budget || 0), 0)
                    / Math.max(1, leads.filter(l => l.status === 'closed' && l.budget).length);
    const totalValue = f.count * (avgDeal || 0);
    return { ...f, v: totalValue / 1000, w: (totalValue / 1000) * f.weight };
  });
  const totalForecast = forecast.reduce((s, f) => s + f.w, 0);
  const maxWeighted = Math.max(...forecast.map(f => f.w), 1);

  return (
    <div className="space-y-4">
      {/* Funnel */}
      <section className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <header className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
            <Icons.Chart size={12} />
            Pipeline funnel · last 90 days
          </span>
          <span className="text-[10.5px] font-mono text-zinc-400">Last 90 days</span>
        </header>
        <div className="px-5 py-5 space-y-2">
          {funnel.map((f, i) => (
            <div key={f.stage} className="grid items-center gap-3" style={{ gridTemplateColumns: '110px 1fr 90px 70px' }}>
              <span className="text-[12px] text-zinc-700 dark:text-zinc-300">{f.stage}</span>
              <div className="h-8 relative flex items-center">
                <div
                  className="h-full rounded-md flex items-center pl-3 text-[12px] font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums transition-all"
                  style={{
                    width: `${f.w}%`,
                    background: `linear-gradient(90deg, color-mix(in oklab, rgb(196,163,90) ${30 + i * 8}%, white), color-mix(in oklab, rgb(196,163,90) ${20 + i * 8}%, white))`,
                  }}
                >
                  {f.n}
                </div>
              </div>
              <span className="text-[11px] font-mono text-zinc-500">{f.conv ? `${f.conv} conv` : 'entered'}</span>
              <span className="text-[11px] font-mono text-zinc-400 text-right">{f.totalPct}% total</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source effectiveness */}
        <section className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <header className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60">
            <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
              <Icons.Target size={12} />
              Source effectiveness
            </span>
          </header>
          <div>
            {sources.map((s, i) => (
              <div key={s.l} className={`px-4 py-2.5 grid items-center gap-3 ${i < sources.length - 1 ? 'border-b border-dashed border-zinc-100 dark:border-zinc-800/60' : ''}`} style={{ gridTemplateColumns: '90px 1fr 70px 70px' }}>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-700 dark:text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.c }} />
                  {s.l}
                </span>
                <div className="h-1.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(s.leads / totalLeads) * 100}%`, background: s.c }} />
                </div>
                <span className="text-[11.5px] font-mono text-zinc-700 dark:text-zinc-300 text-right">{s.leads} leads</span>
                <span className="text-[11.5px] font-mono font-semibold text-zinc-900 dark:text-zinc-100 text-right">{s.rate}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Revenue forecast */}
        <section className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <header className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60">
            <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
              <Icons.DollarSign size={12} />
              Revenue forecast · weighted
            </span>
          </header>
          <div className="p-4 space-y-3">
            {forecast.map((r, i) => (
              <div key={i} className={`pb-2 ${i < forecast.length - 1 ? 'border-b border-dashed border-zinc-100 dark:border-zinc-800/60' : ''}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-zinc-700 dark:text-zinc-300">{r.stage}</span>
                  <span className="text-[11.5px] font-mono text-zinc-900 dark:text-zinc-100 font-medium">${r.w.toFixed(0)}K weighted</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${(r.w / maxWeighted) * 100}%` }} />
                </div>
              </div>
            ))}
            <div className="mt-3 p-3 rounded-xl flex items-baseline justify-between" style={{ background: '#2C0405', color: '#FDFBF7' }}>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">Total forecast · 90d</span>
              <span className="text-[22px] font-light tracking-tight tabular-nums">${Math.round(totalForecast)}K</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

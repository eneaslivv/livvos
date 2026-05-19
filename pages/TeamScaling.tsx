/**
 * Team & Scaling — the org-chart-as-product.
 *
 * Distinct from the existing Team page (which manages tenant_members
 * for auth/RLS). This page tracks:
 *   • Role definitions — positions we WANT (planned → hiring → filled)
 *   • People — contractors/employees with rates + start dates
 *   • KPI logs — weekly/monthly metric records vs targets
 *
 * Tabs: Roles · People · KPIs.
 * Top stats: total monthly cost + filled vs planned + KPIs hit rate.
 *
 * Not done yet (deferred):
 *   • Org chart visualization
 *   • Hiring roadmap timeline (just shows hire_phase as a chip)
 *   • Per-role KPI dashboard charts
 *   • Auto-pull KPI actuals from other modules (Phase 5 automations)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';
import { SPRING_ENTER, SPRING_TAP } from '../lib/ui/motion';
import '../components/livv/bundle-strategy.css';

interface Role {
  id: string;
  tenant_id: string;
  title: string;
  department: string | null;
  type: 'contractor' | 'part_time' | 'full_time';
  hire_phase: string | null;
  hire_priority: number | null;
  rationale: string | null;
  tasks: string[];
  skills_required: string[];
  kpis: Array<{ metric: string; target: number; unit: string }>;
  estimated_cost_monthly: number | null;
  status: 'planned' | 'hiring' | 'filled' | 'paused';
  created_at: string;
}

interface Member {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  role_id: string | null;
  type: 'contractor' | 'part_time' | 'full_time';
  start_date: string | null;
  rate_monthly: number | null;
  rate_type: 'monthly' | 'hourly' | 'commission' | 'project' | null;
  status: 'active' | 'trial' | 'offboarded';
  notes: string | null;
  created_at: string;
}

interface KpiLog {
  id: string;
  tenant_id: string;
  member_id: string | null;
  role_id: string | null;
  period_start: string;
  period_end: string;
  metric_name: string;
  target_value: number | null;
  actual_value: number | null;
  notes: string | null;
  created_at: string;
}

type Tab = 'roles' | 'people' | 'kpis';

const STATUS_TONE: Record<string, string> = {
  active:     'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30',
  trial:      'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-500/30',
  offboarded: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
  planned:    'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200/60 dark:border-blue-500/30',
  hiring:     'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-500/30',
  filled:     'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30',
  paused:     'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
};

const fmtMoney = (n: number | null | undefined): string => n == null ? '—' : `$${n.toLocaleString('en-US')}`;

const EMPTY_ROLE: Omit<Role, 'id' | 'tenant_id' | 'created_at'> = {
  title: '', department: null, type: 'contractor', hire_phase: null, hire_priority: null,
  rationale: null, tasks: [], skills_required: [], kpis: [], estimated_cost_monthly: null,
  status: 'planned',
};
const EMPTY_MEMBER: Omit<Member, 'id' | 'tenant_id' | 'created_at'> = {
  name: '', email: null, user_id: null, role_id: null, type: 'contractor',
  start_date: null, rate_monthly: null, rate_type: 'monthly', status: 'active', notes: null,
};
const EMPTY_KPI: Omit<KpiLog, 'id' | 'tenant_id' | 'created_at'> = {
  member_id: null, role_id: null, period_start: new Date().toISOString().slice(0, 10),
  period_end: new Date().toISOString().slice(0, 10), metric_name: '',
  target_value: null, actual_value: null, notes: null,
};

const splitList = (s: string): string[] => s.split(',').map(x => x.trim()).filter(Boolean);

export const TeamScaling: React.FC = () => {
  const { currentTenant } = useTenant();
  const [tab, setTab] = useState<Tab>('roles');
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [kpis, setKpis] = useState<KpiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | 'new' | null>(null);
  const [editingMember, setEditingMember] = useState<Member | 'new' | null>(null);
  const [editingKpi, setEditingKpi] = useState<KpiLog | 'new' | null>(null);

  const refetch = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      const [rRes, mRes, kRes] = await Promise.all([
        supabase.from('team_role_definitions').select('*').eq('tenant_id', currentTenant.id).order('hire_priority', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }),
        supabase.from('team_member_profiles').select('*').eq('tenant_id', currentTenant.id).order('created_at', { ascending: false }),
        supabase.from('team_kpi_logs').select('*').eq('tenant_id', currentTenant.id).order('period_start', { ascending: false }).limit(100),
      ]);
      setRoles((rRes.data || []) as Role[]);
      setMembers((mRes.data || []) as Member[]);
      setKpis((kRes.data || []) as KpiLog[]);
    } catch (e) {
      errorLogger.warn('team scaling load failed', e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => { refetch(); }, [refetch]);

  // ── Top-level metrics ───────────────────────────────────────────
  const totals = useMemo(() => {
    const activeMembers = members.filter(m => m.status === 'active');
    const monthlyCost = activeMembers.reduce((s, m) => s + (m.rate_monthly || 0), 0);
    const plannedRoles = roles.filter(r => r.status === 'planned' || r.status === 'hiring').length;
    const filledRoles = roles.filter(r => r.status === 'filled').length;
    const hitKpis = kpis.filter(k => k.target_value != null && k.actual_value != null && k.actual_value >= k.target_value).length;
    const totalKpis = kpis.filter(k => k.target_value != null && k.actual_value != null).length;
    return { activeMembers: activeMembers.length, monthlyCost, plannedRoles, filledRoles, hitKpis, totalKpis };
  }, [members, roles, kpis]);

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-6">
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="bdl-page-title">Scaling</h1>
          <p className="bdl-page-sub">
            Roles · People · KPIs
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        <StatCard label="Active people" value={totals.activeMembers} hint={`${totals.plannedRoles} planned · ${totals.filledRoles} filled`} tone="zinc" />
        <StatCard label="Monthly cost" value={fmtMoney(totals.monthlyCost)} hint="sum of active rates" tone="rose" />
        <StatCard label="KPIs hit" value={totals.totalKpis === 0 ? '—' : `${totals.hitKpis} / ${totals.totalKpis}`} hint="across all logs" tone="emerald" />
        <StatCard label="Roles in pipeline" value={totals.plannedRoles + totals.filledRoles} hint="planned + hiring + filled" tone="violet" />
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="bdl-tabs">
          {([
            { id: 'roles' as const,  label: 'Roles',  icon: 'Briefcase' },
            { id: 'people' as const, label: 'People', icon: 'Users' },
            { id: 'kpis' as const,   label: 'KPIs',   icon: 'Chart' },
          ]).map(t => {
            const IconCmp = (Icons as any)[t.icon] || Icons.Sparkles;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`bdl-tab ${active ? 'active' : ''}`}
              >
                <IconCmp size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => {
            if (tab === 'roles') setEditingRole('new');
            else if (tab === 'people') setEditingMember('new');
            else setEditingKpi('new');
          }}
          className="bdl-action primary ml-auto"
        >
          <Icons.Plus size={12} />
          New {tab === 'roles' ? 'role' : tab === 'people' ? 'person' : 'KPI log'}
        </button>
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Icons.Loader className="animate-spin text-zinc-400" size={20} /></div>}

      {!loading && tab === 'roles' && (
        <RolesGrid roles={roles} members={members} onEdit={r => setEditingRole(r)} onNew={() => setEditingRole('new')} />
      )}
      {!loading && tab === 'people' && (
        <PeopleGrid members={members} roles={roles} onEdit={m => setEditingMember(m)} onNew={() => setEditingMember('new')} />
      )}
      {!loading && tab === 'kpis' && (
        <KpisList kpis={kpis} members={members} roles={roles} onEdit={k => setEditingKpi(k)} onNew={() => setEditingKpi('new')} />
      )}

      <AnimatePresence>
        {editingRole && (
          <RoleModal value={editingRole === 'new' ? null : editingRole} onClose={() => setEditingRole(null)} onSaved={() => { setEditingRole(null); refetch(); }} />
        )}
        {editingMember && (
          <MemberModal value={editingMember === 'new' ? null : editingMember} roles={roles} onClose={() => setEditingMember(null)} onSaved={() => { setEditingMember(null); refetch(); }} />
        )}
        {editingKpi && (
          <KpiModal value={editingKpi === 'new' ? null : editingKpi} members={members} roles={roles} onClose={() => setEditingKpi(null)} onSaved={() => { setEditingKpi(null); refetch(); }} />
        )}
      </AnimatePresence>
    </div>
  );
};

const TONE_NUM: Record<string, string> = {
  zinc:    'text-zinc-800 dark:text-zinc-200',
  rose:    'text-rose-700 dark:text-rose-400',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  violet:  'text-violet-700 dark:text-violet-400',
};

const StatCard: React.FC<{ label: string; value: string | number; hint?: string; tone: keyof typeof TONE_NUM }> = ({ label, value, hint, tone }) => (
  <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING_ENTER}
    className="px-3 py-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900">
    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
    <div className={`text-[17px] leading-none font-semibold tabular-nums mt-1 ${TONE_NUM[tone]}`}>{value}</div>
    {hint && <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">{hint}</div>}
  </motion.div>
);

// ── Roles grid ────────────────────────────────────────────────────
const RolesGrid: React.FC<{ roles: Role[]; members: Member[]; onEdit: (r: Role) => void; onNew: () => void }> = ({ roles, members, onEdit, onNew }) => {
  if (roles.length === 0) return <EmptyState icon="Briefcase" title="No roles defined" body="Start with the roles you'll need over the next 6 months. Each row tracks the rationale, the tasks, the KPIs, and the hire phase." cta="Define your first role" onClick={onNew} />;
  const countFilled = (role: Role) => members.filter(m => m.role_id === role.id && m.status !== 'offboarded').length;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {roles.map((r, idx) => {
        const filledCount = countFilled(r);
        return (
          <motion.button key={r.id} onClick={() => onEdit(r)}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
            whileTap={{ scale: 0.98, transition: SPRING_TAP }} whileHover={{ y: -2, transition: SPRING_TAP }}
            className="text-left p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{r.title}</h3>
                <div className="text-[10.5px] text-zinc-400 mt-0.5">
                  {r.department && <span>{r.department} · </span>}
                  {r.type}
                  {r.hire_phase && <> · {r.hire_phase}</>}
                </div>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_TONE[r.status]}`}>{r.status}</span>
            </div>
            {r.rationale && <p className="text-[11.5px] text-zinc-600 dark:text-zinc-400 line-clamp-2">{r.rationale}</p>}
            <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Cost / mo</div>
                <div className="text-zinc-800 dark:text-zinc-200 tabular-nums font-semibold mt-0.5">{fmtMoney(r.estimated_cost_monthly)}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Filled</div>
                <div className={`tabular-nums font-semibold mt-0.5 ${filledCount > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-400'}`}>{filledCount}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Priority</div>
                <div className="text-zinc-800 dark:text-zinc-200 tabular-nums font-semibold mt-0.5">{r.hire_priority ?? '—'}</div>
              </div>
            </div>
            {r.tasks.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
                {r.tasks.slice(0, 4).map(t => (
                  <span key={t} className="text-[9.5px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 truncate max-w-[140px]" title={t}>{t}</span>
                ))}
                {r.tasks.length > 4 && <span className="text-[9.5px] text-zinc-400">+{r.tasks.length - 4}</span>}
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

// ── People grid ───────────────────────────────────────────────────
const PeopleGrid: React.FC<{ members: Member[]; roles: Role[]; onEdit: (m: Member) => void; onNew: () => void }> = ({ members, roles, onEdit, onNew }) => {
  if (members.length === 0) return <EmptyState icon="Users" title="No people yet" body="Add the contractors / part-timers / full-timers actively on the team. Tracks rates + start dates + status (active / trial / offboarded)." cta="Add first person" onClick={onNew} />;
  const roleMap = useMemo(() => new Map(roles.map(r => [r.id, r])), [roles]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {members.map((m, idx) => {
        const role = m.role_id ? roleMap.get(m.role_id) : null;
        return (
          <motion.button key={m.id} onClick={() => onEdit(m)}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
            whileTap={{ scale: 0.98, transition: SPRING_TAP }} whileHover={{ y: -2, transition: SPRING_TAP }}
            className="text-left p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{m.name}</h3>
                <div className="text-[10.5px] text-zinc-400 mt-0.5 truncate">
                  {role && <span>{role.title} · </span>}
                  {m.type}
                </div>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_TONE[m.status]}`}>{m.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Rate</div>
                <div className="text-zinc-800 dark:text-zinc-200 tabular-nums font-semibold mt-0.5">{fmtMoney(m.rate_monthly)}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Type</div>
                <div className="text-zinc-800 dark:text-zinc-200 mt-0.5 lowercase">{m.rate_type || '—'}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Since</div>
                <div className="text-zinc-800 dark:text-zinc-200 tabular-nums font-mono mt-0.5">{m.start_date?.slice(0, 7) || '—'}</div>
              </div>
            </div>
            {m.email && <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate">{m.email}</div>}
          </motion.button>
        );
      })}
    </div>
  );
};

// ── KPIs list ─────────────────────────────────────────────────────
const KpisList: React.FC<{ kpis: KpiLog[]; members: Member[]; roles: Role[]; onEdit: (k: KpiLog) => void; onNew: () => void }> = ({ kpis, members, roles, onEdit, onNew }) => {
  if (kpis.length === 0) return <EmptyState icon="Chart" title="No KPI logs yet" body="Record what you measured this week / month and how it compared to the target. Used to roll up team performance in the Growth Dashboard." cta="Log first KPI" onClick={onNew} />;
  const memberMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const roleMap = useMemo(() => new Map(roles.map(r => [r.id, r])), [roles]);
  return (
    <div className="space-y-1.5">
      {kpis.map((k, idx) => {
        const member = k.member_id ? memberMap.get(k.member_id) : null;
        const role = k.role_id ? roleMap.get(k.role_id) : null;
        const hit = k.target_value != null && k.actual_value != null && k.actual_value >= k.target_value;
        const pct = k.target_value && k.actual_value != null ? Math.round((k.actual_value / k.target_value) * 100) : null;
        return (
          <motion.button key={k.id} onClick={() => onEdit(k)}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_ENTER, delay: idx * 0.02 }}
            whileTap={{ scale: 0.995, transition: SPRING_TAP }} whileHover={{ y: -1, transition: SPRING_TAP }}
            className="w-full text-left p-3 rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold text-zinc-900 dark:text-zinc-100">{k.metric_name}</span>
                  {member && <span className="text-[10.5px] text-zinc-400 truncate">· {member.name}</span>}
                  {!member && role && <span className="text-[10.5px] text-zinc-400 truncate">· {role.title}</span>}
                </div>
                <div className="text-[10.5px] text-zinc-400 font-mono tabular-nums mt-0.5">
                  {k.period_start} → {k.period_end}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-[14px] font-semibold tabular-nums ${hit ? 'text-emerald-700 dark:text-emerald-300' : pct !== null ? 'text-rose-700 dark:text-rose-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                  {k.actual_value ?? '—'} {k.target_value != null && <span className="text-[10px] text-zinc-400">/ {k.target_value}</span>}
                </div>
                {pct !== null && (
                  <div className={`text-[10px] ${hit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} tabular-nums`}>{pct}%</div>
                )}
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};

const EmptyState: React.FC<{ icon: string; title: string; body: string; cta: string; onClick: () => void }> = ({ icon, title, body, cta, onClick }) => {
  const IconCmp = (Icons as any)[icon] || Icons.Sparkles;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_ENTER}
      className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 p-12 text-center max-w-xl mx-auto">
      <IconCmp size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
      <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">{title}</h3>
      <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">{body}</p>
      <motion.button onClick={onClick} whileTap={{ scale: 0.97, transition: SPRING_TAP }} whileHover={{ y: -1, transition: SPRING_TAP }}
        className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold">
        <Icons.Plus size={12} /> {cta}
      </motion.button>
    </motion.div>
  );
};

// ── Shared modal shell + form bits ───────────────────────────────
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

// ── Role modal ────────────────────────────────────────────────────
const RoleModal: React.FC<{ value: Role | null; onClose: () => void; onSaved: () => void }> = ({ value, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_ROLE>({ ...EMPTY_ROLE, ...(value ? {
    title: value.title, department: value.department, type: value.type, hire_phase: value.hire_phase,
    hire_priority: value.hire_priority, rationale: value.rationale, tasks: value.tasks,
    skills_required: value.skills_required, kpis: value.kpis,
    estimated_cost_monthly: value.estimated_cost_monthly, status: value.status,
  } : {}) });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!currentTenant?.id || !form.title.trim()) { setError('Title required'); return; }
    setSaving(true); setError(null);
    try {
      if (value) await supabase.from('team_role_definitions').update(form).eq('id', value.id);
      else await supabase.from('team_role_definitions').insert({ ...form, tenant_id: currentTenant.id });
      onSaved();
    } catch (e: any) { setError(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!value || !confirm(`Delete role "${value.title}"?`)) return;
    setDeleting(true);
    try { await supabase.from('team_role_definitions').delete().eq('id', value.id); onSaved(); }
    finally { setDeleting(false); }
  };

  return (
    <ModalShell title={value ? `Edit role — ${value.title}` : 'New role'} onClose={onClose} footer={
      <>
        {value && <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Deleting…' : 'Delete'}</button>}
        <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
          {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
        </button>
      </>
    }>
      {error && <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}
      <Field label="Title"><input className={inputClass} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Content Creator" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Department"><input className={inputClass} value={form.department || ''} onChange={e => setForm(f => ({ ...f, department: e.target.value || null }))} placeholder="content" /></Field>
        <Field label="Type"><select className={inputClass} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Role['type'] }))}><option value="contractor">contractor</option><option value="part_time">part_time</option><option value="full_time">full_time</option></select></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Status"><select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Role['status'] }))}><option value="planned">planned</option><option value="hiring">hiring</option><option value="filled">filled</option><option value="paused">paused</option></select></Field>
        <Field label="Hire phase"><input className={inputClass} value={form.hire_phase || ''} onChange={e => setForm(f => ({ ...f, hire_phase: e.target.value || null }))} placeholder="Mes 2-3" /></Field>
        <Field label="Priority" hint="1 = first"><input type="number" className={inputClass} value={form.hire_priority ?? ''} onChange={e => setForm(f => ({ ...f, hire_priority: e.target.value === '' ? null : Number(e.target.value) }))} /></Field>
      </div>
      <Field label="Rationale" hint="Why we need this"><textarea rows={2} className={inputClass} value={form.rationale || ''} onChange={e => setForm(f => ({ ...f, rationale: e.target.value || null }))} placeholder="Frees Eneas from solo content production" /></Field>
      <Field label="Tasks" hint="Comma-separated"><textarea rows={2} className={inputClass} value={form.tasks.join(', ')} onChange={e => setForm(f => ({ ...f, tasks: splitList(e.target.value) }))} placeholder="produce 4 posts/week, edit Loom videos, manage publish calendar" /></Field>
      <Field label="Skills required" hint="Comma-separated"><input className={inputClass} value={form.skills_required.join(', ')} onChange={e => setForm(f => ({ ...f, skills_required: splitList(e.target.value) }))} placeholder="copywriting, video editing, social ops" /></Field>
      <Field label="Est. cost / mo"><input type="number" className={inputClass} value={form.estimated_cost_monthly ?? ''} onChange={e => setForm(f => ({ ...f, estimated_cost_monthly: e.target.value === '' ? null : Number(e.target.value) }))} /></Field>
    </ModalShell>
  );
};

// ── Member modal ──────────────────────────────────────────────────
const MemberModal: React.FC<{ value: Member | null; roles: Role[]; onClose: () => void; onSaved: () => void }> = ({ value, roles, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_MEMBER>({ ...EMPTY_MEMBER, ...(value ? {
    name: value.name, email: value.email, user_id: value.user_id, role_id: value.role_id, type: value.type,
    start_date: value.start_date, rate_monthly: value.rate_monthly, rate_type: value.rate_type,
    status: value.status, notes: value.notes,
  } : {}) });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!currentTenant?.id || !form.name.trim()) { setError('Name required'); return; }
    setSaving(true); setError(null);
    try {
      if (value) await supabase.from('team_member_profiles').update(form).eq('id', value.id);
      else await supabase.from('team_member_profiles').insert({ ...form, tenant_id: currentTenant.id });
      onSaved();
    } catch (e: any) { setError(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!value || !confirm(`Remove ${value.name}?`)) return;
    setDeleting(true);
    try { await supabase.from('team_member_profiles').delete().eq('id', value.id); onSaved(); }
    finally { setDeleting(false); }
  };

  return (
    <ModalShell title={value ? `Edit — ${value.name}` : 'New person'} onClose={onClose} footer={
      <>
        {value && <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Removing…' : 'Remove'}</button>}
        <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
          {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
        </button>
      </>
    }>
      {error && <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Lucia Pérez" /></Field>
        <Field label="Email"><input type="email" className={inputClass} value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value || null }))} placeholder="lucia@livv.space" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Role"><select className={inputClass} value={form.role_id || ''} onChange={e => setForm(f => ({ ...f, role_id: e.target.value || null }))}><option value="">— None —</option>{roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></Field>
        <Field label="Type"><select className={inputClass} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Member['type'] }))}><option value="contractor">contractor</option><option value="part_time">part_time</option><option value="full_time">full_time</option></select></Field>
        <Field label="Status"><select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Member['status'] }))}><option value="active">active</option><option value="trial">trial</option><option value="offboarded">offboarded</option></select></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Rate $/mo"><input type="number" className={inputClass} value={form.rate_monthly ?? ''} onChange={e => setForm(f => ({ ...f, rate_monthly: e.target.value === '' ? null : Number(e.target.value) }))} /></Field>
        <Field label="Rate type"><select className={inputClass} value={form.rate_type || ''} onChange={e => setForm(f => ({ ...f, rate_type: (e.target.value || null) as Member['rate_type'] }))}><option value="">—</option><option value="monthly">monthly</option><option value="hourly">hourly</option><option value="commission">commission</option><option value="project">project</option></select></Field>
        <Field label="Start date"><input type="date" className={inputClass} value={form.start_date || ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value || null }))} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} className={inputClass} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} /></Field>
    </ModalShell>
  );
};

// ── KPI modal ─────────────────────────────────────────────────────
const KpiModal: React.FC<{ value: KpiLog | null; members: Member[]; roles: Role[]; onClose: () => void; onSaved: () => void }> = ({ value, members, roles, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_KPI>({ ...EMPTY_KPI, ...(value ? {
    member_id: value.member_id, role_id: value.role_id, period_start: value.period_start, period_end: value.period_end,
    metric_name: value.metric_name, target_value: value.target_value, actual_value: value.actual_value, notes: value.notes,
  } : {}) });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!currentTenant?.id || !form.metric_name.trim()) { setError('Metric name required'); return; }
    setSaving(true); setError(null);
    try {
      if (value) await supabase.from('team_kpi_logs').update(form).eq('id', value.id);
      else await supabase.from('team_kpi_logs').insert({ ...form, tenant_id: currentTenant.id });
      onSaved();
    } catch (e: any) { setError(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!value || !confirm('Delete this KPI log?')) return;
    setDeleting(true);
    try { await supabase.from('team_kpi_logs').delete().eq('id', value.id); onSaved(); }
    finally { setDeleting(false); }
  };

  return (
    <ModalShell title={value ? 'Edit KPI log' : 'New KPI log'} onClose={onClose} footer={
      <>
        {value && <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Deleting…' : 'Delete'}</button>}
        <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
          {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
        </button>
      </>
    }>
      {error && <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}
      <Field label="Metric name"><input className={inputClass} value={form.metric_name} onChange={e => setForm(f => ({ ...f, metric_name: e.target.value }))} placeholder="posts_published" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Period start"><input type="date" className={inputClass} value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} /></Field>
        <Field label="Period end"><input type="date" className={inputClass} value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Member"><select className={inputClass} value={form.member_id || ''} onChange={e => setForm(f => ({ ...f, member_id: e.target.value || null }))}><option value="">— None —</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Role"><select className={inputClass} value={form.role_id || ''} onChange={e => setForm(f => ({ ...f, role_id: e.target.value || null }))}><option value="">— None —</option>{roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target"><input type="number" className={inputClass} value={form.target_value ?? ''} onChange={e => setForm(f => ({ ...f, target_value: e.target.value === '' ? null : Number(e.target.value) }))} /></Field>
        <Field label="Actual"><input type="number" className={inputClass} value={form.actual_value ?? ''} onChange={e => setForm(f => ({ ...f, actual_value: e.target.value === '' ? null : Number(e.target.value) }))} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} className={inputClass} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} /></Field>
    </ModalShell>
  );
};

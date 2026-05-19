/**
 * Sales Pipeline — the funnel from first contact to closed retainer.
 * Lives in Sales mode → Pipeline.
 *
 * Layout: 9-column kanban (new → contacted → call_scheduled →
 * call_done → proposal_sent → negotiating → won / lost / nurturing).
 * Click any lead card to open a slide-in detail panel with full
 * outreach history + notes + next action + add-outreach inline.
 *
 * Cross-links:
 *   • icp_id  → strategy_icps (target audience)
 *   • package_id → strategy_packages (proposed offer)
 *
 * Not done yet (deferred):
 *   • AI features (personalized outreach draft, pre-call brief, Loom
 *     script generation)
 *   • Auto-create project + invoice on 'won' (cross-module automation)
 *   • Drag-drop on kanban — for now, forward/back arrows on each card
 *   • Bulk import from CSV
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';
import { SPRING_ENTER, SPRING_TAP } from '../lib/ui/motion';

// ── Types mirroring the DB schema ─────────────────────────────────
type LeadStatus = 'new' | 'contacted' | 'call_scheduled' | 'call_done'
               | 'proposal_sent' | 'negotiating' | 'won' | 'lost' | 'nurturing';

interface Lead {
  id: string;
  tenant_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  source: string | null;
  icp_id: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  package_id: string | null;
  deal_value_implementation: number | null;
  deal_value_monthly: number | null;
  lost_reason: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  created_at: string;
  updated_at: string;
}

interface Outreach {
  id: string;
  tenant_id: string;
  lead_id: string;
  channel: string;
  message_type: string | null;
  content: string | null;
  loom_url: string | null;
  sent_at: string;
  response_received: boolean;
  response_at: string | null;
  response_summary: string | null;
  created_by: string | null;
  created_at: string;
}

interface ICP { id: string; name: string }
interface Pkg { id: string; name: string; price_implementation: number | null; price_monthly: number | null }

// The 6-stage active flow surfaced as kanban columns. lost + nurturing
// are reachable via the lead detail panel (terminal/parked statuses)
// but don't deserve columns of their own in the active flow.
const FLOW_STAGES: Array<{ id: LeadStatus; label: string; tone: string }> = [
  { id: 'new',            label: 'New',            tone: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' },
  { id: 'contacted',      label: 'Contacted',      tone: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { id: 'call_scheduled', label: 'Call scheduled', tone: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  { id: 'call_done',      label: 'Call done',      tone: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  { id: 'proposal_sent',  label: 'Proposal sent',  tone: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  { id: 'negotiating',    label: 'Negotiating',    tone: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  { id: 'won',            label: 'Won',            tone: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
];

const SOURCE_OPTIONS = ['linkedin','instagram','referral','outbound','contra','inbound','other'];
const CHANNEL_OPTIONS = ['email','linkedin_dm','loom','call','whatsapp','other'];
const MESSAGE_TYPES = ['cold_intro','follow_up','case_study_share','proposal','check_in','other'];

const EMPTY_LEAD: Omit<Lead, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> = {
  company_name: '',
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  source: null,
  icp_id: null,
  status: 'new',
  assigned_to: null,
  package_id: null,
  deal_value_implementation: null,
  deal_value_monthly: null,
  lost_reason: null,
  notes: null,
  next_action: null,
  next_action_date: null,
};

const fmtMoney = (n: number | null | undefined): string =>
  n == null ? '—' : `$${n.toLocaleString('en-US')}`;

const fmtRelative = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

export const SalesPipeline: React.FC = () => {
  const { currentTenant } = useTenant();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [icps, setIcps] = useState<ICP[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);

  const refetch = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      const [lRes, iRes, pRes] = await Promise.all([
        supabase.from('sales_leads').select('*').eq('tenant_id', currentTenant.id).order('updated_at', { ascending: false }),
        supabase.from('strategy_icps').select('id, name').eq('tenant_id', currentTenant.id),
        supabase.from('strategy_packages').select('id, name, price_implementation, price_monthly').eq('tenant_id', currentTenant.id),
      ]);
      setLeads((lRes.data || []) as Lead[]);
      setIcps((iRes.data || []) as ICP[]);
      setPackages((pRes.data || []) as Pkg[]);
    } catch (e) {
      errorLogger.warn('sales pipeline load failed', e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => { refetch(); }, [refetch]);

  // ── Group by active-flow stage ───────────────────────────────────
  // Lost / nurturing are excluded from the columns + surfaced in
  // separate counters at the top instead.
  const byStage = useMemo(() => {
    const m: Record<LeadStatus, Lead[]> = {
      new: [], contacted: [], call_scheduled: [], call_done: [],
      proposal_sent: [], negotiating: [], won: [], lost: [], nurturing: [],
    };
    for (const l of leads) m[l.status].push(l);
    return m;
  }, [leads]);

  // ── Pipeline totals across the active stages ─────────────────────
  const totals = useMemo(() => {
    const active = leads.filter(l => l.status !== 'lost');
    return {
      activeCount:    active.length,
      lostCount:      byStage.lost.length,
      nurturingCount: byStage.nurturing.length,
      implValue:      active.reduce((s, l) => s + (l.deal_value_implementation || 0), 0),
      mrrValue:       active.reduce((s, l) => s + (l.deal_value_monthly || 0), 0),
      wonImplValue:   byStage.won.reduce((s, l) => s + (l.deal_value_implementation || 0), 0),
      wonMrrValue:    byStage.won.reduce((s, l) => s + (l.deal_value_monthly || 0), 0),
    };
  }, [leads, byStage]);

  const handleMoveStatus = async (lead: Lead, newStatus: LeadStatus) => {
    try {
      const patch: any = { status: newStatus };
      // Convenience: when marking lost without a reason yet, the
      // detail panel prompts for one. From the kanban we just write.
      await supabase.from('sales_leads').update(patch).eq('id', lead.id);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus, updated_at: new Date().toISOString() } : l));
      if (openLead?.id === lead.id) setOpenLead({ ...openLead, status: newStatus });
    } catch (e) {
      errorLogger.warn('lead status change failed', e);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Pipeline</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Every lead from first contact to closed retainer. Click a card for full history.
          </p>
        </div>
        <motion.button
          onClick={() => setCreating(true)}
          whileTap={{ scale: 0.97, transition: SPRING_TAP }}
          whileHover={{ y: -1, transition: SPRING_TAP }}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity"
        >
          <Icons.Plus size={13} />
          New lead
        </motion.button>
      </header>

      {/* Top totals — 4 quick metrics across the active funnel. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
        <TotalCard label="Active leads" value={totals.activeCount} hint={`${totals.lostCount} lost · ${totals.nurturingCount} nurturing`} tone="zinc" />
        <TotalCard label="Pipeline implementation $" value={fmtMoney(totals.implValue)} hint="active leads" tone="violet" />
        <TotalCard label="Pipeline MRR potential" value={fmtMoney(totals.mrrValue)} hint="per month at win" tone="amber" />
        <TotalCard label="Won — implementation" value={fmtMoney(totals.wonImplValue)} hint={`${byStage.won.length} deal${byStage.won.length === 1 ? '' : 's'}`} tone="emerald" />
        <TotalCard label="Won — MRR" value={fmtMoney(totals.wonMrrValue)} hint="recurring monthly" tone="emerald" />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Icons.Loader className="animate-spin text-zinc-400" size={20} />
        </div>
      )}

      {!loading && leads.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_ENTER}
          className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 p-12 text-center max-w-xl mx-auto"
        >
          <Icons.Target size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">No leads yet</h3>
          <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">
            Track every prospect from first DM to signed contract. Each lead carries its source,
            target ICP, proposed package, and a full outreach log.
          </p>
          <motion.button
            onClick={() => setCreating(true)}
            whileTap={{ scale: 0.97, transition: SPRING_TAP }}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold"
          >
            <Icons.Plus size={12} />
            Add your first lead
          </motion.button>
        </motion.div>
      )}

      {!loading && leads.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-2">
          {FLOW_STAGES.map(stage => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              leads={byStage[stage.id]}
              icps={icps}
              onOpenLead={setOpenLead}
              onMoveStatus={handleMoveStatus}
            />
          ))}
        </div>
      )}

      {/* Lost + nurturing — accessible but de-emphasized */}
      {!loading && (byStage.lost.length > 0 || byStage.nurturing.length > 0) && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2">
          {byStage.lost.length > 0 && (
            <ParkedColumn label="Lost" tone="rose" leads={byStage.lost} icps={icps} onOpenLead={setOpenLead} />
          )}
          {byStage.nurturing.length > 0 && (
            <ParkedColumn label="Nurturing" tone="zinc" leads={byStage.nurturing} icps={icps} onOpenLead={setOpenLead} />
          )}
        </div>
      )}

      {/* Modals + slide-in detail */}
      <AnimatePresence>
        {creating && (
          <LeadFormModal
            value={null}
            icps={icps}
            packages={packages}
            onClose={() => setCreating(false)}
            onSaved={() => { setCreating(false); refetch(); }}
          />
        )}
        {openLead && (
          <LeadDetailPanel
            lead={openLead}
            icps={icps}
            packages={packages}
            onClose={() => setOpenLead(null)}
            onSaved={() => { refetch(); }}
            onStatusChange={(s) => handleMoveStatus(openLead, s)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Top totals card ───────────────────────────────────────────────
const TONE: Record<string, string> = {
  zinc:    'text-zinc-800 dark:text-zinc-200',
  violet:  'text-violet-700 dark:text-violet-400',
  amber:   'text-amber-700 dark:text-amber-400',
  emerald: 'text-emerald-700 dark:text-emerald-400',
};

const TotalCard: React.FC<{ label: string; value: string | number; hint?: string; tone: keyof typeof TONE }> = ({ label, value, hint, tone }) => (
  <motion.div
    initial={{ opacity: 0, y: 6, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={SPRING_ENTER}
    className="px-3 py-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900"
  >
    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
    <div className={`text-[17px] leading-none font-semibold tabular-nums mt-1 ${TONE[tone]}`}>{value}</div>
    {hint && <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">{hint}</div>}
  </motion.div>
);

// ── Pipeline column ───────────────────────────────────────────────
const PipelineColumn: React.FC<{
  stage: typeof FLOW_STAGES[number];
  leads: Lead[];
  icps: ICP[];
  onOpenLead: (l: Lead) => void;
  onMoveStatus: (l: Lead, s: LeadStatus) => void;
}> = ({ stage, leads, icps, onOpenLead, onMoveStatus }) => {
  const icpMap = useMemo(() => new Map(icps.map(i => [i.id, i])), [icps]);
  const idx = FLOW_STAGES.findIndex(s => s.id === stage.id);
  const prevStage = FLOW_STAGES[idx - 1];
  const nextStage = FLOW_STAGES[idx + 1];
  // The "value" of this stage — sum of implementation + monthly deal
  // values. Quick read on where the $ sits in the funnel.
  const stageValue = leads.reduce((s, l) => s + (l.deal_value_implementation || 0), 0);
  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40 flex flex-col">
      <header className={`px-3 py-2 rounded-t-xl ${stage.tone} flex items-center gap-2`}>
        <span className="text-[11px] font-bold uppercase tracking-wider">{stage.label}</span>
        <span className="ml-auto text-[10px] font-mono tabular-nums opacity-70">{leads.length}</span>
      </header>
      {stageValue > 0 && (
        <div className="px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800/60 text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          {fmtMoney(stageValue)}
        </div>
      )}
      <div className="flex-1 p-1.5 space-y-1.5 min-h-[120px]">
        {leads.length === 0 ? (
          <div className="text-[10.5px] text-zinc-400 italic text-center py-3">empty</div>
        ) : (
          <AnimatePresence initial={false}>
            {leads.slice(0, 30).map((lead, i) => {
              const icp = lead.icp_id ? icpMap.get(lead.icp_id) : null;
              return (
                <motion.div
                  key={lead.id}
                  layout
                  initial={{ opacity: 0, y: 4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                  transition={{ ...SPRING_ENTER, delay: i < 8 ? i * 0.02 : 0 }}
                  className="group rounded-lg border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 cursor-pointer transition-colors"
                  onClick={() => onOpenLead(lead)}
                >
                  <div className="text-[12.5px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{lead.company_name}</div>
                  {lead.contact_name && (
                    <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{lead.contact_name}</div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-zinc-400">
                    {lead.deal_value_implementation && (
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">{fmtMoney(lead.deal_value_implementation)}</span>
                    )}
                    {lead.deal_value_monthly && (
                      <span className="tabular-nums">+ {fmtMoney(lead.deal_value_monthly)}/mo</span>
                    )}
                    {icp && (
                      <span className="ml-auto truncate max-w-[80px]" title={icp.name}>{icp.name}</span>
                    )}
                  </div>
                  {lead.next_action && lead.next_action_date && (
                    <div className="mt-1.5 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60 text-[10px] text-amber-700 dark:text-amber-400 truncate">
                      ⏰ {lead.next_action_date.slice(5)} · {lead.next_action}
                    </div>
                  )}
                  {/* Hover-revealed status nav */}
                  <div className="flex items-center gap-0.5 mt-1.5 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    {prevStage && (
                      <button
                        onClick={e => { e.stopPropagation(); onMoveStatus(lead, prevStage.id); }}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title={`← ${prevStage.label}`}
                      >
                        <Icons.ArrowLeft size={10} />
                      </button>
                    )}
                    {nextStage && (
                      <button
                        onClick={e => { e.stopPropagation(); onMoveStatus(lead, nextStage.id); }}
                        className="ml-auto p-1 rounded text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 inline-flex items-center gap-0.5"
                        title={`${nextStage.label} →`}
                      >
                        <span className="text-[9.5px] font-semibold">{nextStage.label}</span>
                        <Icons.ArrowLeft size={10} className="rotate-180" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
            {leads.length > 30 && (
              <div className="text-[10px] text-zinc-400 text-center py-1">+{leads.length - 30} more</div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

// ── Parked column (lost / nurturing) ──────────────────────────────
const ParkedColumn: React.FC<{
  label: string;
  tone: 'rose' | 'zinc';
  leads: Lead[];
  icps: ICP[];
  onOpenLead: (l: Lead) => void;
}> = ({ label, tone, leads, icps, onOpenLead }) => {
  const icpMap = useMemo(() => new Map(icps.map(i => [i.id, i])), [icps]);
  const toneCls = tone === 'rose'
    ? 'bg-rose-50/40 dark:bg-rose-500/5 text-rose-700 dark:text-rose-300'
    : 'bg-zinc-100/60 dark:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300';
  return (
    <div className={`rounded-xl border border-zinc-200/70 dark:border-zinc-800 ${toneCls}`}>
      <header className="px-3 py-2 flex items-center gap-2 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
        <span className="ml-auto text-[10px] font-mono tabular-nums opacity-70">{leads.length}</span>
      </header>
      <div className="p-2 space-y-1 max-h-[280px] overflow-y-auto">
        {leads.slice(0, 50).map(l => {
          const icp = l.icp_id ? icpMap.get(l.icp_id) : null;
          return (
            <button
              key={l.id}
              onClick={() => onOpenLead(l)}
              className="w-full text-left text-[11px] px-2 py-1.5 rounded-md hover:bg-white dark:hover:bg-zinc-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate flex-1">{l.company_name}</span>
                {icp && <span className="text-[9px] text-zinc-400 truncate max-w-[80px]" title={icp.name}>{icp.name}</span>}
              </div>
              {tone === 'rose' && l.lost_reason && (
                <div className="text-[10px] text-rose-600 dark:text-rose-400 truncate mt-0.5">— {l.lost_reason}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Lead form modal (create + edit basic fields) ─────────────────
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

const LeadFormModal: React.FC<{
  value: Lead | null;
  icps: ICP[];
  packages: Pkg[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ value, icps, packages, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_LEAD>({
    ...EMPTY_LEAD,
    ...(value ? {
      company_name: value.company_name,
      contact_name: value.contact_name,
      contact_email: value.contact_email,
      contact_phone: value.contact_phone,
      source: value.source,
      icp_id: value.icp_id,
      status: value.status,
      package_id: value.package_id,
      deal_value_implementation: value.deal_value_implementation,
      deal_value_monthly: value.deal_value_monthly,
      lost_reason: value.lost_reason,
      notes: value.notes,
      next_action: value.next_action,
      next_action_date: value.next_action_date,
    } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill deal values when a package is picked AND no values yet.
  const handlePackagePick = (id: string) => {
    const pkg = packages.find(p => p.id === id);
    setForm(f => ({
      ...f,
      package_id: id || null,
      deal_value_implementation: f.deal_value_implementation ?? pkg?.price_implementation ?? null,
      deal_value_monthly: f.deal_value_monthly ?? pkg?.price_monthly ?? null,
    }));
  };

  const handleSave = async () => {
    if (!currentTenant?.id) return;
    if (!form.company_name.trim()) { setError('Company name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (value) {
        const { error: err } = await supabase.from('sales_leads').update(form).eq('id', value.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('sales_leads').insert({ ...form, tenant_id: currentTenant.id });
        if (err) throw err;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
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
          <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{value ? `Edit lead — ${value.company_name}` : 'New lead'}</h3>
          <button onClick={onClose} className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <Icons.X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
          {error && <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}
          <Field label="Company name">
            <input className={inputClass} value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Sunnyside Restaurants" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name">
              <input className={inputClass} value={form.contact_name || ''} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value || null }))} placeholder="Maria López" />
            </Field>
            <Field label="Contact email">
              <input type="email" className={inputClass} value={form.contact_email || ''} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value || null }))} placeholder="maria@sunnyside.com" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <select className={inputClass} value={form.source || ''} onChange={e => setForm(f => ({ ...f, source: e.target.value || null }))}>
                <option value="">— Unknown —</option>
                {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as LeadStatus }))}>
                {FLOW_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                <option value="nurturing">Nurturing</option>
                <option value="lost">Lost</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target ICP">
              <select className={inputClass} value={form.icp_id || ''} onChange={e => setForm(f => ({ ...f, icp_id: e.target.value || null }))}>
                <option value="">— None —</option>
                {icps.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
            <Field label="Proposed package" hint="Auto-fills deal values">
              <select className={inputClass} value={form.package_id || ''} onChange={e => handlePackagePick(e.target.value)}>
                <option value="">— None —</option>
                {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Implementation $">
              <input type="number" className={inputClass} value={form.deal_value_implementation ?? ''} onChange={e => setForm(f => ({ ...f, deal_value_implementation: e.target.value === '' ? null : Number(e.target.value) }))} />
            </Field>
            <Field label="Monthly $">
              <input type="number" className={inputClass} value={form.deal_value_monthly ?? ''} onChange={e => setForm(f => ({ ...f, deal_value_monthly: e.target.value === '' ? null : Number(e.target.value) }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next action">
              <input className={inputClass} value={form.next_action || ''} onChange={e => setForm(f => ({ ...f, next_action: e.target.value || null }))} placeholder="Send revised proposal" />
            </Field>
            <Field label="Next action date">
              <input type="date" className={inputClass} value={form.next_action_date || ''} onChange={e => setForm(f => ({ ...f, next_action_date: e.target.value || null }))} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea rows={3} className={inputClass} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} placeholder="Met at industry event, very interested in the analytics piece" />
          </Field>
          {form.status === 'lost' && (
            <Field label="Lost reason">
              <input className={inputClass} value={form.lost_reason || ''} onChange={e => setForm(f => ({ ...f, lost_reason: e.target.value || null }))} placeholder="Price too high, went with competitor" />
            </Field>
          )}
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
            {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Lead detail panel — slides in from the right ─────────────────
const LeadDetailPanel: React.FC<{
  lead: Lead;
  icps: ICP[];
  packages: Pkg[];
  onClose: () => void;
  onSaved: () => void;
  onStatusChange: (s: LeadStatus) => void;
}> = ({ lead, icps, packages, onClose, onSaved, onStatusChange }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [outreach, setOutreach] = useState<Outreach[]>([]);
  const [outreachLoading, setOutreachLoading] = useState(true);
  // Sub-modal controls: edit-lead form + add-outreach form. Both
  // overlay the panel.
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingOutreachId, setDeletingOutreachId] = useState<string | null>(null);

  const icp = useMemo(() => icps.find(i => i.id === lead.icp_id) || null, [icps, lead.icp_id]);
  const pkg = useMemo(() => packages.find(p => p.id === lead.package_id) || null, [packages, lead.package_id]);

  // Fetch this lead's outreach history.
  useEffect(() => {
    let cancelled = false;
    setOutreachLoading(true);
    (async () => {
      try {
        const { data } = await supabase.from('sales_outreach')
          .select('*')
          .eq('lead_id', lead.id)
          .order('sent_at', { ascending: false });
        if (!cancelled) setOutreach((data || []) as Outreach[]);
      } finally {
        if (!cancelled) setOutreachLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [lead.id]);

  const handleDelete = async () => {
    if (!confirm(`Delete lead "${lead.company_name}"? This also removes all outreach history.`)) return;
    setDeleting(true);
    try {
      await supabase.from('sales_leads').delete().eq('id', lead.id);
      onSaved();
      onClose();
    } catch (e) {
      errorLogger.warn('delete lead failed', e);
    } finally {
      setDeleting(false);
    }
  };

  const handleAddOutreach = async (entry: Omit<Outreach, 'id' | 'tenant_id' | 'lead_id' | 'created_by' | 'created_at'>) => {
    if (!currentTenant?.id) return;
    try {
      const { data, error: err } = await supabase.from('sales_outreach').insert({
        ...entry,
        tenant_id: currentTenant.id,
        lead_id: lead.id,
        created_by: user?.id || null,
      }).select('*').single();
      if (err) throw err;
      setOutreach(prev => [data as Outreach, ...prev]);
      setAdding(false);
    } catch (e) {
      errorLogger.warn('add outreach failed', e);
    }
  };

  const handleToggleResponse = async (o: Outreach) => {
    try {
      const patch = {
        response_received: !o.response_received,
        response_at: !o.response_received ? new Date().toISOString() : null,
      };
      await supabase.from('sales_outreach').update(patch).eq('id', o.id);
      setOutreach(prev => prev.map(x => x.id === o.id ? { ...x, ...patch } : x));
    } catch (e) {
      errorLogger.warn('toggle response failed', e);
    }
  };

  const handleDeleteOutreach = async (oid: string) => {
    if (!confirm('Delete this outreach entry?')) return;
    setDeletingOutreachId(oid);
    try {
      await supabase.from('sales_outreach').delete().eq('id', oid);
      setOutreach(prev => prev.filter(x => x.id !== oid));
    } finally {
      setDeletingOutreachId(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-zinc-900/30 dark:bg-black/50 backdrop-blur-sm"
      />
      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%', transition: { type: 'spring', stiffness: 360, damping: 32 } }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        className="fixed inset-y-0 right-0 z-[71] w-full max-w-lg bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{lead.company_name}</h2>
              {lead.contact_name && (
                <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {lead.contact_name}
                  {lead.contact_email && <> · <a href={`mailto:${lead.contact_email}`} className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">{lead.contact_email}</a></>}
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <Icons.X size={14} />
            </button>
          </div>
          {/* Status selector */}
          <div className="mt-3 flex flex-wrap gap-1">
            {[...FLOW_STAGES, { id: 'nurturing' as LeadStatus, label: 'Nurturing', tone: '' }, { id: 'lost' as LeadStatus, label: 'Lost', tone: '' }].map(s => (
              <motion.button
                key={s.id}
                onClick={() => onStatusChange(s.id)}
                whileTap={{ scale: 0.94, transition: SPRING_TAP }}
                className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
                  lead.status === s.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {s.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Quick facts grid */}
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <Fact label="Implementation" value={fmtMoney(lead.deal_value_implementation)} />
            <Fact label="Monthly" value={fmtMoney(lead.deal_value_monthly)} />
            <Fact label="Source" value={lead.source || '—'} />
            <Fact label="ICP" value={icp?.name || '—'} />
            <Fact label="Package" value={pkg?.name || '—'} />
            <Fact label="Updated" value={fmtRelative(lead.updated_at)} />
          </div>

          {lead.next_action && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/30">
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">Next action</div>
              <div className="text-[12px] text-amber-900 dark:text-amber-200">
                {lead.next_action_date && <span className="font-mono tabular-nums">{lead.next_action_date} · </span>}
                {lead.next_action}
              </div>
            </div>
          )}

          {lead.notes && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Notes</div>
              <p className="text-[12px] text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
            </div>
          )}

          {lead.status === 'lost' && lead.lost_reason && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/30 text-[11.5px] text-rose-700 dark:text-rose-300">
              <span className="font-semibold">Lost: </span>{lead.lost_reason}
            </div>
          )}

          {/* Outreach log */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Outreach ({outreach.length})
              </div>
              <motion.button
                onClick={() => setAdding(true)}
                whileTap={{ scale: 0.96, transition: SPRING_TAP }}
                className="text-[10.5px] font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 px-2 py-1 rounded-md inline-flex items-center gap-1 transition-colors"
              >
                <Icons.Plus size={10} />
                Log outreach
              </motion.button>
            </div>
            {outreachLoading ? (
              <div className="flex items-center justify-center py-6"><Icons.Loader size={14} className="animate-spin text-zinc-400" /></div>
            ) : outreach.length === 0 ? (
              <p className="text-[11px] text-zinc-400 italic">No outreach logged yet.</p>
            ) : (
              <div className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {outreach.map(o => (
                    <motion.div
                      key={o.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      transition={SPRING_ENTER}
                      className="rounded-lg border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 group"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">{o.channel}</span>
                        {o.message_type && <span className="text-[9px] text-zinc-400">{o.message_type}</span>}
                        <span className="ml-auto text-[10px] text-zinc-400 tabular-nums">{fmtRelative(o.sent_at)}</span>
                      </div>
                      {o.content && <p className="text-[11.5px] text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap leading-snug">{o.content}</p>}
                      {o.loom_url && (
                        <a href={o.loom_url} target="_blank" rel="noreferrer" className="text-[10.5px] text-violet-600 dark:text-violet-400 hover:underline mt-1 inline-flex items-center gap-1">
                          🎬 Loom
                        </a>
                      )}
                      {/* Response state + actions */}
                      <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60">
                        <button
                          onClick={() => handleToggleResponse(o)}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                            o.response_received
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {o.response_received ? '✓ Responded' : 'No response'}
                        </button>
                        {o.response_received && o.response_at && (
                          <span className="text-[9.5px] text-zinc-400 ml-1">· {fmtRelative(o.response_at)}</span>
                        )}
                        <button
                          onClick={() => handleDeleteOutreach(o.id)}
                          disabled={deletingOutreachId === o.id}
                          className="ml-auto p-1 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete"
                        >
                          <Icons.Trash size={10} />
                        </button>
                      </div>
                      {o.response_summary && (
                        <div className="mt-1.5 text-[10.5px] text-zinc-500 dark:text-zinc-400 italic">↳ {o.response_summary}</div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors"
          >{deleting ? 'Deleting…' : 'Delete lead'}</button>
          <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg inline-flex items-center gap-1.5 transition-colors">
            <Icons.Edit size={12} />
            Edit
          </button>
        </div>
      </motion.div>

      {/* Sub-modals */}
      <AnimatePresence>
        {editing && (
          <LeadFormModal
            value={lead}
            icps={icps}
            packages={packages}
            onClose={() => setEditing(false)}
            onSaved={() => { setEditing(false); onSaved(); }}
          />
        )}
        {adding && (
          <OutreachAddModal
            onClose={() => setAdding(false)}
            onSave={handleAddOutreach}
          />
        )}
      </AnimatePresence>
    </>
  );
};

const Fact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="px-2 py-1.5 rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/40 dark:border-zinc-700/40">
    <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">{label}</div>
    <div className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5 truncate">{value}</div>
  </div>
);

// ── Add outreach modal ────────────────────────────────────────────
const OutreachAddModal: React.FC<{
  onClose: () => void;
  onSave: (entry: Omit<Outreach, 'id' | 'tenant_id' | 'lead_id' | 'created_by' | 'created_at'>) => void;
}> = ({ onClose, onSave }) => {
  const [form, setForm] = useState({
    channel: 'email' as string,
    message_type: 'cold_intro' as string,
    content: '',
    loom_url: '',
    sent_at: new Date().toISOString().slice(0, 16),
    response_received: false,
    response_at: null as string | null,
    response_summary: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        channel: form.channel,
        message_type: form.message_type || null,
        content: form.content || null,
        loom_url: form.loom_url || null,
        sent_at: new Date(form.sent_at).toISOString(),
        response_received: form.response_received,
        response_at: form.response_received ? new Date().toISOString() : null,
        response_summary: form.response_summary || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-[72] bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
        transition={SPRING_ENTER}
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">Log outreach</h3>
          <button onClick={onClose} className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <Icons.X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Channel">
              <select className={inputClass} value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
                {CHANNEL_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select className={inputClass} value={form.message_type} onChange={e => setForm(f => ({ ...f, message_type: e.target.value }))}>
                {MESSAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Sent at">
            <input type="datetime-local" className={inputClass} value={form.sent_at} onChange={e => setForm(f => ({ ...f, sent_at: e.target.value }))} />
          </Field>
          <Field label="Content" hint="What was actually sent">
            <textarea rows={4} className={inputClass} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Hi Maria — saw your post about new locations. Built a quick 60s Loom showing how Sunnyside could…" />
          </Field>
          <Field label="Loom URL" hint="If you recorded a personalized walkthrough">
            <input type="url" className={inputClass} value={form.loom_url} onChange={e => setForm(f => ({ ...f, loom_url: e.target.value }))} placeholder="https://loom.com/..." />
          </Field>
          <label className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
            <input type="checkbox" checked={form.response_received} onChange={e => setForm(f => ({ ...f, response_received: e.target.checked }))} className="rounded" />
            Already received a response?
          </label>
          {form.response_received && (
            <Field label="Response summary">
              <textarea rows={2} className={inputClass} value={form.response_summary} onChange={e => setForm(f => ({ ...f, response_summary: e.target.value }))} placeholder="Said they're interested, asked for pricing details" />
            </Field>
          )}
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
            {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

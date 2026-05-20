/**
 * LeadDetailPanel — sales pipeline lead inspector.
 *
 * Structure (top → bottom) lifted from the Livv design handoff —
 * the user wanted the customization power + AI intelligence layout
 * but rendered in the warm cream/zinc palette the rest of the app uses.
 *
 *   • Header — avatar · company / contact · stage pill · contact line
 *   • 3 KPI tiles — Implementation · Retainer · 12-mo ARR
 *   • Tabs — Overview · Outreach (count) · Notes
 *   • Overview body — inline-editable detail rows:
 *       Owner · Source · ICP match · Next action · In stage
 *   • AI Advisor block — context-aware narrative + suggested actions
 *   • Footer — Convert to Project · Generate Invoice
 *
 * All extra fields (next action, implementation/retainer split, source
 * detail, ICP detail, linkedin) live inside the existing `ai_analysis`
 * JSONB column — no schema migration needed.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lead, LeadStatus, LeadTemperature, LeadCategory } from '../../types';
import { Icons } from '../ui/Icons';
import { useTeam } from '../../context/TeamContext';

interface LeadDetailPanelProps {
  lead: Lead | null;
  isOpen: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Lead>) => Promise<void> | void;
  onAddComment: (id: string, comment: string, type?: Lead['history'][number]['type']) => Promise<void> | void;
  onStatusChange: (id: string, status: LeadStatus) => Promise<void> | void;
  /** Footer action — convert this lead to a Project (creates project, optionally invoice).
   *  When undefined, the CTA is hidden so the panel stays usable from any host. */
  onConvert?: (lead: Lead) => void | Promise<void>;
  /** Footer action — start a draft Invoice for this lead.
   *  When undefined, falls back to dispatching a global 'app-navigate' to /finance?new=invoice. */
  onGenerateInvoice?: (lead: Lead) => void | Promise<void>;
  /** Footer action — Expand-to-full-page (open the lead in a dedicated view).
   *  Optional — when omitted the icon button hides. */
  onExpand?: (lead: Lead) => void;
}

// Stages — same set as before, with friendlier labels + tone tokens
// so the header pill reads at a glance.
const STAGE_META: Record<LeadStatus, { label: string; dot: string; pill: string }> = {
  new:       { label: 'New lead',       dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  contacted: { label: 'Contacted',      dot: 'bg-amber-500',   pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  following: { label: 'Call scheduled', dot: 'bg-violet-500',  pill: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  closed:    { label: 'Won',            dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  lost:      { label: 'Lost',           dot: 'bg-zinc-400',    pill: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
};

const statusOptions: LeadStatus[] = ['new', 'contacted', 'following', 'closed', 'lost'];
const temperatureOptions: LeadTemperature[] = ['cold', 'warm', 'hot'];
const categoryOptions: LeadCategory[] = ['branding', 'web-design', 'ecommerce', 'saas', 'creators', 'other'];

const tempColors: Record<string, string> = {
  hot:  'text-rose-500',
  warm: 'text-amber-500',
  cold: 'text-sky-500',
};

// Money formatter — short "K"/"M" with one decimal so the KPI tiles
// stay legible at the 20px display size used by the design.
function formatK(v: number | null | undefined): { val: string; suffix: '' | 'K' | 'M' } {
  if (!v || v <= 0) return { val: '—', suffix: '' };
  if (v >= 1_000_000) return { val: (v / 1_000_000).toFixed(1).replace(/\.0$/, ''), suffix: 'M' };
  if (v >= 1_000)     return { val: (v / 1_000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, ''), suffix: 'K' };
  return { val: String(Math.round(v)), suffix: '' };
}

// In-stage label: "2 days · entered May 17 after discovery call"
function inStageLabel(lead: Lead): string {
  if (!lead) return '';
  // Latest status_change in history (newest), else fall back to lastInteraction / createdAt.
  const history = Array.isArray(lead.history) ? lead.history : [];
  const lastStatusChange = history
    .filter(h => h.type === 'status_change')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const stageStart = lastStatusChange?.date || lead.lastInteraction || lead.createdAt;
  if (!stageStart) return '';
  const ms = Date.now() - new Date(stageStart).getTime();
  const days = Math.max(0, Math.floor(ms / 86400000));
  const dateLabel = new Date(stageStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${days} ${days === 1 ? 'day' : 'days'} · entered ${dateLabel}`;
}

export const LeadDetailPanel: React.FC<LeadDetailPanelProps> = ({
  lead,
  isOpen,
  isSaving = false,
  onClose,
  onSave,
  onAddComment,
  onStatusChange,
  onConvert,
  onGenerateInvoice,
  onExpand,
}) => {
  const { members } = useTeam();

  const [isVisible, setIsVisible] = useState(isOpen);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'outreach' | 'notes'>('overview');
  const [comment, setComment] = useState('');
  const [activityType, setActivityType] = useState<Lead['history'][number]['type']>('note');
  const [showAllHistory, setShowAllHistory] = useState(false);

  const [draft, setDraft] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    budget: '',
    message: '',
    status: 'new' as LeadStatus,
    temperature: 'warm' as LeadTemperature,
    category: 'other' as LeadCategory,
    source: '',
    origin: '',
    owner_id: '' as string,
    // ── Pipeline extras (persisted into ai_analysis JSONB) ──
    implementation_value: '' as string,
    retainer_value: '' as string,
    next_action: '' as string,
    next_action_due: '' as string,
    source_detail: '' as string,
    icp_match_detail: '' as string,
    linkedin: '' as string,
  });

  useEffect(() => {
    if (!lead) return;
    const extras = lead.aiAnalysis || ({} as any);
    setDraft({
      name: lead.name || '',
      email: lead.email || '',
      company: lead.company || '',
      phone: lead.phone || '',
      budget: lead.budget ? String(lead.budget) : '',
      message: lead.message || '',
      status: (lead.status as LeadStatus) || 'new',
      temperature: (lead.temperature || extras.temperature || 'warm') as LeadTemperature,
      category: (lead.category || extras.category || 'other') as LeadCategory,
      source: lead.source || '',
      origin: lead.origin || '',
      owner_id: lead.owner_id || '',
      implementation_value: extras.implementation_value ? String(extras.implementation_value) : '',
      retainer_value: extras.retainer_value ? String(extras.retainer_value) : '',
      next_action: extras.next_action || '',
      next_action_due: extras.next_action_due || '',
      source_detail: extras.source_detail || '',
      icp_match_detail: extras.icp_match_detail || '',
      linkedin: extras.linkedin || '',
    });
    setActiveTab('overview');
  }, [lead]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsAnimatingOut(false);
      return;
    }
    if (isVisible) {
      setIsAnimatingOut(true);
      const t = setTimeout(() => { setIsVisible(false); setIsAnimatingOut(false); }, 220);
      return () => clearTimeout(t);
    }
  }, [isOpen, isVisible]);

  const historyItems = useMemo(() => {
    const items = Array.isArray((lead as any)?.history) ? (lead as any).history : [];
    return items.slice().sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
  }, [lead]);

  const outreachItems = useMemo(
    () => historyItems.filter((h: any) => h.type === 'email'),
    [historyItems]
  );

  const visibleHistory = useMemo(() => {
    if (showAllHistory) return historyItems;
    return historyItems.slice(0, 8);
  }, [historyItems, showAllHistory]);

  // ── KPI math ──
  // implementation = explicit override OR 25% of budget by default
  // retainer       = explicit override OR (budget / 12) * 0.7 default
  // 12-mo ARR      = implementation + retainer * 12
  const implementation = useMemo(() => {
    const explicit = Number(draft.implementation_value);
    if (explicit > 0) return explicit;
    const budget = Number(draft.budget) || 0;
    return Math.round(budget * 0.25);
  }, [draft.implementation_value, draft.budget]);

  const retainer = useMemo(() => {
    const explicit = Number(draft.retainer_value);
    if (explicit > 0) return explicit;
    const budget = Number(draft.budget) || 0;
    return Math.round((budget * 0.75) / 12);
  }, [draft.retainer_value, draft.budget]);

  const arr = useMemo(() => implementation + retainer * 12, [implementation, retainer]);

  const isDirty = useMemo(() => {
    if (!lead) return false;
    const extras = lead.aiAnalysis || ({} as any);
    return (
      draft.name !== (lead.name || '') ||
      draft.email !== (lead.email || '') ||
      draft.company !== (lead.company || '') ||
      draft.phone !== (lead.phone || '') ||
      Number(draft.budget || 0) !== Number(lead.budget || 0) ||
      draft.message !== (lead.message || '') ||
      draft.status !== (lead.status as LeadStatus) ||
      draft.temperature !== (lead.temperature || extras.temperature || 'warm') ||
      draft.category !== (lead.category || extras.category || 'other') ||
      draft.source !== (lead.source || '') ||
      draft.origin !== (lead.origin || '') ||
      draft.owner_id !== (lead.owner_id || '') ||
      Number(draft.implementation_value || 0) !== Number(extras.implementation_value || 0) ||
      Number(draft.retainer_value || 0) !== Number(extras.retainer_value || 0) ||
      draft.next_action !== (extras.next_action || '') ||
      draft.next_action_due !== (extras.next_action_due || '') ||
      draft.source_detail !== (extras.source_detail || '') ||
      draft.icp_match_detail !== (extras.icp_match_detail || '') ||
      draft.linkedin !== (extras.linkedin || '')
    );
  }, [draft, lead]);

  const handleSave = async () => {
    if (!lead) return;
    const supportsPhone = Object.prototype.hasOwnProperty.call(lead, 'phone');
    const supportsBudget = Object.prototype.hasOwnProperty.call(lead, 'budget');
    // Merge pipeline extras into the ai_analysis JSONB so we don't need
    // to migrate the schema. Existing AI fields (summary/recommendation)
    // are preserved.
    const prevExtras = lead.aiAnalysis || ({} as any);
    const nextAiAnalysis: Lead['aiAnalysis'] = {
      category: draft.category,
      temperature: draft.temperature,
      summary: prevExtras.summary || '',
      recommendation: prevExtras.recommendation || '',
      implementation_value: draft.implementation_value ? Number(draft.implementation_value) : undefined,
      retainer_value: draft.retainer_value ? Number(draft.retainer_value) : undefined,
      next_action: draft.next_action || undefined,
      next_action_due: draft.next_action_due || undefined,
      source_detail: draft.source_detail || undefined,
      icp_match_detail: draft.icp_match_detail || undefined,
      linkedin: draft.linkedin || undefined,
    };
    await onSave(lead.id, {
      name: draft.name,
      email: draft.email,
      company: draft.company,
      ...(supportsPhone ? { phone: draft.phone } : {}),
      ...(supportsBudget ? { budget: draft.budget ? Number(draft.budget) : undefined } : {}),
      message: draft.message,
      status: draft.status,
      temperature: draft.temperature,
      category: draft.category,
      source: draft.source,
      origin: draft.origin,
      owner_id: draft.owner_id || null,
      aiAnalysis: nextAiAnalysis,
    } as Partial<Lead>);
  };

  if (!isVisible || !lead) return null;

  const panelTranslate = isOpen && !isAnimatingOut ? 'translate-x-0' : 'translate-x-full';
  const overlayOpacity = isOpen && !isAnimatingOut ? 'opacity-100' : 'opacity-0';

  const stageMeta = STAGE_META[draft.status];
  const ownerMember = members.find(m => m.id === draft.owner_id);
  const contactInitials = (lead.company || lead.name || 'U')
    .split(' ').map(p => p[0]).join('').slice(0, 3).toUpperCase();

  const impFmt = formatK(implementation);
  const retFmt = formatK(retainer);
  const arrFmt = formatK(arr);

  const aiRecommendation = lead.aiAnalysis?.recommendation || '';
  const aiSummary = lead.aiAnalysis?.summary || '';

  // Reusable bits ──────────────────────────────────────────────
  const inputCls   = 'px-2 py-1 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600';
  const selectCls  = inputCls + ' appearance-none cursor-pointer pr-6 bg-no-repeat bg-[length:10px_10px] bg-[position:right_8px_center]';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div
        className={`absolute inset-0 bg-black/10 dark:bg-black/40 backdrop-blur-[2px] transition-opacity duration-250 ${overlayOpacity}`}
        onClick={onClose}
      />
      <aside
        className={`relative h-full max-h-screen w-full max-w-md bg-white dark:bg-zinc-950 border-l border-zinc-200/60 dark:border-zinc-800/50 shadow-[-4px_0_24px_rgba(0,0,0,0.06)] dark:shadow-[-4px_0_24px_rgba(0,0,0,0.4)] transition-transform duration-250 ease-out ${panelTranslate} motion-reduce:transition-none overflow-hidden`}
      >
        <div className="h-full flex flex-col">

          {/* ── Header ──
             Avatar (company-initial square) · company / contact name ·
             stage pill · email · linkedin. Right-side icon buttons
             (expand to full view, edit toggle for the description
             tab, close). */}
          <div className="px-5 pt-4 pb-3.5 border-b border-zinc-100 dark:border-zinc-800/50 shrink-0">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 shrink-0 tracking-wider">
                {contactInitials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[15.5px] font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-tight tracking-[-0.012em]">
                    {lead.company || lead.name || 'Unknown'}
                  </h3>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.14em] ${stageMeta.pill}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${stageMeta.dot}`} />
                    {stageMeta.label}
                  </span>
                </div>
                <div className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5 flex-wrap leading-tight">
                  {lead.company && lead.name && (
                    <>
                      <span className="text-zinc-700 dark:text-zinc-200 font-medium">{lead.name}</span>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    </>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="hover:text-zinc-700 dark:hover:text-zinc-200 hover:underline truncate">
                      {lead.email}
                    </a>
                  )}
                  {draft.linkedin && (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <a href={draft.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-700 dark:hover:text-zinc-200 hover:underline truncate">
                        {draft.linkedin.replace(/^https?:\/\//, '').replace(/^www\./, '')}
                      </a>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-zinc-300 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Close"
                >
                  <Icons.X size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* ── 3 KPI tiles ──
             Editable in place: click any value to fill the inline input.
             Defaults split the existing `budget` field 25% implementation
             / 75% retainer (÷12 = monthly). 12-mo ARR = imp + ret*12. */}
          <div className="grid grid-cols-3 border-b border-zinc-100 dark:border-zinc-800/50 shrink-0">
            <KpiTile
              label="Implementation"
              suffix="one-time"
              value={impFmt.val}
              valSuffix={impFmt.suffix}
              editable={{
                input: draft.implementation_value,
                onChange: v => setDraft(d => ({ ...d, implementation_value: v })),
              }}
            />
            <KpiTile
              label="Retainer"
              suffix="/ mo"
              value={retFmt.val}
              valSuffix={retFmt.suffix}
              borderL
              editable={{
                input: draft.retainer_value,
                onChange: v => setDraft(d => ({ ...d, retainer_value: v })),
              }}
            />
            <KpiTile
              label="12-mo ARR"
              suffix=""
              value={arrFmt.val}
              valSuffix={arrFmt.suffix}
              borderL
              dim
            />
          </div>

          {/* ── Tabs ── */}
          <div className="px-5 border-b border-zinc-100 dark:border-zinc-800/50 shrink-0">
            <div className="flex items-center gap-4 -mb-px">
              {([
                { id: 'overview', label: 'Overview' },
                { id: 'outreach', label: 'Outreach', count: outreachItems.length },
                { id: 'notes',    label: 'Notes',    count: historyItems.length },
              ] as const).map(t => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id as any)}
                    className={`relative inline-flex items-center gap-1.5 py-2.5 px-1 text-[12.5px] font-medium transition-colors ${
                      active
                        ? 'text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    {t.label}
                    {'count' in t && t.count > 0 && (
                      <span className={`text-[10px] font-mono tabular-nums px-1.5 rounded ${
                        active
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                      }`}>
                        {t.count}
                      </span>
                    )}
                    {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-zinc-900 dark:bg-zinc-100 rounded-full" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">

            {/* Overview tab */}
            {activeTab === 'overview' && (
              <div className="px-5 py-4 space-y-1">
                {/* Owner */}
                <DetailRow icon={<Icons.User size={12} />} label="Owner">
                  <div className="inline-flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <select
                      value={draft.owner_id}
                      onChange={(e) => setDraft(d => ({ ...d, owner_id: e.target.value }))}
                      className={selectCls}
                    >
                      <option value="">Unassigned</option>
                      {members.map(m => (
                        <option key={m.id} value={m.id}>{m.name || m.email}</option>
                      ))}
                    </select>
                  </div>
                </DetailRow>

                {/* Source */}
                <DetailRow icon={<Icons.Mail size={12} />} label="Source">
                  <div className="inline-flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {draft.source || 'Direct'}
                    </span>
                    <input
                      value={draft.source_detail}
                      onChange={e => setDraft(d => ({ ...d, source_detail: e.target.value }))}
                      placeholder="via personal intro · Iris @ Sable Loft"
                      className={`${inputCls} flex-1 min-w-[160px] border-0 hover:border hover:border-zinc-200 dark:hover:border-zinc-700/60 focus:border focus:border-zinc-400 dark:focus:border-zinc-500`}
                    />
                  </div>
                </DetailRow>

                {/* ICP match */}
                <DetailRow icon={<Icons.Target size={12} />} label="ICP match">
                  <div className="inline-flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                      <select
                        value={draft.category}
                        onChange={(e) => setDraft(d => ({ ...d, category: e.target.value as LeadCategory }))}
                        className="bg-transparent border-0 outline-none cursor-pointer pr-2"
                      >
                        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </span>
                    <input
                      value={draft.icp_match_detail}
                      onChange={e => setDraft(d => ({ ...d, icp_match_detail: e.target.value }))}
                      placeholder="+ Content Engine retainer"
                      className={`${inputCls} flex-1 min-w-[160px] border-0 hover:border hover:border-zinc-200 dark:hover:border-zinc-700/60 focus:border focus:border-zinc-400 dark:focus:border-zinc-500`}
                    />
                  </div>
                </DetailRow>

                {/* Next action */}
                <DetailRow icon={<Icons.ChevronRight size={12} />} label="Next action">
                  <div className="inline-flex items-center gap-2 flex-wrap w-full">
                    <input
                      value={draft.next_action}
                      onChange={e => setDraft(d => ({ ...d, next_action: e.target.value }))}
                      placeholder="Build proposal v2"
                      className={`${inputCls} flex-1 min-w-[160px]`}
                    />
                    <input
                      type="date"
                      value={draft.next_action_due}
                      onChange={e => setDraft(d => ({ ...d, next_action_due: e.target.value }))}
                      className={`${inputCls} font-mono text-[11.5px]`}
                    />
                  </div>
                </DetailRow>

                {/* In stage (read-only) */}
                <DetailRow icon={<Icons.Clock size={12} />} label="In stage">
                  <span className="text-[12.5px] text-zinc-600 dark:text-zinc-300">
                    {inStageLabel(lead)}
                  </span>
                </DetailRow>

                {/* Temperature row — small inline pill switcher */}
                <DetailRow icon={<Icons.Activity size={12} />} label="Temperature">
                  <div className="inline-flex items-center gap-1">
                    {temperatureOptions.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDraft(d => ({ ...d, temperature: t }))}
                        className={`px-2 py-0.5 rounded text-[10.5px] font-semibold uppercase tracking-wider transition-colors ${
                          draft.temperature === t
                            ? `bg-zinc-100 dark:bg-zinc-800 ${tempColors[t]}`
                            : 'text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </DetailRow>

                {/* AI Advisor block — context narrative + action chips.
                   Reads from the existing aiAnalysis.recommendation +
                   summary. The two action buttons fire a comment to the
                   lead's activity so they're traceable. */}
                <div className="mt-4 rounded-xl border border-amber-200/70 dark:border-amber-500/30 bg-gradient-to-br from-amber-50/70 via-white to-rose-50/40 dark:from-amber-950/20 dark:via-zinc-900 dark:to-rose-950/15 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                      <Icons.Sparkles size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-amber-600 dark:text-amber-400 mb-1.5">
                        AI Advisor
                      </div>
                      {aiRecommendation || aiSummary ? (
                        <>
                          <p className="text-[12.5px] text-zinc-700 dark:text-zinc-200 leading-relaxed">
                            {aiRecommendation || aiSummary}
                          </p>
                          {aiRecommendation && aiSummary && aiRecommendation !== aiSummary && (
                            <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed mt-1.5">
                              {aiSummary}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[12.5px] text-zinc-600 dark:text-zinc-300 leading-relaxed italic">
                          No analysis yet for this lead. Use the suggestions below to start a thread.
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => onAddComment(lead.id, draft.next_action ? `Draft: ${draft.next_action}` : 'Draft next email', 'note')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 text-[11px] font-semibold hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors"
                        >
                          <Icons.Sparkles size={10} />
                          {draft.next_action ? `Draft: ${draft.next_action.slice(0, 24)}${draft.next_action.length > 24 ? '…' : ''}` : 'Draft next email'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onAddComment(lead.id, 'Show similar deals', 'note')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/80 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-200 text-[11px] font-semibold border border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                        >
                          Show similar deals
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick edit grid — name / email / phone / linkedin /
                   company / budget. Collapsed by default look — same
                   inputs, just compact. Lets the user fix contact
                   details without leaving the overview tab. */}
                <details className="mt-4 group rounded-xl border border-zinc-200/70 dark:border-zinc-800/50">
                  <summary className="cursor-pointer list-none px-3 py-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                    <Icons.Settings size={11} />
                    Contact details
                    <Icons.ChevronDown size={11} className="ml-auto transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="grid grid-cols-2 gap-2.5 px-3 pb-3 pt-1">
                    <FieldMini label="Contact name">
                      <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} className={inputCls + ' w-full'} />
                    </FieldMini>
                    <FieldMini label="Company">
                      <input value={draft.company} onChange={e => setDraft(d => ({ ...d, company: e.target.value }))} className={inputCls + ' w-full'} placeholder="—" />
                    </FieldMini>
                    <FieldMini label="Email">
                      <input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} className={inputCls + ' w-full'} type="email" />
                    </FieldMini>
                    <FieldMini label="Phone">
                      <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} className={inputCls + ' w-full'} placeholder="+1 555 000 000" />
                    </FieldMini>
                    <FieldMini label="Budget">
                      <input value={draft.budget} onChange={e => setDraft(d => ({ ...d, budget: e.target.value }))} className={inputCls + ' w-full'} placeholder="$0" inputMode="numeric" />
                    </FieldMini>
                    <FieldMini label="LinkedIn">
                      <input value={draft.linkedin} onChange={e => setDraft(d => ({ ...d, linkedin: e.target.value }))} className={inputCls + ' w-full'} placeholder="linkedin.com/in/…" />
                    </FieldMini>
                    <FieldMini label="Status">
                      <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as LeadStatus })} className={selectCls + ' w-full'}>
                        {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </FieldMini>
                    <FieldMini label="Landing">
                      <input value={draft.source} onChange={e => setDraft(d => ({ ...d, source: e.target.value }))} className={inputCls + ' w-full'} placeholder="agencies-lp" />
                    </FieldMini>
                  </div>
                </details>

                {/* ── Footer action row (so-action-row from bundle) ──
                   Primary CTA = Convert to Project (creates project + closes
                   the lead). Secondary = Generate Invoice (opens Finance with
                   a draft for this lead's value). When neither callback is
                   wired, both buttons hide so the panel stays usable when
                   hosted outside Sales. */}
                {(onConvert || onGenerateInvoice) && lead && (
                  <div className="mt-5 grid grid-cols-2 gap-2.5 pt-4 border-t border-zinc-100 dark:border-zinc-800/60">
                    {onConvert && (
                      <button
                        type="button"
                        onClick={() => onConvert(lead)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12.5px] font-semibold shadow-sm hover:opacity-90 transition-all hover:translate-y-[-1px]"
                      >
                        <Icons.CheckCircle size={13} />
                        Convert to Project
                      </button>
                    )}
                    {onGenerateInvoice ? (
                      <button
                        type="button"
                        onClick={() => onGenerateInvoice(lead)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-[12.5px] font-semibold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <Icons.DollarSign size={13} />
                        Generate Invoice
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          // Fallback — fire a global nav event so any host
                          // can pick up the request even without an explicit
                          // callback. Finance page listens to ?new=invoice.
                          window.dispatchEvent(new CustomEvent('app-navigate', {
                            detail: { page: 'finance', params: { leadId: lead.id, intent: 'new_invoice' } },
                          }));
                        }}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 text-[12.5px] font-semibold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <Icons.DollarSign size={13} />
                        Generate Invoice
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Outreach tab — just the email-typed history items, plus a
               quick "Log an outreach" form at the top. */}
            {activeTab === 'outreach' && (
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <input
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && comment.trim()) {
                        onAddComment(lead.id, comment.trim(), 'email');
                        setComment('');
                      }
                    }}
                    placeholder="Log an outreach (subject, channel, gist)…"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!comment.trim()) return;
                      onAddComment(lead.id, comment.trim(), 'email');
                      setComment('');
                    }}
                    disabled={!comment.trim()}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-30 hover:opacity-80 transition-opacity"
                  >
                    Log
                  </button>
                </div>
                {outreachItems.length === 0 ? (
                  <div className="text-[11.5px] text-zinc-400 py-6 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                    No outreach logged yet
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {outreachItems.map((item: any) => (
                      <div key={item.id} className="flex gap-2.5 py-2 px-3 rounded-lg bg-zinc-50/60 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800/40">
                        <Icons.Mail size={11} className="text-zinc-400 mt-1 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[10px] text-zinc-400 shrink-0 font-mono">
                              {item.date ? new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Now'}
                            </span>
                          </div>
                          <p className="text-[12px] text-zinc-700 dark:text-zinc-200 leading-relaxed mt-0.5">{item.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notes tab — combined free-text notes + full activity log */}
            {activeTab === 'notes' && (
              <div className="px-5 py-4 space-y-3">
                <textarea
                  value={draft.message}
                  onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                  className={`${inputCls} w-full min-h-[140px] max-h-[320px] resize-y leading-relaxed`}
                  placeholder="Long-form notes about this lead…"
                />

                {/* Activity feed */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-400">Activity</h4>
                    {historyItems.length > 8 && (
                      <button onClick={() => setShowAllHistory(p => !p)} className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors">
                        {showAllHistory ? 'Recent' : `All (${historyItems.length})`}
                      </button>
                    )}
                  </div>

                  <div className="flex gap-1.5 mb-2.5">
                    <select
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value as Lead['history'][number]['type'])}
                      className={selectCls + ' w-[80px]'}
                    >
                      <option value="note">Note</option>
                      <option value="email">Email</option>
                      <option value="status_change">Status</option>
                      <option value="system">System</option>
                    </select>
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && comment.trim()) {
                          onAddComment(lead.id, comment.trim(), activityType);
                          setComment('');
                          setActivityType('note');
                        }
                      }}
                      className={inputCls + ' flex-1'}
                      placeholder="Add a note…"
                    />
                    <button
                      onClick={() => {
                        const trimmed = comment.trim();
                        if (!trimmed) return;
                        onAddComment(lead.id, trimmed, activityType);
                        setComment('');
                        setActivityType('note');
                      }}
                      disabled={!comment.trim()}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-30 hover:opacity-80 transition-opacity shrink-0"
                    >
                      Add
                    </button>
                  </div>

                  <div className="space-y-1">
                    {historyItems.length === 0 && (
                      <p className="text-[11px] text-zinc-400 py-3 text-center">No activity yet</p>
                    )}
                    {visibleHistory.map((item: any) => (
                      <div key={item.id} className="flex gap-2 py-1.5">
                        <div className="mt-1.5 w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[10px] text-zinc-400 shrink-0 font-mono">
                              {item.date ? new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Now'}
                            </span>
                            <span className="text-[9px] uppercase tracking-wider text-zinc-300 dark:text-zinc-600 font-medium">{item.type || 'note'}</span>
                          </div>
                          <p className="text-[12px] text-zinc-600 dark:text-zinc-300 leading-relaxed">{item.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer — CTAs ──
             Convert to Project = dark primary button (workflow advance).
             Generate Invoice   = neutral border button (creates a draft).
             Save changes is a small secondary button on the left so the
             primary actions get the spotlight. */}
          <div className="border-t border-zinc-100 dark:border-zinc-800/50 px-5 py-3 shrink-0 bg-white dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors shrink-0"
                title={isDirty ? 'Save unsaved changes' : 'Nothing to save'}
              >
                {isSaving ? 'Saving…' : isDirty ? 'Save changes' : 'Saved'}
              </button>
              <div className="flex-1" />
              <button
                onClick={() => onAddComment(lead.id, 'Generate invoice triggered', 'system')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <Icons.File size={12} />
                Generate Invoice
              </button>
              <button
                onClick={() => onStatusChange(lead.id, 'closed')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity"
              >
                <Icons.Briefcase size={12} />
                Convert to Project
              </button>
            </div>
            {ownerMember && (
              <div className="mt-2 text-[10px] text-zinc-400 font-mono tracking-wider">
                Owner: {ownerMember.name || ownerMember.email}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
};

// ── KPI tile ─────────────────────────────────────────────────────────
const KpiTile: React.FC<{
  label: string;
  suffix: string;
  value: string;
  valSuffix: '' | 'K' | 'M';
  borderL?: boolean;
  dim?: boolean;
  editable?: { input: string; onChange: (v: string) => void };
}> = ({ label, suffix, value, valSuffix, borderL, dim, editable }) => {
  const [editing, setEditing] = useState(false);
  return (
    <div
      className={`px-4 py-3 ${borderL ? 'border-l border-zinc-100 dark:border-zinc-800/50' : ''} ${dim ? 'bg-zinc-50/40 dark:bg-zinc-900/20' : ''}`}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500 truncate">{label}</div>
      {editable && editing ? (
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-zinc-400 text-[13px]">$</span>
          <input
            autoFocus
            type="number"
            value={editable.input}
            onChange={e => editable.onChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
            placeholder="0"
            className="w-full bg-transparent border-b border-zinc-300 dark:border-zinc-600 outline-none text-[18px] font-light text-zinc-900 dark:text-zinc-100 tracking-[-0.03em] tabular-nums"
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={!editable}
          onClick={() => editable && setEditing(true)}
          className={`mt-1 flex items-baseline gap-1 leading-none text-left ${editable ? 'hover:opacity-80 cursor-text' : 'cursor-default'}`}
          title={editable ? 'Click to edit' : undefined}
        >
          <span className="text-zinc-400 text-[13px]">$</span>
          <span className="text-[20px] font-light text-zinc-900 dark:text-zinc-100 tracking-[-0.03em] tabular-nums">
            {value}
          </span>
          {valSuffix && (
            <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">{valSuffix}</span>
          )}
          {suffix && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 ml-1">{suffix}</span>
          )}
        </button>
      )}
    </div>
  );
};

// ── Detail row (label on left, editable value on right) ──────────────
const DetailRow: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-center gap-3 py-1.5 group min-h-[32px]">
    <div className="inline-flex items-center gap-1.5 w-[110px] shrink-0 text-zinc-400">
      {icon}
      <span className="text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
    </div>
    <div className="flex-1 min-w-0">
      {children}
    </div>
  </div>
);

// ── Small field for the collapsed details panel ──────────────────────
const FieldMini: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-zinc-400 mb-1 block">{label}</label>
    {children}
  </div>
);

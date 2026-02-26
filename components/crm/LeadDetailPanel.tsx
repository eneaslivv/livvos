import React, { useEffect, useMemo, useState } from 'react';
import { Lead } from '../../types';
import { Icons } from '../ui/Icons';

type LeadStatus = 'new' | 'contacted' | 'following' | 'closed' | 'lost';
type LeadTemperature = 'cold' | 'warm' | 'hot';
type LeadCategory = 'branding' | 'web-design' | 'ecommerce' | 'saas' | 'creators' | 'other';

interface LeadDetailPanelProps {
  lead: Lead | null;
  isOpen: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Lead>) => Promise<void> | void;
  onAddComment: (id: string, comment: string, type?: Lead['history'][number]['type']) => Promise<void> | void;
  onStatusChange: (id: string, status: LeadStatus) => Promise<void> | void;
}

const statusOptions: LeadStatus[] = ['new', 'contacted', 'following', 'closed', 'lost'];
const temperatureOptions: LeadTemperature[] = ['cold', 'warm', 'hot'];
const categoryOptions: LeadCategory[] = ['branding', 'web-design', 'ecommerce', 'saas', 'creators', 'other'];

const statusColors: Record<string, string> = {
  new: 'bg-blue-500',
  contacted: 'bg-amber-500',
  following: 'bg-purple-500',
  closed: 'bg-emerald-500',
  lost: 'bg-zinc-400',
};

const tempColors: Record<string, string> = {
  hot: 'text-rose-500',
  warm: 'text-amber-500',
  cold: 'text-sky-500',
};

export const LeadDetailPanel: React.FC<LeadDetailPanelProps> = ({
  lead,
  isOpen,
  isSaving = false,
  onClose,
  onSave,
  onAddComment,
  onStatusChange,
}) => {
  const [isVisible, setIsVisible] = useState(isOpen);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [comment, setComment] = useState('');
  const [activityType, setActivityType] = useState<Lead['history'][number]['type']>('note');
  const [showExtended, setShowExtended] = useState(false);
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
  });

  useEffect(() => {
    if (!lead) return;
    setDraft({
      name: lead.name || '',
      email: lead.email || '',
      company: lead.company || '',
      phone: lead.phone || '',
      budget: lead.budget ? String(lead.budget) : '',
      message: lead.message || '',
      status: (lead.status as LeadStatus) || 'new',
      temperature: (lead.temperature || lead.aiAnalysis?.temperature || 'warm') as LeadTemperature,
      category: (lead.category || lead.aiAnalysis?.category || 'other') as LeadCategory,
      source: lead.source || '',
      origin: lead.origin || '',
    });
  }, [lead]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsAnimatingOut(false);
      return;
    }
    if (isVisible) {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => { setIsVisible(false); setIsAnimatingOut(false); }, 220);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isVisible]);

  useEffect(() => {
    if (!isOpen || !lead) { setShowExtended(false); return; }
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = (window as any).requestIdleCallback(() => setShowExtended(true), { timeout: 300 });
      return () => (window as any).cancelIdleCallback?.(handle);
    }
    const timeoutId = setTimeout(() => setShowExtended(true), 80);
    return () => clearTimeout(timeoutId);
  }, [isOpen, lead?.id]);

  const historyItems = useMemo(() => {
    const items = Array.isArray((lead as any)?.history) ? (lead as any).history : [];
    return items.slice().sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
  }, [lead]);

  const visibleHistory = useMemo(() => {
    if (!showExtended) return [];
    if (showAllHistory) return historyItems;
    return historyItems.slice(0, 5);
  }, [historyItems, showAllHistory, showExtended]);

  const isDirty = useMemo(() => {
    if (!lead) return false;
    return (
      draft.name !== (lead.name || '') ||
      draft.email !== (lead.email || '') ||
      draft.company !== (lead.company || '') ||
      draft.phone !== (lead.phone || '') ||
      Number(draft.budget || 0) !== Number(lead.budget || 0) ||
      draft.message !== (lead.message || '') ||
      draft.status !== (lead.status as LeadStatus) ||
      draft.temperature !== (lead.temperature || lead.aiAnalysis?.temperature || 'warm') ||
      draft.category !== (lead.category || lead.aiAnalysis?.category || 'other') ||
      draft.source !== (lead.source || '') ||
      draft.origin !== (lead.origin || '')
    );
  }, [draft, lead]);

  if (!isVisible || !lead) return null;

  const panelTranslate = isOpen && !isAnimatingOut ? 'translate-x-0' : 'translate-x-full';
  const overlayOpacity = isOpen && !isAnimatingOut ? 'opacity-100' : 'opacity-0';

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1 block">{label}</label>
      {children}
    </div>
  );

  const inputClass = 'w-full px-2.5 py-1.5 text-[13px] bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-150 dark:border-zinc-800/60 rounded-lg outline-none focus:border-zinc-300 dark:focus:border-zinc-600 transition-colors text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-300 dark:placeholder:text-zinc-600';
  const selectClass = 'w-full px-2 py-1.5 text-[13px] bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-150 dark:border-zinc-800/60 rounded-lg outline-none focus:border-zinc-300 dark:focus:border-zinc-600 transition-colors text-zinc-800 dark:text-zinc-200 appearance-none cursor-pointer';

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div
        className={`absolute inset-0 bg-black/10 dark:bg-black/30 backdrop-blur-[2px] transition-opacity duration-250 ${overlayOpacity}`}
        onClick={onClose}
      />
      <aside
        className={`relative h-full w-full max-w-md bg-white dark:bg-zinc-950 border-l border-zinc-200/60 dark:border-zinc-800/50 shadow-[-4px_0_24px_rgba(0,0,0,0.06)] dark:shadow-[-4px_0_24px_rgba(0,0,0,0.3)] transition-transform duration-250 ease-out ${panelTranslate} motion-reduce:transition-none`}
      >
        <div className="h-full flex flex-col">

          {/* Header — compact */}
          <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800/40 shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-[10px] font-semibold shrink-0">
                {(lead.name || 'U').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-tight">{lead.name || 'Unknown'}</h3>
                <p className="text-[11px] text-zinc-400 truncate leading-tight">{lead.company || lead.email || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${statusColors[draft.status] || 'bg-zinc-400'}`} title={draft.status} />
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
              >
                <Icons.X size={14} />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5 py-4 space-y-4">

              {/* Status + Temperature row */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Field label="Status">
                    <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as LeadStatus })} className={selectClass}>
                      {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="Temperature">
                    <select value={draft.temperature} onChange={(e) => setDraft({ ...draft, temperature: e.target.value as LeadTemperature })} className={`${selectClass} ${tempColors[draft.temperature] || ''}`}>
                      {temperatureOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="Category">
                    <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as LeadCategory })} className={selectClass}>
                      {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              {/* Contact info */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Company">
                  <input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} className={inputClass} placeholder="—" />
                </Field>
                <Field label="Email">
                  <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputClass} type="email" />
                </Field>
                <Field label="Phone">
                  <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className={inputClass} placeholder="+1 555 000 000" />
                </Field>
                <Field label="Budget">
                  <input value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} className={inputClass} placeholder="$0" inputMode="numeric" />
                </Field>
                <Field label="Source">
                  <input value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className={inputClass} placeholder="Instagram, web" />
                </Field>
              </div>

              {/* Quick actions — inline, subtle */}
              {(lead.email || lead.phone) && (
                <div className="flex gap-2">
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200/80 dark:border-zinc-800/50 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <Icons.Mail size={11} /> Email
                    </a>
                  )}
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200/80 dark:border-zinc-800/50 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <Icons.Phone size={11} /> Call
                    </a>
                  )}
                </div>
              )}

              {/* Message */}
              <Field label="Notes">
                <textarea
                  value={draft.message}
                  onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                  className={`${inputClass} min-h-[64px] max-h-[120px] resize-none`}
                  placeholder="Add notes about this lead..."
                />
              </Field>

              {/* AI Insight — only if data exists */}
              {showExtended && (lead.aiAnalysis?.summary || lead.aiAnalysis?.recommendation) && (
                <div className="rounded-lg px-3 py-2.5 bg-zinc-50/80 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800/40">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1">
                    <Icons.Zap size={9} /> AI Insight
                  </div>
                  {lead.aiAnalysis?.summary && <p className="text-[12px] text-zinc-600 dark:text-zinc-300 leading-relaxed">{lead.aiAnalysis.summary}</p>}
                  {lead.aiAnalysis?.recommendation && <p className="text-[12px] text-zinc-400 mt-1 leading-relaxed">{lead.aiAnalysis.recommendation}</p>}
                </div>
              )}

              {/* UTM — compact */}
              {showExtended && (lead.utm?.source || lead.utm?.campaign || lead.utm?.medium) && (
                <div className="flex gap-3 text-[11px]">
                  {lead.utm?.source && <div><span className="text-zinc-400">utm_source:</span> <span className="text-zinc-600 dark:text-zinc-300">{lead.utm.source}</span></div>}
                  {lead.utm?.medium && <div><span className="text-zinc-400">utm_medium:</span> <span className="text-zinc-600 dark:text-zinc-300">{lead.utm.medium}</span></div>}
                  {lead.utm?.campaign && <div><span className="text-zinc-400">utm_campaign:</span> <span className="text-zinc-600 dark:text-zinc-300">{lead.utm.campaign}</span></div>}
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-zinc-100 dark:border-zinc-800/40" />

              {/* Activity */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Activity</h4>
                  {showExtended && historyItems.length > 5 && (
                    <button onClick={() => setShowAllHistory(p => !p)} className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors">
                      {showAllHistory ? 'Recent' : `All (${historyItems.length})`}
                    </button>
                  )}
                </div>

                {/* Add note — inline, at the top */}
                <div className="flex gap-1.5 mb-3">
                  <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value as Lead['history'][number]['type'])}
                    className="px-1.5 py-1 text-[10px] bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-150 dark:border-zinc-800/50 rounded-md outline-none text-zinc-500 shrink-0"
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
                    className="flex-1 px-2.5 py-1 text-[12px] bg-zinc-50/80 dark:bg-zinc-900/40 border border-zinc-150 dark:border-zinc-800/50 rounded-md outline-none focus:border-zinc-300 dark:focus:border-zinc-600 transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                    placeholder="Add a note..."
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
                    className="px-2.5 py-1 text-[10px] font-semibold rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-30 hover:opacity-80 transition-opacity shrink-0"
                  >
                    Add
                  </button>
                </div>

                {/* History list */}
                <div className="space-y-1">
                  {!showExtended && <div className="text-[11px] text-zinc-300 dark:text-zinc-600 py-2">Loading...</div>}
                  {showExtended && historyItems.length === 0 && (
                    <p className="text-[11px] text-zinc-400 py-3 text-center">No activity yet</p>
                  )}
                  {showExtended && visibleHistory.map((item: any) => (
                    <div key={item.id} className="flex gap-2 py-1.5 group">
                      <div className="mt-1.5 w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[10px] text-zinc-400 shrink-0">{item.date ? new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Now'}</span>
                          <span className="text-[9px] uppercase tracking-wider text-zinc-300 dark:text-zinc-600 font-medium">{item.type || 'note'}</span>
                        </div>
                        <p className="text-[12px] text-zinc-600 dark:text-zinc-300 leading-relaxed">{item.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Footer — always visible */}
          <div className="border-t border-zinc-100 dark:border-zinc-800/40 px-5 py-2.5 flex items-center justify-between shrink-0 bg-white dark:bg-zinc-950">
            <span className="text-[10px] text-zinc-300 dark:text-zinc-600">
              {lead.createdAt || lead.created_at ? new Date(lead.createdAt || (lead as any).created_at).toLocaleDateString() : ''}
            </span>
            <div className="flex items-center gap-1.5">
              {draft.status === 'new' && (
                <button
                  onClick={() => {
                    setDraft(d => ({ ...d, status: 'contacted' }));
                    onStatusChange(lead.id, 'contacted');
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Mark Contacted
                </button>
              )}
              <button
                onClick={async () => {
                  if (!lead) return;
                  const supportsPhone = Object.prototype.hasOwnProperty.call(lead, 'phone');
                  const supportsBudget = Object.prototype.hasOwnProperty.call(lead, 'budget');
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
                  } as Partial<Lead>);
                }}
                disabled={!isDirty || isSaving}
                className="px-3 py-1 text-[11px] font-semibold rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-30 hover:opacity-80 transition-opacity"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

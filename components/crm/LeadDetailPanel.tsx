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
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsAnimatingOut(false);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isVisible]);

  useEffect(() => {
    if (!isOpen || !lead) {
      setShowExtended(false);
      return;
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = (window as any).requestIdleCallback(() => setShowExtended(true), { timeout: 300 });
      return () => (window as any).cancelIdleCallback?.(handle);
    }

    const timeoutId = setTimeout(() => setShowExtended(true), 80);
    return () => clearTimeout(timeoutId);
  }, [isOpen, lead?.id]);

  const historyItems = useMemo(() => {
    const items = Array.isArray((lead as any)?.history) ? (lead as any).history : [];
    return items.slice().sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
  }, [lead]);

  const visibleHistory = useMemo(() => {
    if (!showExtended) return [];
    if (showAllHistory) return historyItems;
    return historyItems.slice(-5);
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

  if (!isVisible || !lead) {
    return null;
  }

  const panelTranslate = isOpen && !isAnimatingOut ? 'translate-x-0' : 'translate-x-full';
  const overlayOpacity = isOpen && !isAnimatingOut ? 'opacity-100' : 'opacity-0';

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div
        className={`absolute inset-0 bg-zinc-950/20 backdrop-blur-[1px] transition-opacity duration-200 ${overlayOpacity}`}
        onClick={onClose}
      />
      <aside
        className={`relative h-full w-full max-w-xl bg-white dark:bg-zinc-950 shadow-[0_20px_60px_rgba(15,23,42,0.18)] transition-transform duration-200 ease-out ${panelTranslate} motion-reduce:transition-none`}
      >
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 flex items-center justify-center text-sm font-semibold border border-zinc-200 dark:border-zinc-800">
                  {(lead.name || 'Unknown').split(' ').map(part => part[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{lead.name || 'Unknown'}</h3>
                  <p className="text-sm text-zinc-500">{lead.email || 'No email provided'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-zinc-100/70 dark:bg-zinc-900/60 text-zinc-500">
                  {lead.origin || 'Manual'}
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-zinc-100/70 dark:bg-zinc-900/60 text-zinc-500">
                  {lead.category || lead.aiAnalysis?.category || 'other'}
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-zinc-100/70 dark:bg-zinc-900/60 text-zinc-500">
                  {lead.temperature || lead.aiAnalysis?.temperature || 'warm'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={lead.email ? `mailto:${lead.email}` : undefined}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full bg-zinc-900 text-white hover:opacity-90 ${lead.email ? '' : 'opacity-40 pointer-events-none'}`}
                >
                  Email
                </a>
                <a
                  href={lead.phone ? `tel:${lead.phone}` : undefined}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full bg-zinc-100 text-zinc-700 hover:bg-zinc-200 ${lead.phone ? '' : 'opacity-40 pointer-events-none'}`}
                >
                  Call
                </a>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <Icons.X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-400">Status</label>
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as LeadStatus })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-400">Company</label>
                <input
                  value={draft.company}
                  onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                  placeholder="Company name"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-400">Temperature</label>
                <select
                  value={draft.temperature}
                  onChange={(e) => setDraft({ ...draft, temperature: e.target.value as LeadTemperature })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                >
                  {temperatureOptions.map((temp) => (
                    <option key={temp} value={temp}>{temp}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-400">Category</label>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value as LeadCategory })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-400">Name</label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-400">Phone</label>
                <input
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                  placeholder="+1 555 000 000"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-400">Email</label>
                <input
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-400">Budget</label>
                <input
                  value={draft.budget}
                  onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                  placeholder="5000"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-400">Source</label>
                <input
                  value={draft.source}
                  onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                  placeholder="Instagram, web form"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-zinc-400">Origin</label>
                <input
                  value={draft.origin}
                  onChange={(e) => setDraft({ ...draft, origin: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                  placeholder="Manual"
                />
              </div>
            </div>

            {showExtended && (lead.utm?.source || lead.utm?.campaign || lead.utm?.medium) && (
              <div className="rounded-xl p-4 bg-zinc-50/80 dark:bg-zinc-900/60">
                <div className="text-xs uppercase tracking-wide text-zinc-400 mb-3">UTM</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-400">Source</div>
                    <div>{lead.utm?.source || '-'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-400">Medium</div>
                    <div>{lead.utm?.medium || '-'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-400">Campaign</div>
                    <div>{lead.utm?.campaign || '-'}</div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-400">Message</label>
              <textarea
                value={draft.message}
                onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                className="mt-1 w-full min-h-[120px] px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
              />
            </div>

            {showExtended && (lead.aiAnalysis?.summary || lead.aiAnalysis?.recommendation) && (
              <div className="rounded-xl p-4 bg-zinc-50/80 dark:bg-zinc-900/60">
                <div className="text-xs uppercase tracking-wide text-zinc-400 mb-2">AI Insight</div>
                {lead.aiAnalysis?.summary && (
                  <div className="text-sm text-zinc-600 dark:text-zinc-300">
                    <span className="text-zinc-400 uppercase text-[10px] tracking-wide">Summary</span>
                    <div className="mt-1">{lead.aiAnalysis.summary}</div>
                  </div>
                )}
                {lead.aiAnalysis?.recommendation && (
                  <div className="text-sm text-zinc-600 dark:text-zinc-300 mt-3">
                    <span className="text-zinc-400 uppercase text-[10px] tracking-wide">Recommendation</span>
                    <div className="mt-1">{lead.aiAnalysis.recommendation}</div>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Comments</h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">{historyItems.length} items</span>
                  {showExtended && historyItems.length > 5 && (
                    <button
                      onClick={() => setShowAllHistory((prev) => !prev)}
                      className="text-[11px] text-zinc-500 hover:text-zinc-700"
                    >
                      {showAllHistory ? 'Show recent' : 'Show all'}
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {!showExtended && (
                  <div className="text-xs text-zinc-400">Loading recent activity...</div>
                )}
                {showExtended && historyItems.length === 0 && (
                  <div className="text-sm text-zinc-400 rounded-lg p-3 bg-zinc-50/80 dark:bg-zinc-900/60">
                    No comments yet. Add the first note below.
                  </div>
                )}
                {showExtended && visibleHistory.map((item: any) => (
                  <div key={item.id} className="rounded-lg p-3 bg-zinc-50/70 dark:bg-zinc-900/50">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-zinc-400">{item.date ? new Date(item.date).toLocaleString() : 'Just now'}</div>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-400">{item.type || 'note'}</span>
                    </div>
                    <div className="text-sm text-zinc-700 dark:text-zinc-200 mt-1">{item.content}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-2 items-start">
                <select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as Lead['history'][number]['type'])}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                >
                  <option value="note">Note</option>
                  <option value="email">Email</option>
                  <option value="status_change">Status</option>
                  <option value="system">System</option>
                </select>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="min-h-[70px] px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-900/60 text-sm border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700"
                  placeholder="Leave a note, log a call, or track a change..."
                />
                <button
                  onClick={() => {
                    const trimmed = comment.trim();
                    if (!trimmed) return;
                    onAddComment(lead.id, trimmed, activityType);
                    setComment('');
                    setActivityType('note');
                  }}
                  className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800"
                >
                  Log
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-100/60 dark:border-zinc-800/60 p-5 flex items-center justify-between gap-3 bg-zinc-50/60 dark:bg-zinc-950/60">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Icons.Calendar size={12} />
              {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'No date'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onStatusChange(lead.id, 'contacted')}
                className="px-3 py-2 text-xs font-semibold rounded-full bg-amber-100/70 text-amber-700 hover:bg-amber-100"
              >
                Mark Contacted
              </button>
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
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-zinc-900 text-white disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

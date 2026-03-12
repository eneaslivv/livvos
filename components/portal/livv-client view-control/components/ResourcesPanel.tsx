import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, FileText, DollarSign, Eye, EyeOff, Copy, Check, Download, Figma, FolderOpen, CalendarClock, CircleCheck, Clock, AlertTriangle } from 'lucide-react';
import type { CredentialItem, AssetItem, PaymentEntry, ProjectBudget, PortalProject } from '../types';

interface ResourcesPanelProps {
  credentials?: CredentialItem[];
  assets?: AssetItem[];
  budget: {
    total: number;
    paid: number;
    nextPayment?: { amount: number; dueDate: string; concept?: string };
    payments?: PaymentEntry[];
  };
  allProjectsBudget?: ProjectBudget[];
  hiddenTabs?: ('finance' | 'access' | 'docs')[];
  projects?: PortalProject[];
}

const TABS = [
  { id: 'finance', label: 'Finance', icon: DollarSign },
  { id: 'access', label: 'Access', icon: KeyRound },
  { id: 'docs', label: 'Documents', icon: FileText },
] as const;

type TabId = typeof TABS[number]['id'];

const fmtDate = (d: string) => {
  if (!d) return '—';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ResourcesPanel: React.FC<ResourcesPanelProps> = ({ credentials, assets, budget, allProjectsBudget, hiddenTabs, projects }) => {
  const visibleTabs = TABS.filter(tab => !hiddenTabs?.includes(tab.id));
  const [activeTab, setActiveTab] = useState<TabId>(visibleTabs[0]?.id || 'finance');
  const [showPass, setShowPass] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [showAmounts, setShowAmounts] = useState(true);
  const [financeFilter, setFinanceFilter] = useState<string>('all');
  const [docsFilter, setDocsFilter] = useState<string>('all');

  if (visibleTabs.length === 0) return null;

  const hasMultipleProjects = allProjectsBudget && allProjectsBudget.length > 1;

  const credItems = credentials || [];
  const docItems = assets || [];

  const togglePass = (id: string) => setShowPass(p => ({ ...p, [id]: !p[id] }));
  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getDocIcon = (type?: string) => {
    if (!type) return <FileText size={14} />;
    const k = type.toLowerCase();
    if (k.includes('figma')) return <Figma size={14} />;
    if (k.includes('drive')) return <FolderOpen size={14} />;
    return <FileText size={14} />;
  };

  // Compute active budget based on filter
  const activeBudget = (() => {
    if (!hasMultipleProjects || financeFilter === 'all') return budget;
    const proj = allProjectsBudget!.find(p => p.projectId === financeFilter);
    if (!proj) return budget;
    return {
      total: proj.total,
      paid: proj.paid,
      nextPayment: proj.nextPayment,
      payments: proj.payments,
    };
  })();

  // For "all" view with multiple projects, merge all payments sorted by date
  const allPaymentsMerged = hasMultipleProjects && financeFilter === 'all'
    ? allProjectsBudget!.flatMap(pb => pb.payments).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    : undefined;

  const consolidatedTotal = hasMultipleProjects ? allProjectsBudget!.reduce((s, p) => s + p.total, 0) : budget.total;
  const consolidatedPaid = hasMultipleProjects ? allProjectsBudget!.reduce((s, p) => s + p.paid, 0) : budget.paid;

  const displayBudget = financeFilter === 'all' && hasMultipleProjects
    ? { total: consolidatedTotal, paid: consolidatedPaid, payments: allPaymentsMerged }
    : activeBudget;

  const remaining = displayBudget.total - displayBudget.paid;
  const pct = displayBudget.total > 0 ? Math.round((displayBudget.paid / displayBudget.total) * 100) : 0;
  const fmt = (v: number) => showAmounts ? `$${v.toLocaleString()}` : '••••••';

  const payments = displayBudget.payments || [];
  const paidPayments = payments.filter(p => p.status === 'paid');
  const pendingPayments = payments.filter(p => p.status !== 'paid');
  const nextPayment = financeFilter === 'all' && hasMultipleProjects
    ? (() => {
        const next = pendingPayments[0];
        return next ? { amount: next.amount, dueDate: next.dueDate, concept: next.projectTitle ? `${next.projectTitle} — ${next.concept}` : next.concept } : undefined;
      })()
    : activeBudget.nextPayment;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 overflow-hidden h-full flex flex-col"
    >
      {/* Tab bar */}
      <div className="flex items-center border-b border-zinc-100 dark:border-zinc-800 px-1 pt-1">
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold transition-colors ${
                isActive
                  ? 'text-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400'
              }`}
            >
              <Icon size={12} />
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="resources-tab-indicator"
                  className="absolute bottom-0 left-2 right-2 h-[2px] bg-zinc-800 dark:bg-zinc-100 rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        <AnimatePresence mode="wait">
          {/* ── Finance Tab ── */}
          {activeTab === 'finance' && (
            <motion.div
              key="finance"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Project sub-selector (only with multiple projects) */}
              {hasMultipleProjects && (
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setFinanceFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                      financeFilter === 'all'
                        ? 'bg-[#2C0405] text-white dark:bg-[#e8a0a2] dark:text-[#2C0405]'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    All Projects
                  </button>
                  {allProjectsBudget!.map(pb => (
                    <button
                      key={pb.projectId}
                      onClick={() => setFinanceFilter(pb.projectId)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all truncate max-w-[140px] ${
                        financeFilter === pb.projectId
                          ? 'bg-[#2C0405] text-white dark:bg-[#e8a0a2] dark:text-[#2C0405]'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {pb.projectTitle}
                    </button>
                  ))}
                </div>
              )}

              {/* Header: total + toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mb-0.5">
                    {financeFilter === 'all' && hasMultipleProjects ? 'Total value (all projects)' : 'Total project value'}
                  </p>
                  <p className="text-2xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight">{fmt(displayBudget.total)}</p>
                </div>
                <button onClick={() => setShowAmounts(!showAmounts)} className="p-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                  {showAmounts ? <EyeOff size={13} className="text-zinc-300 dark:text-zinc-600" /> : <Eye size={13} className="text-zinc-400 dark:text-zinc-500" />}
                </button>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[10px] mb-1.5">
                  <span className="text-zinc-400 dark:text-zinc-500">Collection progress</span>
                  <span className="font-semibold text-zinc-500 dark:text-zinc-400">{showAmounts ? `${pct}%` : '••'}</span>
                </div>
                <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1.2, ease: 'circOut' }}
                    className="h-full bg-[#2C0405] rounded-full"
                  />
                </div>
              </div>

              {/* Paid / Remaining cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-[#2C0405]/5 dark:bg-[#822b2e]/15 rounded-xl">
                  <p className="text-[9px] text-[#2C0405]/50 dark:text-[#e8a0a2]/50 font-semibold mb-0.5">Collected</p>
                  <p className="text-sm font-bold text-[#2C0405] dark:text-[#e8a0a2]">{fmt(displayBudget.paid)}</p>
                </div>
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-500 font-semibold mb-0.5">Remaining</p>
                  <p className="text-sm font-bold text-zinc-600 dark:text-zinc-300">{fmt(remaining)}</p>
                </div>
              </div>

              {/* Per-project breakdown (only in "all" view with multiple projects) */}
              {financeFilter === 'all' && hasMultipleProjects && (
                <div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider mb-2">Per project</p>
                  <div className="space-y-1.5">
                    {allProjectsBudget!.map(pb => {
                      const pbPct = pb.total > 0 ? Math.round((pb.paid / pb.total) * 100) : 0;
                      return (
                        <button
                          key={pb.projectId}
                          onClick={() => setFinanceFilter(pb.projectId)}
                          className="w-full p-3 bg-zinc-50/80 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-zinc-200 dark:hover:border-zinc-600 transition-all text-left"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-200 truncate">{pb.projectTitle}</p>
                            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 flex-shrink-0 ml-2">{fmt(pb.total)}</p>
                          </div>
                          <div className="h-1 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pbPct}%` }}
                              transition={{ duration: 0.8, ease: 'circOut' }}
                              className="h-full bg-[#2C0405] dark:bg-[#e8a0a2] rounded-full"
                            />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{fmt(pb.paid)} collected</span>
                            <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{pbPct}%</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Next Payment highlight */}
              {nextPayment && (
                <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/40 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CalendarClock size={12} className="text-amber-600 dark:text-amber-400" />
                    <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Next Payment</p>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mb-0.5">{nextPayment.concept || 'Pending installment'}</p>
                      <p className="text-lg font-bold text-amber-800 dark:text-amber-200">{fmt(nextPayment.amount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-amber-500 dark:text-amber-400 font-medium">Due</p>
                      <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{fmtDate(nextPayment.dueDate)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Schedule */}
              {payments.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider mb-2.5">
                    Payment Schedule
                    <span className="text-zinc-300 dark:text-zinc-600 ml-1.5 normal-case font-normal">
                      ({paidPayments.length}/{payments.length} completed)
                    </span>
                  </p>
                  <div className="space-y-1.5">
                    {payments.map((p, i) => {
                      const isPaid = p.status === 'paid';
                      const isOverdue = p.status === 'overdue';
                      const isNext = !isPaid && pendingPayments[0]?.id === p.id;

                      return (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${
                            isPaid
                              ? 'bg-[#2C0405]/[0.03] dark:bg-[#822b2e]/10 border-[#2C0405]/10 dark:border-[#822b2e]/20'
                              : isOverdue
                              ? 'bg-red-50/40 dark:bg-red-950/30 border-red-100/60 dark:border-red-800/40'
                              : isNext
                              ? 'bg-amber-50/40 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40'
                              : 'bg-zinc-50/60 dark:bg-zinc-800/40 border-zinc-100/60 dark:border-zinc-700/40'
                          }`}
                        >
                          {/* Status icon */}
                          <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                            isPaid
                              ? 'bg-[#2C0405]/10 dark:bg-[#822b2e]/20 text-[#2C0405] dark:text-[#e8a0a2]'
                              : isOverdue
                              ? 'bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'
                          }`}>
                            {isPaid ? <CircleCheck size={11} /> : isOverdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {financeFilter === 'all' && hasMultipleProjects && p.projectTitle && (
                                <span className="flex-shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                                  {p.projectTitle}
                                </span>
                              )}
                              <p className={`text-[10px] font-semibold truncate ${
                                isPaid ? 'text-[#2C0405] dark:text-[#e8a0a2]' : isOverdue ? 'text-red-700 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-300'
                              }`}>
                                {p.concept}
                              </p>
                            </div>
                            <p className={`text-[9px] ${isPaid ? 'text-[#2C0405]/70 dark:text-[#e8a0a2]/70' : isOverdue ? 'text-red-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                              {isPaid && p.paidDate ? `Paid ${fmtDate(p.paidDate)}` : `Due ${fmtDate(p.dueDate)}`}
                              {p.linkedTaskTitle && ` · Delivery: ${p.linkedTaskTitle}`}
                            </p>
                          </div>

                          {/* Amount */}
                          <p className={`text-[11px] font-bold flex-shrink-0 ${
                            isPaid ? 'text-[#2C0405] dark:text-[#e8a0a2]' : isOverdue ? 'text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-300'
                          }`}>
                            {fmt(p.amount)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state when no payments and no budget */}
              {payments.length === 0 && displayBudget.total === 0 && (
                <div className="text-center py-4">
                  <CalendarClock size={20} className="text-zinc-200 dark:text-zinc-700 mx-auto mb-2" />
                  <p className="text-[11px] text-zinc-300 dark:text-zinc-600">No payments configured yet</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Access Tab ── */}
          {activeTab === 'access' && (
            <motion.div
              key="access"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              {credItems.map(c => (
                <div key={c.id} className="p-3 bg-zinc-50/80 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-zinc-200 dark:hover:border-zinc-600 transition-all group">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">{c.service}</p>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => togglePass(c.id)} className="p-1 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-300 rounded transition-colors">
                        {showPass[c.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button onClick={() => copyText(c.pass || '', c.id)} className="p-1 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-300 rounded transition-colors">
                        {copied === c.id ? <Check size={12} className="text-[#2C0405]/70 dark:text-[#e8a0a2]/70" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-300 dark:text-zinc-600">Username</span>
                      <span className="text-zinc-500 dark:text-zinc-400 font-mono font-medium">{c.user || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-300 dark:text-zinc-600">Password</span>
                      <span className="text-zinc-500 dark:text-zinc-400 font-mono font-medium tracking-wider">
                        {showPass[c.id] ? c.pass : '••••••••'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {credItems.length === 0 && (
                <p className="text-[11px] text-zinc-300 dark:text-zinc-600 text-center py-6">No shared credentials</p>
              )}
            </motion.div>
          )}

          {/* ── Documents Tab ── */}
          {activeTab === 'docs' && (() => {
            const hasMultiProjects = projects && projects.length > 1;
            // Get unique project names from docs
            const docProjectNames = hasMultiProjects
              ? [...new Set(docItems.filter(d => d.projectTitle).map(d => d.projectTitle!))]
              : [];
            const filteredDocs = docsFilter === 'all'
              ? docItems
              : docsFilter === 'general'
              ? docItems.filter(d => !d.projectTitle)
              : docItems.filter(d => d.projectTitle === docsFilter);

            return (
            <motion.div
              key="docs"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              {/* Project filter pills (only with multiple projects) */}
              {hasMultiProjects && docProjectNames.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setDocsFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                      docsFilter === 'all'
                        ? 'bg-[#2C0405] text-white dark:bg-[#e8a0a2] dark:text-[#2C0405]'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setDocsFilter('general')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                      docsFilter === 'general'
                        ? 'bg-[#2C0405] text-white dark:bg-[#e8a0a2] dark:text-[#2C0405]'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    General
                  </button>
                  {docProjectNames.map(name => (
                    <button
                      key={name}
                      onClick={() => setDocsFilter(name)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all truncate max-w-[140px] ${
                        docsFilter === name
                          ? 'bg-[#2C0405] text-white dark:bg-[#e8a0a2] dark:text-[#2C0405]'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}

              {filteredDocs.map((a, i) => (
                <div
                  key={a.id || i}
                  onClick={() => a.url && window.open(a.url, '_blank')}
                  className="flex items-center justify-between p-2.5 bg-zinc-50/80 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-zinc-200 dark:hover:border-zinc-600 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-white dark:bg-zinc-900 rounded-lg text-zinc-300 dark:text-zinc-600 group-hover:text-indigo-500 transition-colors border border-zinc-100 dark:border-zinc-800">
                      {getDocIcon(a.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        {hasMultiProjects && a.projectTitle && docsFilter === 'all' && (
                          <span className="flex-shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                            {a.projectTitle}
                          </span>
                        )}
                        <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-800 dark:group-hover:text-zinc-100 transition-colors">{a.name}</p>
                      </div>
                      <p className="text-[9px] text-zinc-300 dark:text-zinc-600">{a.size} · {a.type}</p>
                    </div>
                  </div>
                  <button className="p-1 text-zinc-200 dark:text-zinc-700 group-hover:text-indigo-500 transition-all">
                    <Download size={13} />
                  </button>
                </div>
              ))}
              {filteredDocs.length === 0 && (
                <p className="text-[11px] text-zinc-300 dark:text-zinc-600 text-center py-6">No shared documents</p>
              )}
            </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ResourcesPanel;

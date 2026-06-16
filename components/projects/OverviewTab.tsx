import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Project, ProjectStatus } from '../../context/ProjectsContext';
import { Client } from '../../context/ClientsContext';
import { TeamMember } from '../../context/TeamContext';
import { parseLocalDate } from '../../lib/dateUtils';

const fmtShortDate = (d: string | null | undefined) => {
  const date = parseLocalDate(d);
  return date ? date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '—';
};

const fmtMoney = (v: number) => `$${v.toLocaleString()}`;

const finInputClass = 'w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all';
const finLabelClass = 'block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5';

/* ── Editorial card chrome — warm LIVV tokens, paper-soft shadow ── */
const cardStyle: React.CSSProperties = {
  background: 'var(--os-panel)',
  border: '0.5px solid var(--os-border-2)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-card)',
};
/* Mono micro-label used for every section eyebrow */
const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--os-fg-2)',
};

/** Relative due label + whether it reads as overdue. */
const formatDue = (iso?: string): { text: string; overdue: boolean } => {
  if (!iso) return { text: 'No date', overdue: false };
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { text: 'Today', overdue: false };
  if (diff === 1) return { text: 'Tomorrow', overdue: false };
  if (diff === -1) return { text: 'Yesterday', overdue: true };
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff <= 7) return { text: `In ${diff}d`, overdue: false };
  return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false };
};

/** Friendly label for a reference URL pulled from the description. */
const linkLabel = (url: string): string => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const known: Record<string, string> = {
      'figma.com': 'Figma', 'github.com': 'GitHub', 'notion.so': 'Notion',
      'docs.google.com': 'Google Docs', 'drive.google.com': 'Drive',
      'vercel.app': 'Staging', 'loom.com': 'Loom', 'linear.app': 'Linear',
      'slack.com': 'Slack', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube',
    };
    for (const k in known) if (host === k || host.endsWith('.' + k)) return known[k];
    return host;
  } catch { return 'Link'; }
};

const extractUrls = (text: string): string[] => {
  const re = /https?:\/\/[^\s<>"]+/g;
  return Array.from(new Set((text.match(re) || []).map(u => u.replace(/[.,)]+$/, ''))));
};

/** Textarea that grows to fit its content — no inner scrollbar, so a long
 *  description is fully visible by default instead of trapped in a sub-scroll. */
const AutoGrowTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ value, onChange, placeholder, className, style }) => {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const fit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  React.useLayoutEffect(() => { fit(); }, [value, fit]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => { onChange(e.target.value); fit(); }}
      placeholder={placeholder}
      rows={2}
      className={className}
      style={style}
    />
  );
};

const DESC_URL_RE = /https?:\/\/[^\s<>"]+/;

export interface OverviewTabProps {
  project: Project;
  selectedClient: Client | null;
  clients: Client[];
  members: TeamMember[];
  derivedTasksGroups: { name: string; tasks: any[] }[];
  projectFinancials: {
    totalIncome: number;
    totalCollected: number;
    totalExpenses: number;
    profit: number;
    pendingAmount: number;
    incomeEntries: any[];
    expenseEntries: any[];
    projectTimeEntries: any[];
    totalHours: number;
    timeCost: number;
  };
  onUpdateProject: (updates: Partial<Project>) => void;
  onToggleTask: (groupIdx: number, taskId: string) => void;
  onSetActiveTab: (tab: string) => void;
  onSetExpandedTaskId: (id: string | null) => void;
  // Finance forms
  showIncomeForm: boolean;
  showExpenseForm: boolean;
  onShowIncomeForm: (val: boolean) => void;
  onShowExpenseForm: (val: boolean) => void;
  incomeFormData: { concept: string; amount: string; installments: string; dueDate: string; currency: string; installment_dates: string[] };
  expenseFormData: { concept: string; amount: string; category: string; date: string };
  onIncomeFormChange: (data: { concept: string; amount: string; installments: string; dueDate: string; currency: string; installment_dates: string[] }) => void;
  onExpenseFormChange: (data: { concept: string; amount: string; category: string; date: string }) => void;
  isSubmittingFinance: boolean;
  onCreateIncome: () => void;
  onCreateExpense: () => void;
  onUpdateInstallment: (id: string, updates: any) => Promise<void>;
  onDeleteIncome: (id: string) => Promise<void>;
  errorLogger: any;
  // Time tracking
  showTimeForm: boolean;
  onShowTimeForm: (val: boolean) => void;
  timeFormData: { description: string; hours: string; date: string; hourlyRate: string };
  onTimeFormChange: (data: { description: string; hours: string; date: string; hourlyRate: string }) => void;
  onCreateTimeEntry: () => void;
  onDeleteTimeEntry: (id: string) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  project,
  selectedClient,
  clients,
  members,
  derivedTasksGroups,
  projectFinancials,
  onUpdateProject,
  onToggleTask,
  onSetActiveTab,
  onSetExpandedTaskId,
  showIncomeForm,
  showExpenseForm,
  onShowIncomeForm,
  onShowExpenseForm,
  incomeFormData,
  expenseFormData,
  onIncomeFormChange,
  onExpenseFormChange,
  isSubmittingFinance,
  onCreateIncome,
  onCreateExpense,
  onUpdateInstallment,
  onDeleteIncome,
  errorLogger,
  showTimeForm,
  onShowTimeForm,
  timeFormData,
  onTimeFormChange,
  onCreateTimeEntry,
  onDeleteTimeEntry,
  onDeleteExpense,
}) => {
  /* ── Flatten tasks once, tag each with its phase index so the board can
        toggle them through onToggleTask(groupIdx, taskId). ── */
  const allTasks = derivedTasksGroups.flatMap((g: any, gIdx: number) =>
    g.tasks.map((t: any) => ({ ...t, groupIdx: gIdx }))
  );
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = allTasks
    .filter((t: any) => !t.done && t.dueDate && t.dueDate < today)
    .sort((a: any, b: any) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const upNextTasks = allTasks
    .filter((t: any) => !t.done && (!t.dueDate || t.dueDate >= today))
    .sort((a: any, b: any) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  const doneTasks = allTasks
    .filter((t: any) => t.done)
    .sort((a: any, b: any) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  const totalTasks = allTasks.length;
  const openTasks = overdueTasks.length + upNextTasks.length;

  const descUrls = project.description ? extractUrls(project.description) : [];

  const boardColumns: { key: string; label: string; dot: string; tint: string; tasks: any[]; empty: string }[] = [
    { key: 'overdue', label: 'Overdue', dot: 'var(--err)', tint: 'rgba(239,68,68,0.08)', tasks: overdueTasks, empty: 'Nothing overdue' },
    { key: 'next', label: 'Up next', dot: 'var(--livv-gold)', tint: 'rgba(196,163,90,0.10)', tasks: upNextTasks, empty: 'All clear' },
    { key: 'done', label: 'Done', dot: 'var(--livv-sage)', tint: 'rgba(118,146,104,0.10)', tasks: doneTasks, empty: 'Check off a task to see it here' },
  ];

  const openTask = (id: string) => { onSetActiveTab('tasks'); onSetExpandedTaskId(id); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ════════════════════ HERO ════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Description + headline stats ── */}
        <div className="lg:col-span-2 p-5 sm:p-6" style={cardStyle}>
          <span style={eyebrowStyle}>Brief</span>
          <AutoGrowTextarea
            value={project.description || ''}
            onChange={v => onUpdateProject({ description: v })}
            placeholder="Add a project description… paste URLs and they surface as quick links →"
            className="mt-2 w-full min-h-[3rem] text-[15px] leading-relaxed bg-transparent resize-none overflow-hidden focus:outline-none rounded-lg -mx-1 px-1"
            style={{ color: 'var(--os-fg-1)' }}
          />
          <div style={{ height: 1, width: '100%', borderTop: '1px dashed rgba(90,62,62,0.28)', margin: '18px 0 16px' }} />
          {/* Headline stats */}
          <div className="flex items-center gap-8 sm:gap-12">
            {[
              { label: 'Progress', value: `${project.progress}%` },
              { label: 'Open', value: String(openTasks) },
              { label: 'Total', value: String(totalTasks) },
            ].map(stat => (
              <div key={stat.label}>
                <div style={eyebrowStyle}>{stat.label}</div>
                <div style={{
                  marginTop: 4, fontFamily: 'var(--font-sans)', fontWeight: 300,
                  fontSize: 30, lineHeight: 1, letterSpacing: '-0.03em',
                  color: 'var(--os-fg-0)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {stat.value}
                </div>
              </div>
            ))}
            {/* Progress bar fills the remaining width */}
            <div className="flex-1 hidden sm:block">
              <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'var(--os-surface)', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${project.progress}%` }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    height: '100%', borderRadius: 999,
                    background: project.progress >= 100 ? 'var(--livv-sage)' : 'var(--livv-gold)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Team + links ── */}
        <div className="p-5 sm:p-6 flex flex-col gap-5" style={cardStyle}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span style={eyebrowStyle}>Team</span>
              <span style={{ ...eyebrowStyle, color: 'var(--os-fg-3)' }}>{project.team.length}</span>
            </div>
            {project.team.length > 0 ? (
              <div className="flex items-center flex-wrap gap-y-2">
                {project.team.map((userId, i) => {
                  const member = members.find(m => m.id === userId);
                  if (!member) return null;
                  const label = member.name || member.email;
                  return (
                    <div
                      key={member.id}
                      className="relative group/avatar"
                      style={{ marginLeft: i === 0 ? 0 : -8 }}
                      title={`${label}${member.role ? ` · ${member.role}` : ''}`}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold text-white overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, var(--livv-gold-soft), var(--livv-wine-400))', boxShadow: '0 0 0 2px var(--os-panel)' }}
                      >
                        {member.avatar_url
                          ? <img src={member.avatar_url} alt={label} className="w-full h-full object-cover" />
                          : label.substring(0, 2).toUpperCase()}
                      </div>
                      <button
                        onClick={() => onUpdateProject({ team: project.team.filter(id => id !== userId) })}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-900 text-white text-[9px] font-bold flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity hover:bg-rose-500"
                        title="Remove from team"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--os-fg-3)' }}>No members yet.</p>
            )}
            {members.filter(m => !project.team.includes(m.id)).length > 0 && (
              <select
                value=""
                onChange={e => {
                  if (!e.target.value || project.team.includes(e.target.value)) return;
                  onUpdateProject({ team: [...project.team, e.target.value] });
                }}
                className="mt-3 w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none transition-colors"
                style={{ background: 'var(--os-surface)', border: '1px dashed var(--os-border-2)', color: 'var(--os-fg-2)' }}
              >
                <option value="">+ Add member…</option>
                {members.filter(m => !project.team.includes(m.id)).map(m => (
                  <option key={m.id} value={m.id}>{m.name || m.email} ({m.role})</option>
                ))}
              </select>
            )}
          </div>

          {descUrls.length > 0 && (
            <div>
              <span style={eyebrowStyle}>Links</span>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {descUrls.slice(0, 8).map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                    style={{ background: 'var(--os-surface)', border: '0.5px solid var(--os-border-2)', color: 'var(--os-fg-1)' }}
                  >
                    <Icons.Link size={10} style={{ color: 'var(--livv-gold)' }} />
                    {linkLabel(url)}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════ TASK BOARD ════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-3 px-0.5">
          <span style={eyebrowStyle}>Tasks</span>
          <button
            onClick={() => onSetActiveTab('tasks')}
            className="inline-flex items-center gap-1 transition-colors hover:opacity-70"
            style={{ ...eyebrowStyle, color: 'var(--os-fg-3)' }}
          >
            {totalTasks} total
            <Icons.ChevronRight size={11} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {boardColumns.map(col => (
            <div key={col.key} className="p-4" style={{ ...cardStyle, background: 'var(--os-surface-2)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ width: 7, height: 7, borderRadius: 999, background: col.dot, flexShrink: 0 }} />
                <span className="text-[13px] font-semibold" style={{ color: 'var(--os-fg-0)' }}>{col.label}</span>
                <span className="ml-auto" style={{ ...eyebrowStyle, color: 'var(--os-fg-3)' }}>{col.tasks.length}</span>
              </div>
              {col.tasks.length > 0 ? (
                <div className="space-y-1.5">
                  {col.tasks.slice(0, 6).map((task: any) => {
                    const due = formatDue(task.dueDate);
                    return (
                      <div
                        key={task.id}
                        className="group/card flex items-start gap-2.5 p-2.5 rounded-xl transition-colors"
                        style={{ background: 'var(--os-panel)', border: '0.5px solid var(--os-border)' }}
                      >
                        <button
                          onClick={() => onToggleTask(task.groupIdx, task.id)}
                          className="mt-0.5 rounded-full flex items-center justify-center shrink-0 transition-all"
                          style={{
                            width: 16, height: 16,
                            border: task.done ? 'none' : '1.5px solid var(--os-border-2)',
                            background: task.done ? 'var(--livv-sage)' : 'transparent',
                            color: '#fff',
                          }}
                          title={task.done ? 'Mark as open' : 'Mark as done'}
                        >
                          {task.done && <Icons.Check size={9} strokeWidth={3} />}
                        </button>
                        <button onClick={() => openTask(task.id)} className="flex-1 min-w-0 text-left">
                          <div
                            className="text-[13px] leading-snug truncate"
                            style={{ color: task.done ? 'var(--os-fg-3)' : 'var(--os-fg-0)', textDecoration: task.done ? 'line-through' : 'none' }}
                          >
                            {task.title}
                          </div>
                          {!task.done && task.dueDate && (
                            <div
                              className="mt-1"
                              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.02em', color: due.overdue ? 'var(--err)' : 'var(--os-fg-3)' }}
                            >
                              {due.text}
                            </div>
                          )}
                          {task.done && task.completedAt && (
                            <div className="mt-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--livv-sage)' }}>
                              {new Date(task.completedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                            </div>
                          )}
                        </button>
                      </div>
                    );
                  })}
                  {col.tasks.length > 6 && (
                    <button
                      onClick={() => onSetActiveTab('tasks')}
                      className="w-full text-center py-1.5 transition-colors hover:opacity-70"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.04em', color: 'var(--os-fg-3)' }}
                    >
                      +{col.tasks.length - 6} more
                    </button>
                  )}
                </div>
              ) : (
                <p className="py-5 text-center text-[12px]" style={{ color: 'var(--os-fg-3)' }}>{col.empty}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════ FINANCES ════════════════════ */}
      <div className="p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <span style={eyebrowStyle}>Finances</span>
          {project.budget > 0 && (
            <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
              Budget: {project.currency} {project.budget.toLocaleString()}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Invoiced</div>
            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              ${projectFinancials.totalIncome.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Collected</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              ${projectFinancials.totalCollected.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Expenses</div>
            <div className="text-lg font-bold text-red-500 dark:text-red-400 tabular-nums">
              ${projectFinancials.totalExpenses.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Hours</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              {projectFinancials.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}h
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Time Cost</div>
            <div className="text-lg font-bold text-orange-500 dark:text-orange-400 tabular-nums">
              ${projectFinancials.timeCost.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Profit</div>
            <div className={`text-lg font-bold tabular-nums ${projectFinancials.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              ${projectFinancials.profit.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Collection progress bar */}
        {projectFinancials.totalIncome > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
              <span>Collection progress</span>
              <span className="tabular-nums">{Math.round((projectFinancials.totalCollected / projectFinancials.totalIncome) * 100)}%</span>
            </div>
            <div className="w-full bg-zinc-200/60 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, (projectFinancials.totalCollected / projectFinancials.totalIncome) * 100)}%` }}
              />
            </div>
            {projectFinancials.pendingAmount > 0 && (
              <div className="text-[10px] text-amber-500 font-medium mt-1">
                ${projectFinancials.pendingAmount.toLocaleString()} pending collection
              </div>
            )}
          </div>
        )}

        {/* Add income button — dashed, shown when form is hidden */}
        {!showIncomeForm && (
          <button
            onClick={() => { onShowIncomeForm(true); onShowExpenseForm(false); onShowTimeForm(false); }}
            className="w-full p-3 mb-3 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <Icons.Plus size={13} />
            Add income
          </button>
        )}

        {/* Income entries — card style */}
        {projectFinancials.incomeEntries.length > 0 && (
          <div className="space-y-3 mb-3">
            {projectFinancials.incomeEntries.map((inc: any) => {
              const installments = inc.installments || [];
              const paidInst = installments.filter((i: any) => i.status === 'paid');
              return (
                <div key={inc.id} className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl overflow-hidden">
                  {/* Income header */}
                  <div className="p-4 flex items-center justify-between group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{inc.concept || inc.client_name || 'Income'}</p>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          inc.status === 'paid' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700'
                          : inc.status === 'overdue' ? 'bg-red-100 dark:bg-red-500/20 text-red-600'
                          : inc.status === 'partial' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                        }`}>
                          {inc.status === 'paid' ? 'Paid' : inc.status === 'overdue' ? 'Overdue' : inc.status === 'partial' ? 'Partial' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {inc.client_name && inc.client_name !== 'General' ? `${inc.client_name} · ` : ''}
                        {installments.length > 0 ? `${paidInst.length}/${installments.length} installments` : 'Single payment'}
                        {inc.due_date ? ` · Due ${fmtShortDate(inc.due_date)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{fmtMoney(inc.total_amount)}</p>
                      <button
                        onClick={async () => {
                          if (!confirm('Delete this income entry?')) return;
                          try { await onDeleteIncome(inc.id); } catch (err) { errorLogger.error('Error deleting income', err); }
                        }}
                        className="p-1.5 text-zinc-300 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete income"
                      >
                        <Icons.Trash size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Installments — always visible */}
                  {installments.length > 0 && (
                    <div className="border-t border-zinc-200/60 dark:border-zinc-700/40">
                      {installments.map((inst: any) => {
                        const isPaid = inst.status === 'paid';
                        const isOverdue = inst.status === 'overdue';
                        return (
                          <div
                            key={inst.id}
                            className={`flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100/80 dark:border-zinc-700/30 last:border-b-0 transition-colors ${
                              isPaid ? 'bg-emerald-50/30 dark:bg-emerald-500/5' : ''
                            }`}
                          >
                            <button
                              onClick={async () => {
                                if (isPaid) return;
                                try {
                                  await onUpdateInstallment(inst.id, { status: 'paid', paid_date: new Date().toISOString().split('T')[0] });
                                } catch (err) {
                                  errorLogger.error('Error marking installment paid', err);
                                }
                              }}
                              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                                isPaid
                                  ? 'bg-emerald-500 border-emerald-500'
                                  : isOverdue
                                  ? 'border-red-300 dark:border-red-600 hover:border-red-400'
                                  : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400'
                              }`}
                            >
                              {isPaid && <Icons.Check size={12} className="text-white" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium ${isPaid ? 'text-emerald-700 dark:text-emerald-400 line-through' : isOverdue ? 'text-red-600' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                Installment {inst.number}
                              </p>
                              <p className={`text-[10px] ${isPaid ? 'text-emerald-500 dark:text-emerald-500/60' : isOverdue ? 'text-red-400' : 'text-zinc-400'}`}>
                                {isPaid && inst.paid_date ? `Paid ${fmtShortDate(inst.paid_date)}` : `Due ${fmtShortDate(inst.due_date)}`}
                              </p>
                            </div>
                            <p className={`text-xs font-bold ${isPaid ? 'text-emerald-600' : isOverdue ? 'text-red-600' : 'text-zinc-600 dark:text-zinc-400'}`}>
                              {fmtMoney(inst.amount)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Expense entries (full list with delete) */}
        {projectFinancials.expenseEntries.length > 0 && (
          <div className="space-y-1 mb-3">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Expenses ({projectFinancials.expenseEntries.length})
            </div>
            {projectFinancials.expenseEntries.map((exp: any) => (
              <div key={exp.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 group">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-400" />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{exp.concept}</span>
                  <span className="text-[9px] text-zinc-400 shrink-0">{exp.category}</span>
                  {exp.date && (
                    <span className="text-[9px] text-zinc-300 dark:text-zinc-600 shrink-0">
                      {new Date(exp.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold text-red-500 dark:text-red-400 tabular-nums">-${exp.amount.toLocaleString()}</span>
                  <button
                    onClick={() => { if (confirm('Delete this expense?')) onDeleteExpense(exp.id); }}
                    className="p-0.5 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete expense"
                  >
                    <Icons.X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Time entries list */}
        {projectFinancials.projectTimeEntries.length > 0 && (
          <div className="space-y-1 mb-3">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Time Logged ({projectFinancials.projectTimeEntries.length})
            </div>
            {projectFinancials.projectTimeEntries.map((entry: any) => (
              <div key={entry.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 group">
                <div className="flex items-center gap-2 min-w-0">
                  <Icons.Clock size={12} className="text-blue-400 shrink-0" />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{entry.description || 'Time entry'}</span>
                  {entry.date && (
                    <span className="text-[9px] text-zinc-300 dark:text-zinc-600 shrink-0">
                      {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                    {Number(entry.hours).toLocaleString(undefined, { maximumFractionDigits: 1 })}h
                  </span>
                  {entry.hourly_rate && (
                    <span className="text-[9px] text-zinc-400 tabular-nums">
                      ${(Number(entry.hours) * Number(entry.hourly_rate)).toLocaleString()}
                    </span>
                  )}
                  <button
                    onClick={() => { if (confirm('Delete this time entry?')) onDeleteTimeEntry(entry.id); }}
                    className="p-0.5 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete time entry"
                  >
                    <Icons.X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inline Income Form — neutral style matching Clients */}
        <AnimatePresence>
          {showIncomeForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="p-4 mb-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl space-y-3">
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">New income</p>
                <input
                  type="text"
                  placeholder="Concept (e.g.: Web development, Consulting...)"
                  value={incomeFormData.concept}
                  onChange={e => onIncomeFormChange({ ...incomeFormData, concept: e.target.value })}
                  className={finInputClass}
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={finLabelClass}>Total amount *</label>
                    <input
                      type="number" placeholder="0.00" min="0" step="0.01"
                      value={incomeFormData.amount}
                      onChange={e => onIncomeFormChange({ ...incomeFormData, amount: e.target.value })}
                      className={finInputClass}
                    />
                  </div>
                  <div>
                    <label className={finLabelClass}>Currency</label>
                    <select
                      value={incomeFormData.currency}
                      onChange={e => onIncomeFormChange({ ...incomeFormData, currency: e.target.value })}
                      className={finInputClass}
                    >
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={finLabelClass}>Installments</label>
                    <input
                      type="number" min="1" max="24"
                      value={incomeFormData.installments}
                      onChange={e => {
                        const n = parseInt(e.target.value) || 1;
                        const base = incomeFormData.dueDate ? new Date(incomeFormData.dueDate + 'T12:00:00') : new Date();
                        const dates = Array.from({ length: n }, (_, i) => {
                          const d = new Date(base);
                          d.setMonth(d.getMonth() + i);
                          return d.toISOString().split('T')[0];
                        });
                        onIncomeFormChange({ ...incomeFormData, installments: e.target.value, installment_dates: dates });
                      }}
                      className={finInputClass}
                    />
                  </div>
                  <div>
                    <label className={finLabelClass}>First due date</label>
                    <input
                      type="date"
                      value={incomeFormData.dueDate}
                      onChange={e => {
                        const n = parseInt(incomeFormData.installments) || 1;
                        const base = e.target.value ? new Date(e.target.value + 'T12:00:00') : new Date();
                        const dates = Array.from({ length: n }, (_, i) => {
                          const d = new Date(base);
                          d.setMonth(d.getMonth() + i);
                          return d.toISOString().split('T')[0];
                        });
                        onIncomeFormChange({ ...incomeFormData, dueDate: e.target.value, installment_dates: dates });
                      }}
                      className={finInputClass}
                    />
                  </div>
                </div>
                {/* Per-installment date editors */}
                {parseInt(incomeFormData.installments) > 1 && incomeFormData.installment_dates.length > 0 && (
                  <div className="space-y-1.5 p-3 bg-zinc-100/60 dark:bg-zinc-700/20 rounded-lg">
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Dates per installment</p>
                    {incomeFormData.installment_dates.map((date, idx) => {
                      const totalAmt = parseFloat(incomeFormData.amount) || 0;
                      const n = parseInt(incomeFormData.installments) || 1;
                      const perInst = Math.round((totalAmt / n) * 100) / 100;
                      const amt = idx === n - 1 ? Math.round((totalAmt - perInst * (n - 1)) * 100) / 100 : perInst;
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-zinc-500 w-14 shrink-0">Inst. {idx + 1}</span>
                          <input
                            type="date"
                            value={date}
                            onChange={e => {
                              const updated = [...incomeFormData.installment_dates];
                              updated[idx] = e.target.value;
                              onIncomeFormChange({ ...incomeFormData, installment_dates: updated });
                            }}
                            className={finInputClass + ' flex-1'}
                          />
                          {totalAmt > 0 && (
                            <span className="text-[10px] text-zinc-400 w-20 text-right shrink-0">${amt.toLocaleString()}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onCreateIncome}
                    disabled={isSubmittingFinance || !incomeFormData.concept.trim() || !incomeFormData.amount || Number(incomeFormData.amount) <= 0}
                    className="px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all flex items-center gap-2"
                  >
                    {isSubmittingFinance ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Icons.Plus size={13} />
                    )}
                    {isSubmittingFinance ? 'Creating...' : 'Create Income'}
                  </button>
                  <button
                    onClick={() => { onShowIncomeForm(false); onIncomeFormChange({ concept: '', amount: '', installments: '1', dueDate: new Date().toISOString().split('T')[0], currency: project.currency || 'USD', installment_dates: [] }); }}
                    className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline Expense Form */}
        <AnimatePresence>
          {showExpenseForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="p-3 mb-3 bg-red-50/50 dark:bg-red-500/5 rounded-lg border border-red-200/60 dark:border-red-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">New Expense</span>
                  <button onClick={() => { onShowExpenseForm(false); onExpenseFormChange({ concept: '', amount: '', category: 'Software', date: new Date().toISOString().split('T')[0] }); }}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                    <Icons.X size={14} />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Concept (e.g. Hosting, Design tools...)"
                  value={expenseFormData.concept}
                  onChange={e => onExpenseFormChange({ ...expenseFormData, concept: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                  autoFocus
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] text-zinc-400 font-medium uppercase mb-0.5 block">Amount</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">$</span>
                      <input
                        type="number" min="0" step="0.01" placeholder="0"
                        value={expenseFormData.amount}
                        onChange={e => onExpenseFormChange({ ...expenseFormData, amount: e.target.value })}
                        className="w-full pl-6 pr-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-400 font-medium uppercase mb-0.5 block">Category</label>
                    <select
                      value={expenseFormData.category}
                      onChange={e => onExpenseFormChange({ ...expenseFormData, category: e.target.value })}
                      className="w-full px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                    >
                      {['Software', 'Talent', 'Marketing', 'Operations', 'Legal'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-400 font-medium uppercase mb-0.5 block">Date</label>
                    <input
                      type="date"
                      value={expenseFormData.date}
                      onChange={e => onExpenseFormChange({ ...expenseFormData, date: e.target.value })}
                      className="w-full px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => { onShowExpenseForm(false); onExpenseFormChange({ concept: '', amount: '', category: 'Software', date: new Date().toISOString().split('T')[0] }); }}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={isSubmittingFinance || !expenseFormData.concept.trim() || !expenseFormData.amount || Number(expenseFormData.amount) <= 0}
                    onClick={onCreateExpense}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow-sm transition-all"
                  >
                    {isSubmittingFinance ? 'Saving...' : 'Save Expense'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline Time Entry Form */}
        <AnimatePresence>
          {showTimeForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="p-3 mb-3 bg-blue-50/50 dark:bg-blue-500/5 rounded-lg border border-blue-200/60 dark:border-blue-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Log Time</span>
                  <button onClick={() => { onShowTimeForm(false); onTimeFormChange({ description: '', hours: '', date: new Date().toISOString().split('T')[0], hourlyRate: '' }); }}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                    <Icons.X size={14} />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="What did you work on?"
                  value={timeFormData.description}
                  onChange={e => onTimeFormChange({ ...timeFormData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  autoFocus
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] text-zinc-400 font-medium uppercase mb-0.5 block">Hours</label>
                    <input
                      type="number" min="0.25" step="0.25" placeholder="0"
                      value={timeFormData.hours}
                      onChange={e => onTimeFormChange({ ...timeFormData, hours: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-400 font-medium uppercase mb-0.5 block">Rate/hr (opt)</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">$</span>
                      <input
                        type="number" min="0" step="1" placeholder="—"
                        value={timeFormData.hourlyRate}
                        onChange={e => onTimeFormChange({ ...timeFormData, hourlyRate: e.target.value })}
                        className="w-full pl-6 pr-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-400 font-medium uppercase mb-0.5 block">Date</label>
                    <input
                      type="date"
                      value={timeFormData.date}
                      onChange={e => onTimeFormChange({ ...timeFormData, date: e.target.value })}
                      className="w-full px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                </div>
                {timeFormData.hours && timeFormData.hourlyRate && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-100/60 dark:bg-blue-500/10 rounded-md">
                    <Icons.Clock size={12} className="text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-[10px] text-blue-700 dark:text-blue-300 font-medium">
                      {timeFormData.hours}h × ${Number(timeFormData.hourlyRate).toLocaleString()}/hr = ${(Number(timeFormData.hours) * Number(timeFormData.hourlyRate)).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => { onShowTimeForm(false); onTimeFormChange({ description: '', hours: '', date: new Date().toISOString().split('T')[0], hourlyRate: '' }); }}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={isSubmittingFinance || !timeFormData.hours || Number(timeFormData.hours) <= 0}
                    onClick={onCreateTimeEntry}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow-sm transition-all"
                  >
                    {isSubmittingFinance ? 'Saving...' : 'Log Time'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Budget input + Expense/Time buttons */}
        <div className="flex items-center gap-2">
          {!project.budget && (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="number"
                placeholder="Project budget..."
                className="flex-1 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const val = parseFloat((e.target as HTMLInputElement).value);
                    if (val > 0) {
                      onUpdateProject({ budget: val });
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
            </div>
          )}
          <button
            onClick={() => { onShowExpenseForm(true); onShowIncomeForm(false); onShowTimeForm(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
          >
            <Icons.Plus size={12} />
            Expense
          </button>
          <button
            onClick={() => { onShowTimeForm(true); onShowIncomeForm(false); onShowExpenseForm(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
          >
            <Icons.Plus size={12} />
            Time
          </button>
        </div>
      </div>

      {/* ════════════════════ CLIENT · TAGS · ACTIVITY ════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-4">
          {/* Client assignment + info card */}
          <div className="p-5" style={cardStyle}>
            <span style={eyebrowStyle}>Client</span>
            {selectedClient ? (
              <div className="flex items-center gap-3 mt-3 mb-3">
                {selectedClient.avatar_url ? (
                  <img src={selectedClient.avatar_url} alt={selectedClient.name} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-xs font-bold text-white">
                    {selectedClient.name.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selectedClient.name}</div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                    {[selectedClient.company, selectedClient.email].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button
                  onClick={() => onUpdateProject({ client_id: null, client: 'TBD', clientName: 'TBD' } as any)}
                  className="p-1 text-zinc-300 hover:text-red-400 transition-colors"
                  title="Unlink client"
                >
                  <Icons.X size={14} />
                </button>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 mt-2 mb-2">Own project — no client assigned.</p>
            )}
            <select
              value={project.client_id || ''}
              onChange={e => {
                const cid = e.target.value || null;
                const client = clients.find(c => c.id === cid);
                onUpdateProject({
                  client_id: cid,
                  client: client?.name || 'TBD',
                  clientName: client?.name || 'TBD',
                } as any);
              }}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
            >
              <option value="">No client (own project)</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
            </select>
          </div>

          {/* Tags */}
          {project.tags.length > 0 && (
            <div className="p-5" style={cardStyle}>
              <span style={eyebrowStyle}>Tags</span>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {project.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[11px] font-medium rounded-full">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Activity — always shown so project updates have a home even
            when there's nothing yet (keeps the column from collapsing empty). */}
        <div className="p-5" style={cardStyle}>
          <span style={eyebrowStyle}>Recent Activity</span>
          {project.activity.length > 0 ? (
            <div className="space-y-2.5 mt-3">
              {project.activity.slice(0, 6).map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 mt-1.5 shrink-0" />
                  <div>
                    <div className="text-xs text-zinc-700 dark:text-zinc-300">{a.text}</div>
                    <div className="text-[10px] text-zinc-400">{a.date ? new Date(a.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''} {a.user && `· ${a.user}`}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 leading-relaxed mt-2">No updates yet. Status changes, new tasks and payments will show up here.</p>
          )}
        </div>
      </div>
    </div>
  );
};

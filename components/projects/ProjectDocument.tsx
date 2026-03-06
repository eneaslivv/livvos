import React, { useMemo } from 'react';
import { Icons } from '../ui/Icons';

/* ── Types (matching get_public_portal RPC response) ── */
interface DocTask {
  id: string; title: string; completed: boolean; status: string; priority: string;
  due_date?: string; start_date?: string; parent_task_id?: string;
  group_name?: string; completed_at?: string;
}
interface DocFile { id: string; name: string; type?: string; size?: number; url?: string; }
interface DocIncome {
  id: string; concept?: string; total_amount?: number; status?: string; due_date?: string;
  installments?: { id: string; number?: number; amount?: number; due_date?: string; paid_date?: string; status?: string }[];
}
interface DocActivity { id: string; action?: string; created_at?: string; }

export interface ProjectDocumentData {
  project: {
    id: string; title: string; description?: string; status: string;
    created_at?: string; updated_at?: string;
    client_id?: string; client_name?: string; client_company?: string;
  };
  tasks?: DocTask[];
  files?: DocFile[];
  incomes?: DocIncome[];
  activity?: DocActivity[];
}

/* ── Helpers ── */
const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
};

const fmtShortDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
};

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    active: 'Active', pending: 'Pending', review: 'In Review',
    completed: 'Completed', archived: 'Archived', paused: 'Paused',
  };
  return map[s] || s;
};

const statusColor = (s: string) => {
  const map: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700', pending: 'bg-amber-50 text-amber-700',
    review: 'bg-violet-50 text-violet-700', completed: 'bg-sky-50 text-sky-700',
    archived: 'bg-zinc-100 text-zinc-500', paused: 'bg-orange-50 text-orange-700',
  };
  return map[s] || 'bg-zinc-100 text-zinc-600';
};

const priorityDot = (p: string) => {
  const map: Record<string, string> = { urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-amber-400', low: 'bg-zinc-300' };
  return map[p] || 'bg-zinc-300';
};

const fileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'text-red-500';
  if (['doc', 'docx'].includes(ext)) return 'text-blue-500';
  if (['xls', 'xlsx'].includes(ext)) return 'text-emerald-500';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'text-violet-500';
  if (['fig', 'sketch', 'psd', 'ai'].includes(ext)) return 'text-pink-500';
  return 'text-zinc-400';
};

const formatSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

/* ── Separator ── */
const Divider = () => <div className="border-t border-zinc-100 my-8" />;

/* ── Section header ── */
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">{children}</h2>
);

/* ══════════════════════════════════════════ */
/* ── Main Component                       ── */
/* ══════════════════════════════════════════ */
export const ProjectDocument: React.FC<{ data: ProjectDocumentData }> = ({ data }) => {
  const { project, tasks = [], files = [], incomes = [], activity = [] } = data;

  /* ── Progress ── */
  const mainTasks = useMemo(() => tasks.filter(t => !t.parent_task_id), [tasks]);
  const completedCount = useMemo(() => mainTasks.filter(t => t.completed).length, [mainTasks]);
  const totalCount = mainTasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  /* ── Tasks grouped by phase ── */
  const taskGroups = useMemo(() => {
    const map = new Map<string, DocTask[]>();
    for (const t of mainTasks) {
      const key = t.group_name || 'General';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [mainTasks]);

  /* ── Finances ── */
  const finance = useMemo(() => {
    let total = 0;
    let paid = 0;
    const payments: { concept: string; amount: number; dueDate: string; status: string }[] = [];

    for (const inc of incomes) {
      total += Number(inc.total_amount || 0);
      const insts = inc.installments || [];
      if (insts.length > 0) {
        for (const inst of insts) {
          const isPaid = inst.status === 'paid';
          if (isPaid) paid += Number(inst.amount || 0);
          payments.push({
            concept: `${inc.concept || 'Payment'} #${inst.number || 1}`,
            amount: Number(inst.amount || 0),
            dueDate: inst.due_date || inc.due_date || '',
            status: inst.status || 'pending',
          });
        }
      } else {
        if (inc.status === 'paid') paid += Number(inc.total_amount || 0);
        payments.push({
          concept: inc.concept || 'Payment',
          amount: Number(inc.total_amount || 0),
          dueDate: inc.due_date || '',
          status: inc.status || 'pending',
        });
      }
    }
    payments.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    return { total, paid, remaining: total - paid, payments };
  }, [incomes]);

  const clientLabel = project.client_company || project.client_name;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* ── Header ── */}
        <div className="flex items-start gap-4 mb-2">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-white font-bold text-lg shrink-0">
            {project.title.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-900">{project.title}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor(project.status)}`}>
                {statusLabel(project.status)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
              {clientLabel && <span>{clientLabel}</span>}
              {clientLabel && project.created_at && <span className="text-zinc-300">|</span>}
              {project.created_at && <span>Started {fmtDate(project.created_at)}</span>}
              {project.updated_at && (
                <>
                  <span className="text-zinc-300">|</span>
                  <span>Updated {fmtDate(project.updated_at)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Description ── */}
        {project.description && (
          <>
            <Divider />
            <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">{project.description}</p>
          </>
        )}

        {/* ── Progress ── */}
        <Divider />
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Progress</SectionTitle>
          <span className="text-2xl font-bold text-zinc-900">{progress}%</span>
        </div>
        <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-zinc-500">
          {completedCount} of {totalCount} tasks completed
        </p>

        {/* ── Tasks by phase ── */}
        {taskGroups.length > 0 && (
          <>
            <Divider />
            <SectionTitle>Tasks</SectionTitle>
            <div className="space-y-6">
              {taskGroups.map(([groupName, groupTasks]) => {
                const groupDone = groupTasks.filter(t => t.completed).length;
                return (
                  <div key={groupName}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-zinc-800">{groupName}</h3>
                      <span className="text-xs text-zinc-400">{groupDone}/{groupTasks.length}</span>
                    </div>
                    <div className="space-y-1">
                      {groupTasks.map(task => (
                        <div key={task.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-zinc-50 transition-colors">
                          {/* Checkbox */}
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                            task.completed ? 'bg-emerald-500' : 'border-2 border-zinc-200'
                          }`}>
                            {task.completed && <Icons.Check size={12} className="text-white" />}
                          </div>
                          {/* Title */}
                          <span className={`flex-1 text-sm ${task.completed ? 'text-zinc-400 line-through' : 'text-zinc-700'}`}>
                            {task.title}
                          </span>
                          {/* Priority dot */}
                          {task.priority && task.priority !== 'none' && (
                            <div className={`w-2 h-2 rounded-full ${priorityDot(task.priority)}`} title={task.priority} />
                          )}
                          {/* Date */}
                          {(task.completed_at || task.due_date) && (
                            <span className="text-xs text-zinc-400 shrink-0">
                              {task.completed ? fmtShortDate(task.completed_at || task.due_date || '') : `Due ${fmtShortDate(task.due_date || '')}`}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── Finances ── */}
        {finance.total > 0 && (
          <>
            <Divider />
            <SectionTitle>Finances</SectionTitle>
            <div className="flex gap-6 mb-5">
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Total</p>
                <p className="text-lg font-bold text-zinc-900">{fmtCurrency(finance.total)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Paid</p>
                <p className="text-lg font-bold text-emerald-600">{fmtCurrency(finance.paid)}</p>
              </div>
              {finance.remaining > 0 && (
                <div>
                  <p className="text-xs text-zinc-400 mb-0.5">Remaining</p>
                  <p className="text-lg font-bold text-zinc-500">{fmtCurrency(finance.remaining)}</p>
                </div>
              )}
            </div>
            {finance.payments.length > 0 && (
              <div className="space-y-1">
                {finance.payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-zinc-50 transition-colors">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                      p.status === 'paid' ? 'bg-emerald-500' : 'border-2 border-zinc-200'
                    }`}>
                      {p.status === 'paid' && <Icons.Check size={12} className="text-white" />}
                    </div>
                    <span className={`flex-1 text-sm ${p.status === 'paid' ? 'text-zinc-400' : 'text-zinc-700'}`}>
                      {p.concept}
                    </span>
                    <span className="text-sm font-medium text-zinc-700">{fmtCurrency(p.amount)}</span>
                    {p.dueDate && (
                      <span className="text-xs text-zinc-400 shrink-0">{fmtShortDate(p.dueDate)}</span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      p.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                      p.status === 'overdue' ? 'bg-red-50 text-red-600' :
                      'bg-zinc-100 text-zinc-500'
                    }`}>
                      {p.status === 'paid' ? 'Paid' : p.status === 'overdue' ? 'Overdue' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Files ── */}
        {files.length > 0 && (
          <>
            <Divider />
            <SectionTitle>Files</SectionTitle>
            <div className="space-y-1">
              {files.map(f => (
                <a
                  key={f.id}
                  href={f.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  <Icons.File size={16} className={fileIcon(f.name)} />
                  <span className="flex-1 text-sm text-zinc-700 truncate">{f.name}</span>
                  {f.size && <span className="text-xs text-zinc-400 shrink-0">{formatSize(f.size)}</span>}
                </a>
              ))}
            </div>
          </>
        )}

        {/* ── Recent Activity ── */}
        {activity.length > 0 && (
          <>
            <Divider />
            <SectionTitle>Recent Activity</SectionTitle>
            <div className="space-y-2">
              {activity.map(a => (
                <div key={a.id} className="flex items-start gap-3 py-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-600">{a.action || 'Project update'}</p>
                  </div>
                  {a.created_at && (
                    <span className="text-xs text-zinc-400 shrink-0">{fmtShortDate(a.created_at)}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Footer ── */}
        <div className="text-center mt-16 pb-8">
          <p className="text-[10px] text-zinc-300">Powered by Livv</p>
        </div>
      </div>
    </div>
  );
};

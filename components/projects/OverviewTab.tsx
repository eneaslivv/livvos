import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Project, ProjectStatus } from '../../context/ProjectsContext';
import { Client } from '../../context/ClientsContext';
import { TeamMember } from '../../context/TeamContext';
import { parseLocalDate } from '../../lib/dateUtils';

const fmtShortDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const date = d.includes('T') ? new Date(d) : parseLocalDate(d);
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

const fmtMoney = (v: number) => `$${v.toLocaleString()}`;

const finInputClass = 'w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all';
const finLabelClass = 'block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5';

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
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      <div className="lg:col-span-2 space-y-4 sm:space-y-6">
        {/* Description (editable) */}
        <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Description</h3>
          <textarea
            rows={3}
            value={project.description}
            onChange={e => onUpdateProject({ description: e.target.value })}
            placeholder="Add a project description..."
            className="w-full text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-zinc-200 dark:focus:ring-zinc-700 rounded-lg px-2 py-1 -mx-2 -my-1"
          />
        </div>
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="p-4 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-2">Progress</div>
            <div className="flex items-end gap-3">
              <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{project.progress}%</span>
              <div className="flex-1 mb-1.5">
                <div className="w-full bg-zinc-200/60 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${project.progress === 100 ? 'bg-emerald-500' : 'bg-zinc-900 dark:bg-zinc-200'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${project.progress}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="p-4 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-2">Tasks Open</div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1 tabular-nums">
              {derivedTasksGroups.flatMap(g => g.tasks).filter((t: any) => !t.done).length}
            </div>
            <div className="text-[11px] text-zinc-400">Across {derivedTasksGroups.length} phases</div>
            {(() => {
              const openTasks = derivedTasksGroups.flatMap(g => g.tasks).filter((t: any) => !t.done && t.dueDate);
              const nextDue = openTasks.sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate))[0];
              return nextDue ? (
                <div className="text-[10px] text-amber-500 font-medium mt-1">
                  Next: {new Date(nextDue.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              ) : null;
            })()}
          </div>
          <div className="p-4 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-2">Deadline</div>
            {project.deadline ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Icons.Calendar size={14} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {new Date(project.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                {(() => {
                  const deadlineDate = new Date(project.deadline);
                  const now = new Date();
                  const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div className={`mt-1 text-[11px] font-medium ${daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft} days remaining`}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="text-sm text-zinc-400 italic">Not set</div>
            )}
            <input
              type="date"
              value={project.deadline}
              onChange={e => onUpdateProject({ deadline: e.target.value })}
              className="mt-2 w-full px-2 py-1 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
            />
          </div>
        </div>
        {/* Tasks Overview */}
        {(() => {
          const allTasks = derivedTasksGroups.flatMap((g: any, gIdx: number) =>
            g.tasks.map((t: any) => ({ ...t, groupName: g.name, groupIdx: gIdx }))
          );
          const openTasks = allTasks.filter((t: any) => !t.done);
          const doneTasks = allTasks.filter((t: any) => t.done);
          const displayTasks = [...openTasks.slice(0, 8), ...doneTasks.slice(0, Math.max(0, 10 - Math.min(openTasks.length, 8)))];
          const totalOpen = openTasks.length;
          const totalDone = doneTasks.length;
          const totalAll = allTasks.length;
          return (
            <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tasks</h3>
                {totalAll > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full tabular-nums">
                      {totalDone}/{totalAll} completed
                    </span>
                  </div>
                )}
              </div>
              {/* Progress bar */}
              {totalAll > 0 && (
                <div className="mb-3">
                  <div className="w-full bg-zinc-200/60 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${Math.round((totalDone / totalAll) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {displayTasks.length > 0 ? (
                <div className="space-y-0.5">
                  {displayTasks.map((task: any) => {
                    const priorityColor = task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-amber-500' : task.priority === 'medium' ? 'bg-blue-500' : 'bg-emerald-500';
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date(new Date().toISOString().slice(0, 10)) && !task.done;
                    return (
                      <div key={task.id} className={`group/otask flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-lg transition-all duration-300 ${task.done ? 'opacity-60' : ''} hover:bg-zinc-100/60 dark:hover:bg-zinc-800/30`}>
                        <button
                          onClick={() => onToggleTask(task.groupIdx, task.id)}
                          className={`rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
                            task.done
                              ? 'bg-emerald-500 border-emerald-500 text-white scale-110'
                              : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-400 text-transparent'
                          }`}
                          style={{ width: 18, height: 18 }}
                        >
                          <Icons.Check size={10} strokeWidth={3} />
                        </button>
                        <button
                          onClick={() => { onSetActiveTab('tasks'); onSetExpandedTaskId(task.id); }}
                          className="flex-1 min-w-0 text-left"
                        >
                          <span className={`text-sm transition-all duration-300 truncate block ${task.done ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white'}`}>
                            {task.title}
                          </span>
                          {task.done && task.completedAt && (
                            <span className="text-[10px] text-emerald-500/70 dark:text-emerald-400/60">
                              Completed {new Date(task.completedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {task.done ? (
                            <Icons.CheckCircle size={13} className="text-emerald-500" />
                          ) : (
                            <>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityColor}`} />
                              {task.dueDate && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                                  isOverdue
                                    ? 'text-red-500 bg-red-50 dark:bg-red-500/10 font-semibold'
                                    : 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800'
                                }`}>
                                  {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 py-2">No tasks yet.</p>
              )}
              {totalAll > 0 && (
                <button
                  onClick={() => onSetActiveTab('tasks')}
                  className="mt-3 w-full py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                >
                  View all tasks →
                </button>
              )}
            </div>
          );
        })()}
        {/* Financial Summary */}
        <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Finances</h3>
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

        {/* Client assignment + info card */}
        <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Client</h3>
          {selectedClient ? (
            <div className="flex items-center gap-3 mb-3">
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
            <p className="text-xs text-zinc-400 mb-2">Own project — no client assigned.</p>
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
      </div>
      {/* Right column */}
      <div className="col-span-1 space-y-6">
        {/* Team */}
        <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-4">Team</h3>
          <div className="flex flex-col gap-2.5">
            {project.team.map(userId => {
              const member = members.find(m => m.id === userId);
              if (!member) return null;
              return (
                <div key={member.id} className="flex items-center gap-3 group">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden shrink-0">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt={member.name || ''} className="w-full h-full object-cover" />
                    ) : (
                      (member.name || member.email).substring(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{member.name || member.email}</div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{member.role}</div>
                  </div>
                  <button
                    onClick={() => onUpdateProject({ team: project.team.filter(id => id !== userId) })}
                    className="p-1 rounded-md opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all shrink-0"
                    title="Remove from team"
                  >
                    <Icons.X size={12} />
                  </button>
                </div>
              );
            })}
            {project.team.length === 0 && (
              <p className="text-xs text-zinc-400 mb-1">No members assigned.</p>
            )}
          </div>
          {members.filter(m => !project.team.includes(m.id)).length > 0 && (
            <select
              value=""
              onChange={e => {
                if (!e.target.value) return;
                if (project.team.includes(e.target.value)) return;
                onUpdateProject({ team: [...project.team, e.target.value] });
              }}
              className="w-full mt-3 px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg text-xs text-zinc-500 dark:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
            >
              <option value="">+ Add member...</option>
              {members.filter(m => !project.team.includes(m.id)).map(m => (
                <option key={m.id} value={m.id}>{m.name || m.email} ({m.role})</option>
              ))}
            </select>
          )}
        </div>

        {/* Tags */}
        {project.tags.length > 0 && (
          <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {project.tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[11px] font-medium rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {project.activity.length > 0 && (
          <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Recent Activity</h3>
            <div className="space-y-2.5">
              {project.activity.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 mt-1.5 shrink-0" />
                  <div>
                    <div className="text-xs text-zinc-700 dark:text-zinc-300">{a.text}</div>
                    <div className="text-[10px] text-zinc-400">{a.date ? new Date(a.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''} {a.user && `· ${a.user}`}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

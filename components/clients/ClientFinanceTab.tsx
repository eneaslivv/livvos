import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Client } from '../../hooks/useClients';
import { IncomeEntry, Installment } from '../../context/FinanceContext';

const fmtShortDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const date = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

const fmtMoney = (v: number) => `$${v.toLocaleString()}`;

const inputClass = 'w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all';
const labelClass = 'block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5';

interface ClientFinanceTabProps {
  client: Client;
  clientIncomes: IncomeEntry[];
  clientFinancials: {
    totalIncome: number;
    totalCollected: number;
    totalExpenses: number;
    totalHours: number;
    timeCost: number;
    profit: number;
    pendingAmount: number;
    paidCount: number;
    totalCount: number;
    overdue: number;
  };
  // Income
  showNewIncomeForm: boolean;
  newIncomeData: {
    concept: string;
    total_amount: string;
    num_installments: string;
    due_date: string;
    project_id: string;
    currency: string;
    installment_dates: string[];
  };
  creatingIncome: boolean;
  deletingIncomeId: string | null;
  availableProjects: { id: string; title: string; client_id?: string | null }[];
  onShowNewIncomeForm: (show: boolean) => void;
  onNewIncomeDataChange: (data: ClientFinanceTabProps['newIncomeData']) => void;
  onCreateIncome: () => void;
  onDeleteIncome: (incomeId: string) => void;
  onMarkInstallmentPaid: (installment: Installment) => void;
  // Expenses
  showExpenseForm: boolean;
  onShowExpenseForm: (show: boolean) => void;
  expenseFormData: { concept: string; amount: string; category: string; date: string };
  onExpenseFormChange: (data: { concept: string; amount: string; category: string; date: string }) => void;
  onCreateExpense: () => void;
  onDeleteExpense: (id: string) => void;
  // Time entries
  showTimeForm: boolean;
  onShowTimeForm: (show: boolean) => void;
  timeFormData: { description: string; hours: string; date: string; hourlyRate: string };
  onTimeFormChange: (data: { description: string; hours: string; date: string; hourlyRate: string }) => void;
  onCreateTimeEntry: () => void;
  onDeleteTimeEntry: (id: string) => void;
  isSubmittingFinance: boolean;
}

export const ClientFinanceTab: React.FC<ClientFinanceTabProps> = ({
  client,
  clientIncomes,
  clientFinancials,
  showNewIncomeForm,
  newIncomeData,
  creatingIncome,
  deletingIncomeId,
  availableProjects,
  onShowNewIncomeForm,
  onNewIncomeDataChange,
  onCreateIncome,
  onDeleteIncome,
  onMarkInstallmentPaid,
  showExpenseForm,
  onShowExpenseForm,
  expenseFormData,
  onExpenseFormChange,
  onCreateExpense,
  onDeleteExpense,
  showTimeForm,
  onShowTimeForm,
  timeFormData,
  onTimeFormChange,
  onCreateTimeEntry,
  onDeleteTimeEntry,
  isSubmittingFinance,
}) => {
  return (
    <motion.div key="finance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      {/* ─── 6-Metric Financial Summary Grid ─── */}
      <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800 mb-4">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">Finances</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Invoiced</div>
            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              ${clientFinancials.totalIncome.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Collected</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              ${clientFinancials.totalCollected.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Expenses</div>
            <div className="text-lg font-bold text-red-500 dark:text-red-400 tabular-nums">
              ${clientFinancials.totalExpenses.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Hours</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              {clientFinancials.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}h
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Time Cost</div>
            <div className="text-lg font-bold text-orange-500 dark:text-orange-400 tabular-nums">
              ${clientFinancials.timeCost.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Profit</div>
            <div className={`text-lg font-bold tabular-nums ${clientFinancials.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              ${clientFinancials.profit.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Collection progress bar */}
        {clientFinancials.totalIncome > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
              <span>Collection progress</span>
              <span className="tabular-nums">
                {Math.round((clientFinancials.totalCollected / clientFinancials.totalIncome) * 100)}%
                <span className="text-zinc-300 font-normal ml-1">({clientFinancials.paidCount}/{clientFinancials.totalCount})</span>
              </span>
            </div>
            <div className="w-full bg-zinc-200/60 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, (clientFinancials.totalCollected / clientFinancials.totalIncome) * 100)}%` }}
              />
            </div>
            {clientFinancials.pendingAmount > 0 && (
              <div className="text-[10px] text-amber-500 font-medium mt-1">
                ${clientFinancials.pendingAmount.toLocaleString()} pending collection
              </div>
            )}
          </div>
        )}

        {/* ─── Add buttons (dashed, mutually exclusive with forms) ─── */}
        {!showNewIncomeForm && (
          <button
            onClick={() => onShowNewIncomeForm(true)}
            className="w-full p-3 mb-3 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <Icons.Plus size={13} />
            Add income
          </button>
        )}

        {/* Income entries */}
        {clientIncomes.length > 0 && (
          <div className="space-y-3 mb-3">
            {clientIncomes.map(income => {
              const installments = income.installments || [];
              const paidInst = installments.filter(i => i.status === 'paid');
              const isDeleting = deletingIncomeId === income.id;
              return (
                <div key={income.id} className={`bg-zinc-50 dark:bg-zinc-800/40 rounded-xl overflow-hidden transition-opacity ${isDeleting ? 'opacity-40' : ''}`}>
                  <div className="p-4 flex items-center justify-between group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{income.concept || 'Income'}</p>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          income.status === 'paid' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700'
                          : income.status === 'overdue' ? 'bg-red-100 dark:bg-red-500/20 text-red-600'
                          : income.status === 'partial' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                        }`}>
                          {income.status === 'paid' ? 'Paid' : income.status === 'overdue' ? 'Overdue' : income.status === 'partial' ? 'Partial' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {income.project_name && income.project_name !== 'General' ? `${income.project_name} · ` : ''}
                        {installments.length > 0 ? `${paidInst.length}/${installments.length} installments` : 'Single payment'}
                        {income.due_date ? ` · Due ${fmtShortDate(income.due_date)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{fmtMoney(income.total_amount)}</p>
                      <button
                        onClick={() => onDeleteIncome(income.id)}
                        disabled={isDeleting}
                        className="p-1.5 text-zinc-300 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete income"
                      >
                        <Icons.Trash size={13} />
                      </button>
                    </div>
                  </div>
                  {installments.length > 0 && (
                    <div className="border-t border-zinc-200/60 dark:border-zinc-700/40">
                      {installments.map(inst => {
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
                              onClick={() => onMarkInstallmentPaid(inst)}
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

        {/* ─── Inline Income Form ─── */}
        <AnimatePresence>
          {showNewIncomeForm && (
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
                  placeholder="Concept (e.g.: Web development, UX Design...)"
                  value={newIncomeData.concept}
                  onChange={e => onNewIncomeDataChange({ ...newIncomeData, concept: e.target.value })}
                  className={inputClass}
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Total amount *</label>
                    <input
                      type="number" placeholder="0.00" min="0" step="0.01"
                      value={newIncomeData.total_amount}
                      onChange={e => onNewIncomeDataChange({ ...newIncomeData, total_amount: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Currency</label>
                    <select
                      value={newIncomeData.currency}
                      onChange={e => onNewIncomeDataChange({ ...newIncomeData, currency: e.target.value })}
                      className={inputClass}
                    >
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Installments</label>
                    <input
                      type="number" min="1" max="24"
                      value={newIncomeData.num_installments}
                      onChange={e => {
                        const n = parseInt(e.target.value) || 1;
                        const base = newIncomeData.due_date ? new Date(newIncomeData.due_date + 'T12:00:00') : new Date();
                        const dates = Array.from({ length: n }, (_, i) => {
                          const d = new Date(base);
                          d.setMonth(d.getMonth() + i);
                          return d.toISOString().split('T')[0];
                        });
                        onNewIncomeDataChange({ ...newIncomeData, num_installments: e.target.value, installment_dates: dates });
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>First due date</label>
                    <input
                      type="date"
                      value={newIncomeData.due_date}
                      onChange={e => {
                        const n = parseInt(newIncomeData.num_installments) || 1;
                        const base = e.target.value ? new Date(e.target.value + 'T12:00:00') : new Date();
                        const dates = Array.from({ length: n }, (_, i) => {
                          const d = new Date(base);
                          d.setMonth(d.getMonth() + i);
                          return d.toISOString().split('T')[0];
                        });
                        onNewIncomeDataChange({ ...newIncomeData, due_date: e.target.value, installment_dates: dates });
                      }}
                      className={inputClass}
                    />
                  </div>
                </div>
                {/* Per-installment date editors */}
                {parseInt(newIncomeData.num_installments) > 1 && newIncomeData.installment_dates.length > 0 && (
                  <div className="space-y-1.5 p-3 bg-zinc-100/60 dark:bg-zinc-700/20 rounded-lg">
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Dates per installment</p>
                    {newIncomeData.installment_dates.map((date, idx) => {
                      const totalAmt = parseFloat(newIncomeData.total_amount) || 0;
                      const n = parseInt(newIncomeData.num_installments) || 1;
                      const perInst = Math.round((totalAmt / n) * 100) / 100;
                      const amt = idx === n - 1 ? Math.round((totalAmt - perInst * (n - 1)) * 100) / 100 : perInst;
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-zinc-500 w-14 shrink-0">Inst. {idx + 1}</span>
                          <input
                            type="date"
                            value={date}
                            onChange={e => {
                              const updated = [...newIncomeData.installment_dates];
                              updated[idx] = e.target.value;
                              onNewIncomeDataChange({ ...newIncomeData, installment_dates: updated });
                            }}
                            className={inputClass + ' flex-1'}
                          />
                          {totalAmt > 0 && (
                            <span className="text-[10px] text-zinc-400 w-20 text-right shrink-0">${amt.toLocaleString()}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Optional project link */}
                {availableProjects.filter(p => p.client_id === client?.id || !p.client_id).length > 0 && (
                  <div>
                    <label className={labelClass}>Project (optional)</label>
                    <select
                      value={newIncomeData.project_id}
                      onChange={e => onNewIncomeDataChange({ ...newIncomeData, project_id: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">No project</option>
                      {availableProjects
                        .filter(p => p.client_id === client?.id || !p.client_id)
                        .map(p => <option key={p.id} value={p.id}>{p.title}</option>)
                      }
                    </select>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onCreateIncome}
                    disabled={!newIncomeData.concept.trim() || !newIncomeData.total_amount || creatingIncome}
                    className="px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all flex items-center gap-2"
                  >
                    {creatingIncome ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Icons.Plus size={13} />
                    )}
                    {creatingIncome ? 'Creating...' : 'Create Income'}
                  </button>
                  <button
                    onClick={() => { onShowNewIncomeForm(false); onNewIncomeDataChange({ concept: '', total_amount: '', num_installments: '1', due_date: '', project_id: '', currency: 'USD', installment_dates: [] }); }}
                    className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Add Expense / Log Time buttons ─── */}
        <div className="flex gap-2 mb-3">
          {!showExpenseForm && (
            <button
              onClick={() => onShowExpenseForm(true)}
              className="flex-1 p-2.5 border border-dashed border-red-200 dark:border-red-800/40 rounded-xl text-xs font-medium text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-600 transition-colors flex items-center justify-center gap-1.5"
            >
              <Icons.Plus size={13} />
              Add expense
            </button>
          )}
          {!showTimeForm && (
            <button
              onClick={() => onShowTimeForm(true)}
              className="flex-1 p-2.5 border border-dashed border-blue-200 dark:border-blue-800/40 rounded-xl text-xs font-medium text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 hover:border-blue-300 dark:hover:border-blue-600 transition-colors flex items-center justify-center gap-1.5"
            >
              <Icons.Clock size={13} />
              Log time
            </button>
          )}
        </div>

        {/* ─── Inline Expense Form ─── */}
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

        {/* ─── Inline Time Entry Form ─── */}
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

      </div>

      {/* Empty state */}
      {clientIncomes.length === 0 && clientFinancials.totalExpenses === 0 && clientFinancials.totalHours === 0 && !showNewIncomeForm && !showExpenseForm && !showTimeForm && (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
            {Icons.DollarSign ? <Icons.DollarSign size={20} className="text-zinc-400" /> : <Icons.Activity size={20} className="text-zinc-400" />}
          </div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">No financial records</p>
          <p className="text-[10px] text-zinc-400 mt-1 max-w-xs mx-auto">
            Use the buttons above to add income, expenses, or log time for this client.
          </p>
        </div>
      )}
    </motion.div>
  );
};

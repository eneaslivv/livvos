import React from 'react';
import { motion } from 'framer-motion';
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
  clientFinanceSummary: {
    totalInvoiced: number;
    totalPaid: number;
    totalPending: number;
    paidCount: number;
    totalCount: number;
    overdue: number;
  };
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
}

export const ClientFinanceTab: React.FC<ClientFinanceTabProps> = ({
  client,
  clientIncomes,
  clientFinanceSummary,
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
}) => {
  return (
    <motion.div key="finance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      {/* New income form / toggle */}
      {showNewIncomeForm ? (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl mb-4 space-y-3">
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
                type="number"
                placeholder="0.00"
                min="0"
                step="0.01"
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
                type="number"
                min="1"
                max="24"
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
                    <span className="text-[10px] font-medium text-zinc-500 w-14 shrink-0">Installment {idx + 1}</span>
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
      ) : (
        <button
          onClick={() => onShowNewIncomeForm(true)}
          className="w-full p-3 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors mb-4 flex items-center justify-center gap-1.5"
        >
          <Icons.Plus size={13} />
          Add income
        </button>
      )}

      {clientIncomes.length > 0 ? (
        <div className="space-y-4">
          {/* Progress bar */}
          {clientFinanceSummary.totalInvoiced > 0 && (
            <div>
              <div className="flex justify-between text-[10px] mb-1.5">
                <span className="text-zinc-400 font-medium">Collection progress</span>
                <span className="font-semibold text-zinc-500">
                  {Math.round((clientFinanceSummary.totalPaid / clientFinanceSummary.totalInvoiced) * 100)}%
                  <span className="text-zinc-300 font-normal ml-1">({clientFinanceSummary.paidCount}/{clientFinanceSummary.totalCount})</span>
                </span>
              </div>
              <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round((clientFinanceSummary.totalPaid / clientFinanceSummary.totalInvoiced) * 100)}%` }}
                  transition={{ duration: 1, ease: 'circOut' }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </div>
            </div>
          )}

          {/* Income groups with installments */}
          {clientIncomes.map(income => {
            const installments = income.installments || [];
            const paidInst = installments.filter(i => i.status === 'paid');
            const isDeleting = deletingIncomeId === income.id;
            return (
              <div key={income.id} className={`bg-zinc-50 dark:bg-zinc-800/40 rounded-xl overflow-hidden transition-opacity ${isDeleting ? 'opacity-40' : ''}`}>
                {/* Income header */}
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

                {/* Installments */}
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
      ) : !showNewIncomeForm ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
            {Icons.DollarSign ? <Icons.DollarSign size={20} className="text-zinc-400" /> : <Icons.Activity size={20} className="text-zinc-400" />}
          </div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">No financial records</p>
          <p className="text-[10px] text-zinc-400 mt-1 max-w-xs mx-auto">
            Use the button above to add the first income for this client.
          </p>
        </div>
      ) : null}
    </motion.div>
  );
};

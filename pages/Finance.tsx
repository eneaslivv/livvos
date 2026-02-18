import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '../components/ui/Card';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  PieChart,
  CreditCard,
  FileText,
  Settings,
  Download,
  Plus,
  Eye,
  Edit,
  ArrowUpRight,
  ChevronRight,
  Activity,
  Calendar,
  X
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { useProjects } from '../context/ProjectsContext';
import { useRBAC } from '../context/RBACContext';

// Reusing Icons from the UI library if available, otherwise using lucide directly for consistent styling
const Icons = {
  Dollar: DollarSign,
  TrendUp: TrendingUp,
  TrendDown: TrendingDown,
  Alert: AlertTriangle,
  Target,
  Chart: PieChart,
  Card: CreditCard,
  Docs: FileText,
  Settings,
  Download,
  Plus,
  Eye,
  Edit,
  ArrowUpRight,
  ChevronRight,
  Activity,
  Calendar,
  X
};

interface FinancialMetric {
  id: string;
  title: string;
  value: string;
  change?: string;
  trend: 'up' | 'down' | 'stable';
  status: 'positive' | 'negative' | 'neutral';
}

interface ProjectFinancial {
  id: string;
  projectName: string;
  budget: number;
  collected: number;
  expenses: number;
  profit: number;
  health: 'profitable' | 'break-even' | 'loss';
  lastUpdated: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

export const Finance: React.FC = () => {
  const {
    finances,
    loading: financesLoading,
    createFinance,
  } = useFinance();

  const { projects, loading: projectsLoading } = useProjects();
  const { hasPermission } = useRBAC();

  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'reports' | 'settings'>('overview');
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entryData, setEntryData] = useState({
    projectId: '',
    totalAgreed: '',
    totalCollected: '',
    directExpenses: '',
    imputedExpenses: '',
    hoursWorked: '',
    businessModel: 'fixed'
  });
  const loading = financesLoading || projectsLoading;

  const projectNameById = useMemo(() => {
    return new Map(projects.map(project => [project.id, project.title]));
  }, [projects]);

  const projectData = useMemo<ProjectFinancial[]>(() => {
    return (finances || []).map(finance => {
      const expenses = (Number(finance.direct_expenses) || 0) + (Number(finance.imputed_expenses) || 0);
      const collected = Number(finance.total_collected) || 0;
      const profit = collected - expenses;
      const health = finance.health || (profit > 0 ? 'profitable' : profit === 0 ? 'break-even' : 'loss');
      const projectName = projectNameById.get(finance.project_id) || `Project ${finance.project_id}`;
      const lastUpdatedSource = finance.updated_at || finance.created_at;
      const lastUpdated = lastUpdatedSource ? new Date(lastUpdatedSource).toLocaleDateString() : new Date().toLocaleDateString();

      return {
        id: finance.project_id,
        projectName,
        budget: Number(finance.total_agreed) || 0,
        collected,
        expenses,
        profit,
        health: health as ProjectFinancial['health'],
        lastUpdated
      };
    });
  }, [finances, projectNameById]);

  const totals = useMemo(() => {
    return (finances || []).reduce(
      (acc, finance) => {
        const agreed = Number(finance.total_agreed) || 0;
        const collected = Number(finance.total_collected) || 0;
        const expenses = (Number(finance.direct_expenses) || 0) + (Number(finance.imputed_expenses) || 0);
        const marginValue = Number(finance.profit_margin);
        const margin = Number.isFinite(marginValue) ? marginValue : 0;

        acc.totalAgreed += agreed;
        acc.totalCollected += collected;
        acc.totalExpenses += expenses;
        acc.totalMargin += margin;
        acc.marginCount += Number.isFinite(marginValue) ? 1 : 0;
        return acc;
      },
      {
        totalAgreed: 0,
        totalCollected: 0,
        totalExpenses: 0,
        totalMargin: 0,
        marginCount: 0
      }
    );
  }, [finances]);

  const netProfit = totals.totalCollected - totals.totalExpenses;
  const profitMargin = totals.totalCollected > 0 ? (netProfit / totals.totalCollected) * 100 : 0;
  const targetMargin = totals.marginCount > 0 ? totals.totalMargin / totals.marginCount : 0;

  const metrics: FinancialMetric[] = useMemo(() => [
    {
      id: '1',
      title: 'Total Revenue',
      value: formatCurrency(totals.totalCollected),
      trend: 'up',
      status: 'positive'
    },
    {
      id: '2',
      title: 'Total Expenses',
      value: formatCurrency(totals.totalExpenses),
      trend: 'up',
      status: 'negative'
    },
    {
      id: '3',
      title: 'Net Profit',
      value: formatCurrency(netProfit),
      trend: netProfit >= 0 ? 'up' : 'down',
      status: netProfit >= 0 ? 'positive' : 'negative'
    },
    {
      id: '4',
      title: 'Profit Margin',
      value: formatPercent(profitMargin),
      trend: profitMargin >= 0 ? 'up' : 'down',
      status: profitMargin >= 0 ? 'positive' : 'negative'
    }
  ], [totals, netProfit, profitMargin]);

  const revenueVectors = useMemo(() => {
    const totalRevenue = totals.totalCollected;
    const sorted = [...projectData]
      .filter(item => item.collected > 0)
      .sort((a, b) => b.collected - a.collected)
      .slice(0, 3);
    const colors = ['emerald', 'blue', 'amber'];

    return sorted.map((item, index) => ({
      category: item.projectName,
      amount: item.collected,
      percentage: totalRevenue > 0 ? (item.collected / totalRevenue) * 100 : 0,
      color: colors[index % colors.length]
    }));
  }, [projectData, totals.totalCollected]);

  const openNewEntry = () => {
    setEntryData({
      projectId: projects[0]?.id || '',
      totalAgreed: '',
      totalCollected: '',
      directExpenses: '',
      imputedExpenses: '',
      hoursWorked: '',
      businessModel: 'fixed'
    });
    setEntryError(null);
    setIsEntryOpen(true);
  };

  const closeNewEntry = () => {
    setIsEntryOpen(false);
    setEntryError(null);
  };

  const handleEntryChange = (field: keyof typeof entryData, value: string) => {
    setEntryData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmitEntry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entryData.projectId) {
      setEntryError('Select a project to attach this entry.');
      return;
    }

    setIsSubmitting(true);
    setEntryError(null);

    try {
      await createFinance(entryData.projectId, {
        total_agreed: Number(entryData.totalAgreed) || 0,
        total_collected: Number(entryData.totalCollected) || 0,
        direct_expenses: Number(entryData.directExpenses) || 0,
        imputed_expenses: Number(entryData.imputedExpenses) || 0,
        hours_worked: Number(entryData.hoursWorked) || 0,
        business_model: entryData.businessModel as 'fixed' | 'hourly' | 'retainer'
      });
      closeNewEntry();
    } catch (error) {
      setEntryError(error instanceof Error ? error.message : 'Unable to save entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasPermission('finance', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-white dark:bg-zinc-900/50 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800">
        <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-6">
          <Icons.Card className="w-12 h-12 text-zinc-400" />
        </div>
        <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2 font-sans tracking-tight">Financial Center Access</h3>
        <p className="text-zinc-500 max-w-sm font-medium">You don't have the necessary level to access proprietary financial data.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-zinc-100 dark:border-zinc-800 pb-10">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-[0.2em] mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            Financial Intelligence
          </div>
          <h1 className="text-5xl font-extrabold text-zinc-900 dark:text-zinc-100 font-sans tracking-tightest">
            Finance <span className="text-zinc-400 dark:text-zinc-500 font-medium italic">&</span> Capital.
          </h1>
          <p className="text-zinc-500 font-medium max-w-md">Precision tracking for organizational capital, project margins, and fiscal performance.</p>
        </div>

        <div className="flex gap-3">
          {hasPermission('finance', 'create') && (
            <button
              onClick={openNewEntry}
              className="flex items-center gap-2.5 px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl font-bold shadow-xl shadow-zinc-900/10 dark:shadow-zinc-100/10 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <Icons.Plus size={18} strokeWidth={3} />
              <span>New Entry</span>
            </button>
          )}
          <button className="flex items-center gap-2.5 px-6 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all duration-300">
            <Icons.Download size={18} />
            <span>Generate Report</span>
          </button>
        </div>
      </div>

      {/* Navigation Subtitles */}
      <div className="flex overflow-x-auto no-scrollbar gap-1 p-1 bg-zinc-100/50 dark:bg-zinc-900/50 rounded-2xl w-fit border border-zinc-200/50 dark:border-zinc-800/50">
        {[
          { id: 'overview', label: 'Dashboard', icon: Icons.Chart },
          { id: 'projects', label: 'Project P&L', icon: Icons.Target },
          { id: 'reports', label: 'Archived Reports', icon: Icons.Docs },
          { id: 'settings', label: 'Configuration', icon: Icons.Settings }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`
              flex items-center gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 font-bold text-sm
              ${activeTab === tab.id
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200 dark:border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }
            `}
          >
            <tab.icon size={16} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-12 animate-in slide-in-from-bottom-2 duration-700">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {metrics.map(metric => (
              <div key={metric.id} className="group relative p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 hover:shadow-2xl hover:shadow-zinc-200/50 dark:hover:shadow-black/50 transition-all duration-500 overflow-hidden">
                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/80 rounded-2xl border border-zinc-100 dark:border-zinc-700/50 group-hover:scale-110 transition-transform duration-500">
                      <Icons.Dollar className="text-zinc-600 dark:text-zinc-300" size={24} />
                    </div>
                    {metric.change && (
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${metric.status === 'positive' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                        'bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
                        }`}>
                        {metric.change}
                        {metric.trend === 'up' ? <Icons.TrendUp size={10} strokeWidth={3} /> : <Icons.TrendDown size={10} strokeWidth={3} />}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1">{metric.title}</p>
                    <p className="text-4xl font-black text-zinc-900 dark:text-zinc-100 font-sans tracking-tight">{metric.value}</p>
                  </div>
                </div>
                {/* Background Accent */}
                <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-zinc-50 dark:bg-zinc-800/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              </div>
            ))}
          </div>

          {/* Breakdown Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 p-10 bg-white dark:bg-zinc-900 rounded-[3rem] border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-10">
                <h3 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Revenue Vectors</h3>
                <div className="flex gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 uppercase tracking-widest px-3 py-1 bg-zinc-50 dark:bg-zinc-800 rounded-full">LIVE</span>
                </div>
              </div>

              <div className="space-y-8">
                {revenueVectors.length === 0 && !loading && (
                  <div className="text-sm font-bold text-zinc-400 uppercase tracking-widest">No revenue data yet.</div>
                )}
                {revenueVectors.map((item, index) => (
                  <div key={index} className="space-y-3 group cursor-default">
                    <div className="flex justify-between items-end">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full bg-${item.color}-500 group-hover:scale-150 transition-transform duration-500 shadow-[0_0_12px_rgba(var(--${item.color}-rgb),0.5)]`}></div>
                        <span className="text-sm font-bold text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors uppercase tracking-tight">{item.category}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight block">{formatCurrency(item.amount)}</span>
                      </div>
                    </div>
                    <div className="h-4 w-full bg-zinc-50 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-zinc-100 dark:border-zinc-700/50">
                      <div
                        className={`h-full bg-zinc-900 dark:bg-zinc-100 rounded-full transition-all duration-1000 ease-out`}
                        style={{ width: `${item.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-10 bg-zinc-900 dark:bg-zinc-100 rounded-[3rem] text-white dark:text-zinc-900 shadow-2xl relative overflow-hidden group">
              <div className="relative z-10 flex flex-col justify-between h-full">
                <div>
                  <Icons.Target className="text-zinc-400 dark:text-zinc-500 mb-6" size={40} strokeWidth={2.5} />
                  <h3 className="text-3xl font-black tracking-tightest leading-none mb-6">Efficiency Quotient</h3>
                  <p className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-[0.15em] text-xs">Target Margin: <span className="text-white dark:text-zinc-900">{formatPercent(targetMargin)}</span></p>
                </div>

                <div className="mt-20">
                  <div className="text-7xl font-black tracking-tightest mb-4">{formatPercent(profitMargin)}</div>
                  <div className="flex items-center gap-2 text-rose-400 dark:text-rose-600 font-black text-sm uppercase tracking-widest group-hover:translate-x-4 transition-transform duration-500">
                    Optimize Ops <Icons.ArrowUpRight size={16} strokeWidth={3} />
                  </div>
                </div>
              </div>
              {/* Decorative Element */}
              <div className="absolute top-10 right-10 opacity-10 group-hover:scale-150 transition-transform duration-1000">
                <Icons.Chart size={200} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="animate-in slide-in-from-bottom-2 duration-700">
          <div className="bg-white dark:bg-zinc-900 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xl shadow-zinc-200/20 dark:shadow-none">
            <div className="px-10 py-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Active Accounts Master List</h3>
              <div className="flex gap-2">
                <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 flex items-center gap-2">
                  <Icons.Activity size={14} className="text-zinc-400" />
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{projectData.length} Projects</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-zinc-50/50 dark:bg-zinc-800/30">
                    <th className="px-10 py-5 text-left text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800">Account</th>
                    <th className="px-6 py-5 text-left text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800">Budgeted</th>
                    <th className="px-6 py-5 text-left text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800">Realized</th>
                    <th className="px-6 py-5 text-left text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800">Net Delta</th>
                    <th className="px-6 py-5 text-left text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800">Health Index</th>
                    <th className="px-10 py-5 text-right text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800">Matrix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
                  {projectData.map(project => (
                    <tr key={project.id} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-all duration-300">
                      <td className="px-10 py-6 whitespace-nowrap">
                        <div className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-tight mb-1 group-hover:translate-x-2 transition-transform duration-300">{project.projectName}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                          <Icons.Calendar size={10} />
                          Sync: {project.lastUpdated}
                        </div>
                      </td>
                      <td className="px-6 py-6 whitespace-nowrap text-sm font-bold text-zinc-700 dark:text-zinc-300">
                        ${project.budget.toLocaleString()}
                      </td>
                      <td className="px-6 py-6 whitespace-nowrap text-sm font-black text-zinc-900 dark:text-zinc-100">
                        ${project.collected.toLocaleString()}
                      </td>
                      <td className="px-6 py-6 whitespace-nowrap text-sm font-black text-zinc-900 dark:text-zinc-100">
                        <span className={project.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                          {project.profit >= 0 ? '+' : ''}${project.profit.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-6 whitespace-nowrap">
                        <div className={`
                                            inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border
                                            ${project.health === 'profitable' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                            'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'}
                                        `}>
                          {project.health.replace('-', ' ')}
                        </div>
                      </td>
                      <td className="px-10 py-6 whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <button className="p-2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                            <Icons.Eye size={16} />
                          </button>
                          <button className="p-2 bg-zinc-900 dark:bg-zinc-100 rounded-xl text-white dark:text-zinc-900 hover:opacity-90 transition-opacity shadow-lg shadow-zinc-900/10">
                            <Icons.Edit size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && (
                <div className="flex flex-col items-center justify-center p-20 gap-4">
                  <div className="w-12 h-12 border-4 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin"></div>
                  <p className="text-zinc-400 text-xs font-black uppercase tracking-widest animate-pulse">Computing Matrix...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-6 animate-in fade-in duration-700">
          <div className="bg-white dark:bg-zinc-900/50 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-tight">Financial Summary</h3>
              <button
                onClick={() => {
                  const headers = ['Project', 'Budget', 'Collected', 'Expenses', 'Profit', 'Health'];
                  const rows = projectData.map(p => [p.projectName, p.budget, p.collected, p.expenses, p.profit, p.health]);
                  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `finance-report-${new Date().toISOString().split('T')[0]}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                ↓ Export CSV
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                <div className="text-xs text-zinc-500 mb-1">Total Revenue</div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{formatCurrency(totals.totalCollected)}</div>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                <div className="text-xs text-zinc-500 mb-1">Total Expenses</div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{formatCurrency(totals.totalExpenses)}</div>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                <div className="text-xs text-zinc-500 mb-1">Net Profit</div>
                <div className={`text-lg font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(netProfit)}</div>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                <div className="text-xs text-zinc-500 mb-1">Avg. Margin</div>
                <div className={`text-lg font-bold ${profitMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatPercent(profitMargin)}</div>
              </div>
            </div>
            {projectData.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No financial records yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Project</th>
                      <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Budget</th>
                      <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Collected</th>
                      <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Expenses</th>
                      <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Profit</th>
                      <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectData.map(p => (
                      <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">{p.projectName}</td>
                        <td className="py-3 px-4 text-right text-zinc-600 dark:text-zinc-400">{formatCurrency(p.budget)}</td>
                        <td className="py-3 px-4 text-right text-zinc-600 dark:text-zinc-400">{formatCurrency(p.collected)}</td>
                        <td className="py-3 px-4 text-right text-zinc-600 dark:text-zinc-400">{formatCurrency(p.expenses)}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${p.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(p.profit)}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold uppercase ${p.health === 'profitable' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : p.health === 'break-even' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>{p.health}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="animate-in fade-in duration-700">
          <div className="bg-white dark:bg-zinc-900/50 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 p-8">
            <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100 mb-6 uppercase tracking-tight">Finance Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Default Currency</div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">USD ($)</div>
                <p className="text-xs text-zinc-500 mt-1">All financial entries use this currency.</p>
              </div>
              <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Active Projects</div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{projectData.length}</div>
                <p className="text-xs text-zinc-500 mt-1">Projects with financial records.</p>
              </div>
              <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Business Model</div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Fixed + Hourly</div>
                <p className="text-xs text-zinc-500 mt-1">Supports both pricing models per project.</p>
              </div>
              <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Target Margin</div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{formatPercent(targetMargin)}</div>
                <p className="text-xs text-zinc-500 mt-1">Average target profit margin across projects.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEntryOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6" onClick={closeNewEntry}>
            <div
              className="w-full max-w-2xl bg-white dark:bg-zinc-950 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-2xl p-8 animate-in zoom-in-95 duration-200"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-400">Finance Entry</p>
                  <h3 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">New Financial Record</h3>
                </div>
                <button
                  onClick={closeNewEntry}
                  className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  <Icons.X size={20} />
                </button>
              </div>

              <form className="space-y-6" onSubmit={handleSubmitEntry}>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Project</label>
                  <select
                    value={entryData.projectId}
                    onChange={(event) => handleEntryChange('projectId', event.target.value)}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                  >
                    {projects.length === 0 && <option value="">No projects available</option>}
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Total Agreed</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={entryData.totalAgreed}
                      onChange={(event) => handleEntryChange('totalAgreed', event.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Total Collected</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={entryData.totalCollected}
                      onChange={(event) => handleEntryChange('totalCollected', event.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Direct Expenses</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={entryData.directExpenses}
                      onChange={(event) => handleEntryChange('directExpenses', event.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Imputed Expenses</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={entryData.imputedExpenses}
                      onChange={(event) => handleEntryChange('imputedExpenses', event.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Hours Worked</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={entryData.hoursWorked}
                      onChange={(event) => handleEntryChange('hoursWorked', event.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Business Model</label>
                    <select
                      value={entryData.businessModel}
                      onChange={(event) => handleEntryChange('businessModel', event.target.value)}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="hourly">Hourly</option>
                      <option value="retainer">Retainer</option>
                    </select>
                  </div>
                </div>

                {entryError && (
                  <div className="text-sm font-semibold text-rose-500 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl px-4 py-3">
                    {entryError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeNewEntry}
                    className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-bold shadow-lg shadow-zinc-900/15 dark:shadow-zinc-100/10 hover:opacity-90 disabled:opacity-60"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Entry'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Finance;

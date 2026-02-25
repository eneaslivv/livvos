import React, { useState, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { SlidePanel } from '../components/ui/SlidePanel';
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
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg mb-4">
          <Icons.Card className="w-8 h-8 text-zinc-400" />
        </div>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Financial Center Access</h3>
        <p className="text-zinc-400 text-xs max-w-xs">You don't have the necessary level to access proprietary financial data.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-16">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800/60">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-semibold uppercase tracking-[0.15em] mb-2">
            <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
            Financial Intelligence
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Finance <span className="text-zinc-300 dark:text-zinc-600 font-light">&</span> Capital
          </h1>
          <p className="text-zinc-400 text-xs max-w-sm">Precision tracking for organizational capital, project margins, and fiscal performance.</p>
        </div>

        <div className="flex gap-2">
          {hasPermission('finance', 'create') && (
            <button
              onClick={openNewEntry}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition-all duration-200"
            >
              <Icons.Plus size={14} strokeWidth={2.5} />
              <span>New Entry</span>
            </button>
          )}
          <button className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-lg text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all duration-200">
            <Icons.Download size={14} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto no-scrollbar gap-0.5 p-0.5 bg-zinc-100/60 dark:bg-zinc-900/60 rounded-lg w-fit">
        {[
          { id: 'overview', label: 'Dashboard', icon: Icons.Chart },
          { id: 'projects', label: 'Project P&L', icon: Icons.Target },
          { id: 'reports', label: 'Reports', icon: Icons.Docs },
          { id: 'settings', label: 'Configuration', icon: Icons.Settings }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-200 font-medium text-xs
              ${activeTab === tab.id
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }
            `}
          >
            <tab.icon size={13} strokeWidth={activeTab === tab.id ? 2 : 1.5} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-5 animate-in slide-in-from-bottom-2 duration-500">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.map(metric => (
              <div key={metric.id} className="group relative p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 hover:border-zinc-200 dark:hover:border-zinc-700 hover:shadow-sm transition-all duration-300">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg">
                    <Icons.Dollar className="text-zinc-400 dark:text-zinc-500" size={14} />
                  </div>
                  <p className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider">{metric.title}</p>
                  {metric.change && (
                    <div className={`ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${metric.status === 'positive' ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10' :
                      'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10'
                      }`}>
                      {metric.change}
                      {metric.trend === 'up' ? <Icons.TrendUp size={8} /> : <Icons.TrendDown size={8} />}
                    </div>
                  )}
                </div>
                <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{metric.value}</p>
              </div>
            ))}
          </div>

          {/* Breakdown Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 p-5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Revenue Vectors</h3>
                <span className="flex items-center gap-1 text-[9px] font-medium text-zinc-400 uppercase tracking-wider px-2 py-0.5 bg-zinc-50 dark:bg-zinc-800/60 rounded">Live</span>
              </div>

              <div className="space-y-4">
                {revenueVectors.length === 0 && !loading && (
                  <div className="text-xs text-zinc-400">No revenue data yet.</div>
                )}
                {revenueVectors.map((item, index) => (
                  <div key={index} className="space-y-1.5 group cursor-default">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full bg-${item.color}-500`}></div>
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{item.category}</span>
                      </div>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{formatCurrency(item.amount)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-zinc-800 dark:bg-zinc-300 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${item.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 bg-zinc-900 dark:bg-zinc-100 rounded-xl text-white dark:text-zinc-900 relative overflow-hidden group">
              <div className="relative z-10 flex flex-col justify-between h-full min-h-[180px]">
                <div>
                  <Icons.Target className="text-zinc-500 dark:text-zinc-400 mb-3" size={20} />
                  <h3 className="text-base font-semibold tracking-tight leading-tight mb-1.5">Efficiency Quotient</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-[10px] font-medium uppercase tracking-wider">Target: <span className="text-zinc-300 dark:text-zinc-600">{formatPercent(targetMargin)}</span></p>
                </div>

                <div className="mt-6">
                  <div className="text-3xl font-semibold tracking-tight mb-1.5">{formatPercent(profitMargin)}</div>
                  <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 text-[10px] font-medium uppercase tracking-wider group-hover:text-zinc-300 dark:group-hover:text-zinc-600 transition-colors duration-300">
                    Optimize <Icons.ArrowUpRight size={10} />
                  </div>
                </div>
              </div>
              <div className="absolute top-4 right-4 opacity-[0.06]">
                <Icons.Chart size={100} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="animate-in slide-in-from-bottom-2 duration-500">
          <div className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800/60 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Active Accounts</h3>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-50 dark:bg-zinc-800/60 rounded-md">
                <Icons.Activity size={11} className="text-zinc-400" />
                <span className="text-[10px] font-medium text-zinc-500">{projectData.length} projects</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-zinc-50/50 dark:bg-zinc-800/20">
                    <th className="px-5 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Account</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Budgeted</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Realized</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Net Delta</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Health</th>
                    <th className="px-5 py-2.5 text-right text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/40">
                  {projectData.map(project => (
                    <tr key={project.id} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors duration-200">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">{project.projectName}</div>
                        <div className="flex items-center gap-1 text-[9px] text-zinc-400">
                          <Icons.Calendar size={8} />
                          {project.lastUpdated}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                        ${project.budget.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-zinc-900 dark:text-zinc-100">
                        ${project.collected.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">
                        <span className={project.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {project.profit >= 0 ? '+' : ''}${project.profit.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide
                          ${project.health === 'profitable' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                            'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'}
                        `}>
                          {project.health.replace('-', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                            <Icons.Eye size={13} />
                          </button>
                          <button className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                            <Icons.Edit size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && (
                <div className="flex flex-col items-center justify-center p-10 gap-2">
                  <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin"></div>
                  <p className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider">Loading...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-4 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Financial Summary</h3>
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
                className="px-2.5 py-1 text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Export CSV
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] text-zinc-400 mb-0.5">Total Revenue</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatCurrency(totals.totalCollected)}</div>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] text-zinc-400 mb-0.5">Total Expenses</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatCurrency(totals.totalExpenses)}</div>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] text-zinc-400 mb-0.5">Net Profit</div>
                <div className={`text-sm font-semibold ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatCurrency(netProfit)}</div>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] text-zinc-400 mb-0.5">Avg. Margin</div>
                <div className={`text-sm font-semibold ${profitMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatPercent(profitMargin)}</div>
              </div>
            </div>
            {projectData.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">No financial records yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[550px] text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
                      <th className="text-left py-2 px-3 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Project</th>
                      <th className="text-right py-2 px-3 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Budget</th>
                      <th className="text-right py-2 px-3 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Collected</th>
                      <th className="text-right py-2 px-3 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Expenses</th>
                      <th className="text-right py-2 px-3 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Profit</th>
                      <th className="text-right py-2 px-3 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectData.map(p => (
                      <tr key={p.id} className="border-b border-zinc-50 dark:border-zinc-800/30 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-zinc-100">{p.projectName}</td>
                        <td className="py-2.5 px-3 text-right text-zinc-500 dark:text-zinc-400">{formatCurrency(p.budget)}</td>
                        <td className="py-2.5 px-3 text-right text-zinc-500 dark:text-zinc-400">{formatCurrency(p.collected)}</td>
                        <td className="py-2.5 px-3 text-right text-zinc-500 dark:text-zinc-400">{formatCurrency(p.expenses)}</td>
                        <td className={`py-2.5 px-3 text-right font-medium ${p.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatCurrency(p.profit)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${p.health === 'profitable' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : p.health === 'break-even' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'}`}>{p.health}</span>
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
        <div className="animate-in fade-in duration-500">
          <div className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Default Currency</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">USD ($)</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">All financial entries use this currency.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Active Projects</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{projectData.length}</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">Projects with financial records.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Business Model</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Fixed + Hourly</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">Supports both pricing models per project.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Target Margin</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatPercent(targetMargin)}</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">Average target profit margin across projects.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <SlidePanel
        isOpen={isEntryOpen}
        onClose={closeNewEntry}
        title="New Financial Record"
        subtitle="Finance Entry"
        width="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeNewEntry}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const form = document.getElementById('finance-entry-form') as HTMLFormElement;
                form?.requestSubmit();
              }}
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {isSubmitting ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        }
      >
        <form id="finance-entry-form" className="p-5 space-y-4" onSubmit={handleSubmitEntry}>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Project</label>
            <select
              value={entryData.projectId}
              onChange={(event) => handleEntryChange('projectId', event.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100"
            >
              {projects.length === 0 && <option value="">No projects available</option>}
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Total Agreed</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={entryData.totalAgreed}
                onChange={(event) => handleEntryChange('totalAgreed', event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Total Collected</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={entryData.totalCollected}
                onChange={(event) => handleEntryChange('totalCollected', event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Direct Expenses</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={entryData.directExpenses}
                onChange={(event) => handleEntryChange('directExpenses', event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Imputed Expenses</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={entryData.imputedExpenses}
                onChange={(event) => handleEntryChange('imputedExpenses', event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Hours Worked</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={entryData.hoursWorked}
                onChange={(event) => handleEntryChange('hoursWorked', event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Business Model</label>
              <select
                value={entryData.businessModel}
                onChange={(event) => handleEntryChange('businessModel', event.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100"
              >
                <option value="fixed">Fixed</option>
                <option value="hourly">Hourly</option>
                <option value="retainer">Retainer</option>
              </select>
            </div>
          </div>

          {entryError && (
            <div className="text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {entryError}
            </div>
          )}
        </form>
      </SlidePanel>
    </div>
  );
};

export default Finance;

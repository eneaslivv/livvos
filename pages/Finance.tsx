import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Target, PieChart, CreditCard, FileText, Settings, Download, Plus, Eye, Edit } from 'lucide-react';
import { useFinanceContext } from '../context/FinanceContext';
import { useRBACContext } from '../context/RBACContext';

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

interface FinancialReport {
  id: string;
  name: string;
  type: 'monthly' | 'quarterly' | 'yearly';
  generatedDate: string;
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  margin: number;
}

export const Finance: React.FC = () => {
  const { 
    projectFinancials,
    financialSummaries,
    createFinanceRecord,
    updateFinanceRecord,
    getProjectFinancialSummary
  } = useFinanceContext();

  const { hasPermission } = useRBACContext();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'reports' | 'settings'>('overview');
  const [loading, setLoading] = useState(true);
  const [projectData, setProjectData] = useState<ProjectFinancial[]>([]);
  const [reports, setReports] = useState<FinancialReport[]>([]);

  useEffect(() => {
    const loadFinancialData = async () => {
      try {
        setLoading(true);
        
        // Load project financials
        const projects = await Promise.all(
          (projectFinancials || []).map(async (project: any) => {
            const summary = await getProjectFinancialSummary(project.project_id);
            return {
              id: project.project_id,
              projectName: project.name || `Project ${project.project_id}`,
              budget: summary.total_agreed || 0,
              collected: summary.total_collected || 0,
              expenses: (summary.direct_expenses || 0) + (summary.imputed_expenses || 0),
              profit: 0,
              health: 'profitable' as const,
              lastUpdated: new Date().toLocaleDateString()
            };
          })
        );
        
        // Calculate profit for each project
        projects.forEach(project => {
          project.profit = project.collected - project.expenses;
          if (project.profit > 0) project.health = 'profitable';
          else if (project.profit === 0) project.health = 'break-even';
          else project.health = 'loss';
        });
        
        setProjectData(projects);

        // Mock reports data
        setReports([
          {
            id: '1',
            name: 'Monthly Report - January 2026',
            type: 'monthly',
            generatedDate: '2026-01-20',
            totalRevenue: 150000,
            totalExpenses: 95000,
            profit: 55000,
            margin: 36.7
          },
          {
            id: '2',
            name: 'Quarterly Report - Q4 2025',
            type: 'quarterly',
            generatedDate: '2025-12-31',
            totalRevenue: 450000,
            totalExpenses: 285000,
            profit: 165000,
            margin: 36.7
          }
        ]);

      } catch (error) {
        console.error('Failed to load financial data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [projectFinancials]);

  const metrics: FinancialMetric[] = [
    {
      id: '1',
      title: 'Total Revenue',
      value: '$150,000',
      change: '+12.5%',
      trend: 'up',
      status: 'positive'
    },
    {
      id: '2',
      title: 'Total Expenses',
      value: '$95,000',
      change: '+8.2%',
      trend: 'up',
      status: 'negative'
    },
    {
      id: '3',
      title: 'Net Profit',
      value: '$55,000',
      change: '+18.7%',
      trend: 'up',
      status: 'positive'
    },
    {
      id: '4',
      title: 'Profit Margin',
      value: '36.7%',
      change: '+2.1%',
      trend: 'up',
      status: 'positive'
    }
  ];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4" />;
      case 'down': return <TrendingDown className="w-4 h-4" />;
      default: return <div className="w-4 h-4" />;
    }
  };

  const getStatusColor = (health: string) => {
    switch (health) {
      case 'profitable': return 'text-green-600 bg-green-50';
      case 'break-even': return 'text-yellow-600 bg-yellow-50';
      case 'loss': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (!hasPermission('finance', 'view')) {
    return (
      <div className="p-6">
        <Card>
          <div className="text-center py-8">
            <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-600">You don't have permission to access financial data.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Center</h1>
          <p className="text-gray-600">Track revenue, expenses, and profitability across all projects</p>
        </div>
        <div className="flex space-x-2">
          {hasPermission('finance', 'create') && (
            <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" />
              <span>New Transaction</span>
            </button>
          )}
          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 border-b border-gray-200">
        {[
          { id: 'overview', label: 'Overview', icon: DollarSign },
          { id: 'projects', label: 'Projects', icon: Target },
          { id: 'reports', label: 'Reports', icon: FileText },
          { id: 'settings', label: 'Settings', icon: Settings }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center space-x-2 px-4 py-2 border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Financial Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map(metric => (
              <Card key={metric.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{metric.title}</p>
                    <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                    {metric.change && (
                      <div className={`flex items-center space-x-1 text-sm ${
                        metric.status === 'positive' ? 'text-green-600' : 
                        metric.status === 'negative' ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {getTrendIcon(metric.trend)}
                        <span>{metric.change}</span>
                      </div>
                    )}
                  </div>
                  <DollarSign className="w-8 h-8 text-blue-500" />
                </div>
              </Card>
            ))}
          </div>

          {/* Profit/Loss Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Breakdown</h3>
                <div className="space-y-3">
                  {[
                    { category: 'Design Services', amount: 75000, percentage: 50 },
                    { category: 'Development', amount: 60000, percentage: 40 },
                    { category: 'Consulting', amount: 15000, percentage: 10 }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{item.category}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">${item.amount.toLocaleString()}</span>
                        <span className="text-xs text-gray-500">({item.percentage}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Categories</h3>
                <div className="space-y-3">
                  {[
                    { category: 'Direct Costs', amount: 55000, percentage: 57.9 },
                    { category: 'Operating Costs', amount: 25000, percentage: 26.3 },
                    { category: 'Administrative', amount: 15000, percentage: 15.8 }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{item.category}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">${item.amount.toLocaleString()}</span>
                        <span className="text-xs text-gray-500">({item.percentage}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Projects Tab */}
      {activeTab === 'projects' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Project Financials</h3>
                <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  View All Projects
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Budget
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Collected
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expenses
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Profit
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Health
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {projectData.map(project => (
                      <tr key={project.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{project.projectName}</div>
                          <div className="text-xs text-gray-500">{project.lastUpdated}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${project.budget.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${project.collected.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${project.expenses.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`font-medium ${
                            project.profit >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            ${project.profit.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(project.health)}`}>
                            {project.health.charAt(0).toUpperCase() + project.health.slice(1).replace('-', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex space-x-2">
                            {hasPermission('finance', 'view') && (
                              <button className="text-blue-600 hover:text-blue-900">
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            {hasPermission('finance', 'edit') && (
                              <button className="text-gray-600 hover:text-gray-900">
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Financial Reports</h3>
                {hasPermission('finance', 'create') && (
                  <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <FileText className="w-4 h-4" />
                    <span>Generate Report</span>
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reports.map(report => (
                  <div key={report.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-gray-900 mb-1">{report.name}</h4>
                        <p className="text-xs text-gray-500 mb-3">Generated: {report.generatedDate}</p>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Revenue:</span>
                            <span className="font-medium">${report.totalRevenue.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Expenses:</span>
                            <span className="font-medium">${report.totalExpenses.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Profit:</span>
                            <span className="font-medium text-green-600">${report.profit.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Margin:</span>
                            <span className="font-medium">{report.margin}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="ml-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          report.type === 'monthly' ? 'bg-blue-100 text-blue-800' :
                          report.type === 'quarterly' ? 'bg-purple-100 text-purple-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {report.type.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex space-x-2">
                      <button className="flex items-center space-x-1 px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                        <Eye className="w-3 h-3" />
                        <span>View</span>
                      </button>
                      <button className="flex items-center space-x-1 px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Settings</h3>
              <div className="space-y-6">
                {[
                  {
                    title: 'Currency Settings',
                    description: 'Configure default currency and exchange rates',
                    setting: 'USD ($)'
                  },
                  {
                    title: 'Fiscal Year',
                    description: 'Define your organization\'s fiscal year',
                    setting: 'January - December'
                  },
                  {
                    title: 'Tax Configuration',
                    description: 'Set up tax rates and calculations',
                    setting: 'Not configured'
                  },
                  {
                    title: 'Payment Terms',
                    description: 'Default payment terms for new projects',
                    setting: 'Net 30 days'
                  }
                ].map((setting, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{setting.title}</h4>
                      <p className="text-sm text-gray-600">{setting.description}</p>
                    </div>
                    <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                      {setting.setting}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
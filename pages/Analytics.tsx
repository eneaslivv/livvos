import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { BarChart3, TrendingUp, Users, Target, Eye, MousePointer, Clock, AlertCircle, Download, Filter, Calendar, RefreshCw } from 'lucide-react';
import { useAnalyticsContext } from '../context/AnalyticsContext';
import { useRBACContext } from '../context/RBACContext';

interface AnalyticsMetric {
  id: string;
  title: string;
  value: string | number;
  change?: string;
  trend: 'up' | 'down' | 'stable';
  status: 'positive' | 'negative' | 'neutral';
  icon: React.ElementType;
}

interface KPIData {
  id: string;
  name: string;
  value: number;
  target: number;
  change: number;
  status: 'on-track' | 'at-risk' | 'behind';
  description: string;
}

interface WebAnalyticsData {
  date: string;
  visits: number;
  uniqueVisitors: number;
  pageViews: number;
  bounceRate: number;
  conversionRate: number;
}

interface ConversionData {
  source: string;
  leads: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
}

export const Analytics: React.FC = () => {
  const { 
    webAnalytics,
    kpiMetrics,
    conversionMetrics,
    getWebAnalytics,
    getKPIMetrics,
    getConversionMetrics
  } = useAnalyticsContext();

  const { hasPermission } = useRBACContext();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'web' | 'conversions' | 'kpis'>('overview');
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');
  const [analyticsData, setAnalyticsData] = useState<WebAnalyticsData[]>([]);
  const [kpiData, setKPIData] = useState<KPIData[]>([]);
  const [conversionData, setConversionData] = useState<ConversionData[]>([]);

  useEffect(() => {
    const loadAnalyticsData = async () => {
      try {
        setLoading(true);
        
        // Load web analytics
        const webData = await getWebAnalytics(dateRange);
        setAnalyticsData(webData || []);

        // Load KPI metrics
        const kpis = await getKPIMetrics();
        setKPIData(kpis || []);

        // Load conversion data
        const conversions = await getConversionMetrics();
        setConversionData(conversions || []);

      } catch (error) {
        console.error('Failed to load analytics data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAnalyticsData();
  }, [dateRange]);

  const metrics: AnalyticsMetric[] = [
    {
      id: '1',
      title: 'Total Visits',
      value: '24,567',
      change: '+15.3%',
      trend: 'up',
      status: 'positive',
      icon: Eye
    },
    {
      id: '2',
      title: 'Conversion Rate',
      value: '3.2%',
      change: '+0.8%',
      trend: 'up',
      status: 'positive',
      icon: Target
    },
    {
      id: '3',
      title: 'Active Users',
      value: '8,234',
      change: '+5.1%',
      trend: 'up',
      status: 'positive',
      icon: Users
    },
    {
      id: '4',
      title: 'Avg. Session Time',
      value: '4m 23s',
      change: '-0:12',
      trend: 'down',
      status: 'negative',
      icon: Clock
    }
  ];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4" />;
      case 'down': return <TrendingUp className="w-4 h-4 rotate-180" />;
      default: return <div className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on-track': return 'text-green-600 bg-green-50';
      case 'at-risk': return 'text-yellow-600 bg-yellow-50';
      case 'behind': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (!hasPermission('analytics', 'view')) {
    return (
      <div className="p-6">
        <Card>
          <div className="text-center py-8">
            <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-600">You don't have permission to access analytics data.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600">Monitor performance metrics and KPIs across your platform</p>
        </div>
        <div className="flex items-center space-x-3">
          <select 
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 border-b border-gray-200">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'web', label: 'Web Analytics', icon: Eye },
          { id: 'conversions', label: 'Conversions', icon: Target },
          { id: 'kpis', label: 'KPIs', icon: TrendingUp }
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
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map(metric => {
              const Icon = metric.icon;
              return (
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
                    <Icon className="w-8 h-8 text-blue-500" />
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Traffic Overview</h3>
                <div className="space-y-3">
                  {[
                    { metric: 'Page Views', value: '125,432', change: '+12.3%' },
                    { metric: 'Unique Visitors', value: '45,678', change: '+8.7%' },
                    { metric: 'Bounce Rate', value: '42.1%', change: '-2.4%' }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{item.metric}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">{item.value}</span>
                        <span className={`text-xs ${
                          item.change.startsWith('+') ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {item.change}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Pages</h3>
                <div className="space-y-3">
                  {[
                    { page: '/projects', views: 8542, percentage: 28.3 },
                    { page: '/dashboard', views: 6231, percentage: 20.6 },
                    { page: '/sales', views: 4521, percentage: 15.0 },
                    { page: '/team', views: 3456, percentage: 11.4 }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{item.page}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">{item.views.toLocaleString()}</span>
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

      {/* Web Analytics Tab */}
      {activeTab === 'web' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Web Analytics</h3>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Last {dateRange}</span>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Visits
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Unique Visitors
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Page Views
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Bounce Rate
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Conversion Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {analyticsData.slice(0, 10).map((day, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {day.date}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {day.visits.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {day.uniqueVisitors.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {day.pageViews.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`font-medium ${
                            day.bounceRate > 50 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {day.bounceRate}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`font-medium ${
                            day.conversionRate > 3 ? 'text-green-600' : 'text-yellow-600'
                          }`}>
                            {day.conversionRate}%
                          </span>
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

      {/* Conversions Tab */}
      {activeTab === 'conversions' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Conversion Tracking</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    title: 'Lead Sources',
                    data: [
                      { source: 'Organic Search', leads: 342, conversions: 89, rate: 26.0 },
                      { source: 'Direct', leads: 256, conversions: 67, rate: 26.2 },
                      { source: 'Social Media', leads: 198, conversions: 45, rate: 22.7 },
                      { source: 'Referral', leads: 145, conversions: 38, rate: 26.2 }
                    ]
                  },
                  {
                    title: 'Conversion Funnel',
                    data: [
                      { stage: 'Visitors', count: 24567, rate: 100 },
                      { stage: 'Leads', count: 1234, rate: 5.0 },
                      { stage: 'Qualified', count: 567, rate: 45.9 },
                      { stage: 'Customers', count: 234, rate: 41.3 }
                    ]
                  }
                ].map((section, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-4">{section.title}</h4>
                    <div className="space-y-3">
                      {section.data.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{item.stage || item.source}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium">
                              {item.count.toLocaleString()}
                            </span>
                            {item.rate && (
                              <span className="text-xs text-gray-500">({item.rate}%)</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* KPIs Tab */}
      {activeTab === 'kpis' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Key Performance Indicators</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {kpiData.map(kpi => (
                  <div key={kpi.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-900">{kpi.name}</h4>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(kpi.status)}`}>
                        {kpi.status.replace('-', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Current:</span>
                        <span className="font-medium">{kpi.value.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Target:</span>
                        <span className="font-medium">{kpi.target.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Change:</span>
                        <span className={`font-medium ${
                          kpi.change >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {kpi.change >= 0 ? '+' : ''}{kpi.change}%
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">{kpi.description}</p>
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
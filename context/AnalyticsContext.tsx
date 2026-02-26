import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from './TenantContext';
import { errorLogger } from '../lib/errorLogger';

// Analytics Types
export interface WebAnalytics {
  id: string;
  tenant_id: string;
  date: string;
  total_visits: number;
  unique_visitors: number;
  page_views: number;
  bounce_rate: number;
  avg_session_duration: number;
  top_pages: Record<string, number>;
  referrers: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsMetric {
  id: string;
  tenant_id: string;
  metric_name: string;
  metric_value: number;
  metric_unit: string;
  date: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface KPIData {
  metric_name: string;
  value: number;
  unit: string;
  change: number;
  change_type: 'increase' | 'decrease' | 'neutral';
  trend: number[]; // Last 7 days
}

export interface AnalyticsInsight {
  id: string;
  tenant_id: string;
  insight_type: 'trend' | 'anomaly' | 'opportunity' | 'warning';
  title: string;
  description: string;
  confidence_score: number;
  metrics_impacted: string[];
  recommendations: string[];
  created_at: string;
  is_read: boolean;
}

interface AnalyticsContextType {
  // State
  webAnalytics: WebAnalytics[];
  metrics: AnalyticsMetric[];
  kpis: KPIData[];
  insights: AnalyticsInsight[];
  loading: boolean;
  error: string | null;

  // Permissions
  canViewAnalytics: boolean;
  canManageAnalytics: boolean;

  // Web Analytics
  trackPageView: (page: string, referrer?: string) => Promise<void>;
  getWebAnalytics: (startDate?: string, endDate?: string) => Promise<WebAnalytics[]>;
  getTopPages: (limit?: number) => Promise<Array<{ page: string; views: number }>>;
  getReferrers: (limit?: number) => Promise<Array<{ referrer: string; visits: number }>>;

  // Metrics Management
  recordMetric: (name: string, value: number, unit: string, metadata?: Record<string, any>) => Promise<void>;
  getMetrics: (metricName?: string, startDate?: string, endDate?: string) => Promise<AnalyticsMetric[]>;
  calculateKPIs: () => Promise<KPIData[]>;

  // Insights
  generateInsights: () => Promise<AnalyticsInsight[]>;
  getInsights: (unreadOnly?: boolean) => Promise<AnalyticsInsight[]>;
  markInsightAsRead: (insightId: string) => Promise<void>;

  // Reports
  generateReport: (reportType: 'daily' | 'weekly' | 'monthly', startDate: string, endDate: string) => Promise<any>;
  exportData: (format: 'csv' | 'json', data?: any) => Promise<Blob>;

  // Utility functions
  refreshAnalytics: () => Promise<void>;
  calculateConversionRate: (period: 'day' | 'week' | 'month') => Promise<number>;
  calculateProductivity: (userId: string | undefined, period: 'day' | 'week' | 'month') => Promise<number>;
  calculateResponseTime: (period: 'day' | 'week' | 'month') => Promise<number>;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export const useAnalytics = () => {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
};

interface AnalyticsProviderProps {
  children: React.ReactNode;
}

export const AnalyticsProvider: React.FC<AnalyticsProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const { currentTenant, tenantId } = useTenant();
  const [webAnalytics, setWebAnalytics] = useState<WebAnalytics[]>([]);
  const [metrics, setMetrics] = useState<AnalyticsMetric[]>([]);
  const [kpis, setKpis] = useState<KPIData[]>([]);
  const [insights, setInsights] = useState<AnalyticsInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canViewAnalytics, setCanViewAnalytics] = useState(false);
  const [canManageAnalytics, setCanManageAnalytics] = useState(false);

  // Check permissions
  useEffect(() => {
    const checkPermissions = async () => {
      if (!user || !currentTenant) {
        setCanViewAnalytics(false);
        setCanManageAnalytics(false);
        return;
      }

      try {
        // For now, check if user has analytics permissions
        // This could be enhanced with proper RBAC integration
        const { data: profile } = await supabase
          .from('profiles')
          .select('roles!inner(name)')
          .eq('id', user.id)
          .single();

        const hasAdminRole = profile?.roles?.some((r: any) => 
          ['owner', 'admin'].includes(r.name.toLowerCase())
        );

        setCanViewAnalytics(hasAdminRole || false);
        setCanManageAnalytics(hasAdminRole || false);
      } catch (err) {
        console.warn('Could not verify analytics permissions:', err);
        setCanViewAnalytics(false);
        setCanManageAnalytics(false);
      }
    };

    checkPermissions();
  }, [user, currentTenant]);

  // Load initial analytics data
  const loadAnalyticsData = useCallback(async () => {
    if (!user || !tenantId || !canViewAnalytics) {
      setWebAnalytics([]);
      setMetrics([]);
      setKpis([]);
      setInsights([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Load web analytics for last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: webData, error: webError } = await supabase
        .from('web_analytics')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (webError && webError.code !== 'PGRST116') {
        console.warn('Web analytics table may not exist:', webError.message);
      }

      // Load metrics for last 30 days
      const { data: metricsData, error: metricsError } = await supabase
        .from('analytics_metrics')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (metricsError && metricsError.code !== 'PGRST116') {
        console.warn('Analytics metrics table may not exist:', metricsError.message);
      }

      // Load insights
      const { data: insightsData, error: insightsError } = await supabase
        .from('analytics_insights')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (insightsError && insightsError.code !== 'PGRST116') {
        console.warn('Analytics insights table may not exist:', insightsError.message);
      }

      setWebAnalytics(webData || []);
      setMetrics(metricsData || []);
      setInsights(insightsData || []);

      // Calculate KPIs
      await calculateKPIs();
    } catch (err) {
      errorLogger.error('Error loading analytics data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [user, tenantId, canViewAnalytics]);

  // Lazy-load: don't fetch analytics on mount — only when explicitly requested
  // This avoids 4+ sequential DB queries that slow down the initial dashboard load
  const _hasLoadedRef = React.useRef(false);

  // Track page view
  const trackPageView = useCallback(async (page: string, referrer?: string) => {
    if (!tenantId) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Upsert web analytics record
      const { data: existing } = await supabase
        .from('web_analytics')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('date', today)
        .single();

      if (existing) {
        // Update existing record
        const updatedPages = { ...existing.top_pages };
        updatedPages[page] = (updatedPages[page] || 0) + 1;

        const updatedReferrers = { ...existing.referrers };
        if (referrer) {
          updatedReferrers[referrer] = (updatedReferrers[referrer] || 0) + 1;
        }

        await supabase
          .from('web_analytics')
          .update({
            total_visits: existing.total_visits + 1,
            page_views: existing.page_views + 1,
            top_pages: updatedPages,
            referrers: updatedReferrers,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        // Create new record
        await supabase
          .from('web_analytics')
          .insert({
            tenant_id: tenantId,
            date: today,
            total_visits: 1,
            unique_visitors: 1, // This should be calculated properly
            page_views: 1,
            bounce_rate: 0,
            avg_session_duration: 0,
            top_pages: { [page]: 1 },
            referrers: referrer ? { [referrer]: 1 } : {}
          });
      }
    } catch (err) {
      errorLogger.error('Error tracking page view:', err);
    }
  }, [tenantId]);

  // Get web analytics
  const getWebAnalytics = useCallback(async (startDate?: string, endDate?: string) => {
    if (!tenantId || !canViewAnalytics) return [];

    try {
      let query = supabase
        .from('web_analytics')
        .select('*')
        .eq('tenant_id', tenantId);

      if (startDate) {
        query = query.gte('date', startDate);
      }
      if (endDate) {
        query = query.lte('date', endDate);
      }

      const { data, error } = await query.order('date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      errorLogger.error('Error fetching web analytics:', err);
      return [];
    }
  }, [tenantId, canViewAnalytics]);

  // Get top pages
  const getTopPages = useCallback(async (limit = 10) => {
    if (!tenantId || !canViewAnalytics) return [];

    try {
      const { data } = await supabase
        .from('web_analytics')
        .select('top_pages')
        .eq('tenant_id', tenantId)
        .order('date', { ascending: false })
        .limit(30); // Last 30 days

      const pageCounts: Record<string, number> = {};
      
      data?.forEach(item => {
        Object.entries(item.top_pages || {}).forEach(([page, count]) => {
          pageCounts[page] = (pageCounts[page] || 0) + (count as number);
        });
      });

      return Object.entries(pageCounts)
        .map(([page, views]) => ({ page, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, limit);
    } catch (err) {
      errorLogger.error('Error fetching top pages:', err);
      return [];
    }
  }, [tenantId, canViewAnalytics]);

  // Get referrers
  const getReferrers = useCallback(async (limit = 10) => {
    if (!tenantId || !canViewAnalytics) return [];

    try {
      const { data } = await supabase
        .from('web_analytics')
        .select('referrers')
        .eq('tenant_id', tenantId)
        .order('date', { ascending: false })
        .limit(30);

      const referrerCounts: Record<string, number> = {};
      
      data?.forEach(item => {
        Object.entries(item.referrers || {}).forEach(([referrer, count]) => {
          referrerCounts[referrer] = (referrerCounts[referrer] || 0) + (count as number);
        });
      });

      return Object.entries(referrerCounts)
        .map(([referrer, visits]) => ({ referrer, visits }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, limit);
    } catch (err) {
      errorLogger.error('Error fetching referrers:', err);
      return [];
    }
  }, [tenantId, canViewAnalytics]);

  // Record metric
  const recordMetric = useCallback(async (name: string, value: number, unit: string, metadata?: Record<string, any>) => {
    if (!tenantId || !canManageAnalytics) return;

    try {
      await supabase
        .from('analytics_metrics')
        .insert({
          tenant_id: tenantId,
          metric_name: name,
          metric_value: value,
          metric_unit: unit,
          date: new Date().toISOString().split('T')[0],
          metadata: metadata || {}
        });

      // Refresh metrics
      await loadAnalyticsData();
    } catch (err) {
      errorLogger.error('Error recording metric:', err);
    }
  }, [tenantId, canManageAnalytics, loadAnalyticsData]);

  // Get metrics
  const getMetrics = useCallback(async (metricName: string | undefined, startDate?: string, endDate?: string) => {
    if (!tenantId || !canViewAnalytics) return [];

    try {
      let query = supabase
        .from('analytics_metrics')
        .select('*')
        .eq('tenant_id', tenantId);

      if (metricName) {
        query = query.eq('metric_name', metricName);
      }
      if (startDate) {
        query = query.gte('date', startDate);
      }
      if (endDate) {
        query = query.lte('date', endDate);
      }

      const { data, error } = await query.order('date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      errorLogger.error('Error fetching metrics:', err);
      return [];
    }
  }, [tenantId, canViewAnalytics]);

  // Calculate KPIs
  const calculateKPIs = useCallback(async (): Promise<KPIData[]> => {
    if (!tenantId || !canViewAnalytics) return [];

    try {
      const kpisData: KPIData[] = [];

      // Conversion rate calculation
      const conversionRate = await calculateConversionRate('month');
      kpisData.push({
        metric_name: 'Conversion Rate',
        value: conversionRate,
        unit: '%',
        change: 0, // Calculate against previous period
        change_type: 'neutral',
        trend: [] // Get historical data
      });

      // Productivity calculation
      const productivity = await calculateProductivity(undefined, 'month');
      kpisData.push({
        metric_name: 'Productivity',
        value: productivity,
        unit: 'tasks/hour',
        change: 0,
        change_type: 'neutral',
        trend: []
      });

      // Response time calculation
      const responseTime = await calculateResponseTime('month');
      kpisData.push({
        metric_name: 'Response Time',
        value: responseTime,
        unit: 'hours',
        change: 0,
        change_type: 'neutral',
        trend: []
      });

      setKpis(kpisData);
      return kpisData;
    } catch (err) {
      errorLogger.error('Error calculating KPIs:', err);
      return [];
    }
  }, [tenantId, canViewAnalytics]);

  // Calculate conversion rate
  const calculateConversionRate = useCallback(async (period: 'day' | 'week' | 'month'): Promise<number> => {
    if (!tenantId) return 0;

    try {
      // Get leads count
      const { data: leads } = await supabase
        .from('leads')
        .select('id, status, created_at')
        .eq('tenant_id', tenantId);

      // Get projects count from converted leads
      const { data: projects } = await supabase
        .from('projects')
        .select('id, created_at');

      if (!leads || !projects) return 0;

      const totalLeads = leads.length;
      const convertedProjects = projects.length;

      return totalLeads > 0 ? Math.round((convertedProjects / totalLeads) * 100) : 0;
    } catch (err) {
      errorLogger.error('Error calculating conversion rate:', err);
      return 0;
    }
  }, [tenantId]);

  // Calculate productivity
  const calculateProductivity = useCallback(async (userId: string | undefined, period: 'day' | 'week' | 'month' = 'week'): Promise<number> => {
    if (!tenantId) return 0;

    try {
      let query = supabase
        .from('tasks')
        .select('completed, completed_at, assignee_id')
        .eq('tenant_id', tenantId);

      if (userId) {
        query = query.eq('assignee_id', userId);
      }

      const { data: tasks } = await query;

      if (!tasks || tasks.length === 0) return 0;

      const completedTasks = tasks.filter(t => t.completed).length;
      // This is a simplified calculation - in reality would track hours worked
      return completedTasks;
    } catch (err) {
      errorLogger.error('Error calculating productivity:', err);
      return 0;
    }
  }, [tenantId]);

  // Calculate response time
  const calculateResponseTime = useCallback(async (period: 'day' | 'week' | 'month' = 'week'): Promise<number> => {
    if (!tenantId) return 0;

    try {
      // Get leads and calculate time to first contact
      const { data: leads } = await supabase
        .from('leads')
        .select('created_at, first_contact_at')
        .eq('tenant_id', tenantId)
        .not('first_contact_at', 'is', null);

      if (!leads || leads.length === 0) return 0;

      const responseTimes = leads.map(lead => {
        const created = new Date(lead.created_at);
        const contacted = new Date(lead.first_contact_at!);
        return (contacted.getTime() - created.getTime()) / (1000 * 60 * 60); // hours
      });

      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      return Math.round(avgResponseTime * 10) / 10;
    } catch (err) {
      errorLogger.error('Error calculating response time:', err);
      return 0;
    }
  }, [tenantId]);

  // Generate insights (placeholder for AI integration)
  const generateInsights = useCallback(async (): Promise<AnalyticsInsight[]> => {
    if (!tenantId || !canManageAnalytics) return [];

    try {
      // This would integrate with AI service for generating insights
      // For now, return empty array
      return [];
    } catch (err) {
      errorLogger.error('Error generating insights:', err);
      return [];
    }
  }, [tenantId, canManageAnalytics]);

  // Get insights
  const getInsights = useCallback(async (unreadOnly: boolean = false) => {
    if (!tenantId || !canViewAnalytics) return [];

    try {
      let query = supabase
        .from('analytics_insights')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      errorLogger.error('Error fetching insights:', err);
      return [];
    }
  }, [tenantId, canViewAnalytics]);

  // Mark insight as read
  const markInsightAsRead = useCallback(async (insightId: string) => {
    if (!canManageAnalytics) return;

    try {
      await supabase
        .from('analytics_insights')
        .update({ is_read: true })
        .eq('id', insightId);

      setInsights(prev => 
        prev.map(insight => 
          insight.id === insightId ? { ...insight, is_read: true } : insight
        )
      );
    } catch (err) {
      errorLogger.error('Error marking insight as read:', err);
    }
  }, [canManageAnalytics]);

  // Generate report
  const generateReport = useCallback(async (reportType: 'daily' | 'weekly' | 'monthly', startDate: string, endDate: string) => {
    if (!tenantId || !canViewAnalytics) return null;

    try {
      // Aggregate data based on report type
      const report = {
        type: reportType,
        period: { start: startDate, end: endDate },
        webAnalytics: await getWebAnalytics(startDate, endDate),
        metrics: await getMetrics(undefined, startDate, endDate),
        generated_at: new Date().toISOString()
      };

      return report;
    } catch (err) {
      errorLogger.error('Error generating report:', err);
      return null;
    }
  }, [tenantId, canViewAnalytics, getWebAnalytics, getMetrics]);

  // Export data
  const exportData = useCallback(async (format: 'csv' | 'json', data?: any) => {
    const exportData = data || { webAnalytics, metrics, kpis, insights };
    
    if (format === 'json') {
      const jsonString = JSON.stringify(exportData, null, 2);
      return new Blob([jsonString], { type: 'application/json' });
    } else if (format === 'csv') {
      // Simple CSV export for web analytics
      const csvHeaders = 'Date,Total Visits,Unique Visitors,Page Views,Bounce Rate,Avg Session Duration\n';
      const csvRows = webAnalytics.map(row => 
        `${row.date},${row.total_visits},${row.unique_visitors},${row.page_views},${row.bounce_rate},${row.avg_session_duration}`
      ).join('\n');
      
      return new Blob([csvHeaders + csvRows], { type: 'text/csv' });
    }

    throw new Error('Unsupported export format');
  }, [webAnalytics, metrics, kpis, insights]);

  // Refresh analytics — also serves as the initial load trigger (lazy)
  const refreshAnalytics = useCallback(async () => {
    _hasLoadedRef.current = true;
    await loadAnalyticsData();
  }, [loadAnalyticsData]);

  const value: AnalyticsContextType = {
    // State
    webAnalytics,
    metrics,
    kpis,
    insights,
    loading,
    error,

    // Permissions
    canViewAnalytics,
    canManageAnalytics,

    // Web Analytics
    trackPageView,
    getWebAnalytics,
    getTopPages,
    getReferrers,

    // Metrics Management
    recordMetric,
    getMetrics,
    calculateKPIs,

    // Insights
    generateInsights,
    getInsights,
    markInsightAsRead,

    // Reports
    generateReport,
    exportData,

    // Utility functions
    refreshAnalytics,
    calculateConversionRate,
    calculateProductivity,
    calculateResponseTime,
  };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
};
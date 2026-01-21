import React, { useCallback, useEffect, useRef, useState } from 'react';

// Performance monitoring types
export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface ContextPerformanceMetrics {
  contextName: string;
  loadTime: number;
  renderCount: number;
  errorCount: number;
  lastUpdate: string;
  memoryUsage?: number;
  averageRenderTime: number;
}

export interface SystemPerformanceData {
  timestamp: string;
  contexts: ContextPerformanceMetrics[];
  systemMetrics: {
    totalMemoryUsed: number;
    totalMemoryAvailable: number;
    activeContexts: number;
    totalSubscriptions: number;
    averageResponseTime: number;
  };
}

// Performance monitoring hook
export const usePerformanceMonitor = (contextName: string) => {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const renderCount = useRef(0);
  const errorCount = useRef(0);
  const lastRenderTime = useRef<number>(0);

  // Start timing a performance metric
  const startTiming = useCallback((name: string, metadata?: Record<string, any>) => {
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata,
    };
    
    return metric;
  }, []);

  // End timing a performance metric
  const endTiming = useCallback((metric: PerformanceMetric) => {
    const endTime = performance.now();
    const completedMetric: PerformanceMetric = {
      ...metric,
      endTime,
      duration: endTime - metric.startTime,
    };
    
    setMetrics(prev => [...prev, completedMetric]);
    
    // Log slow operations
    if (completedMetric.duration! > 1000) { // More than 1 second
      console.warn(`⚠️ Slow operation in ${contextName}:`, completedMetric);
    }
    
    return completedMetric;
  }, [contextName]);

  // Measure a function execution
  const measureFunction = useCallback(async <T>(
    name: string,
    fn: () => Promise<T> | T,
    metadata?: Record<string, any>
  ): Promise<T> => {
    const metric = startTiming(name, metadata);
    
    try {
      const result = await fn();
      endTiming(metric);
      return result;
    } catch (error) {
      endTiming(metric);
      throw error;
    }
  }, [startTiming, endTiming]);

  // Track component renders
  useEffect(() => {
    renderCount.current += 1;
    const now = performance.now();
    
    if (lastRenderTime.current > 0) {
      const renderTime = now - lastRenderTime.current;
      
      // Log slow renders
      if (renderTime > 16) { // More than 60fps
        console.warn(`⚠️ Slow render in ${contextName}: ${renderTime.toFixed(2)}ms`);
      }
    }
    
    lastRenderTime.current = now;
  });

  // Get performance summary
  const getSummary = useCallback((): ContextPerformanceMetrics => {
    const loadTimes = metrics
      .filter(m => m.name.includes('load') || m.name.includes('init'))
      .map(m => m.duration!)
      .filter(Boolean);
    
    const averageLoadTime = loadTimes.length > 0 
      ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length 
      : 0;

    const renderTimes = metrics
      .filter(m => m.name.includes('render'))
      .map(m => m.duration!)
      .filter(Boolean);
    
    const averageRenderTime = renderTimes.length > 0 
      ? renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length 
      : 0;

    return {
      contextName,
      loadTime: averageLoadTime,
      renderCount: renderCount.current,
      errorCount: errorCount.current,
      lastUpdate: new Date().toISOString(),
      memoryUsage: (performance as any).memory?.usedJSHeapSize,
      averageRenderTime,
    };
  }, [metrics, contextName]);

  // Reset metrics
  const reset = useCallback(() => {
    setMetrics([]);
    renderCount.current = 0;
    errorCount.current = 0;
    lastRenderTime.current = 0;
  }, []);

  return {
    metrics,
    startTiming,
    endTiming,
    measureFunction,
    getSummary,
    reset,
    renderCount: renderCount.current,
    errorCount: errorCount.current,
  };
};

// Global performance monitor
class GlobalPerformanceMonitor {
  private static instance: GlobalPerformanceMonitor;
  private contextMetrics: Map<string, ContextPerformanceMetrics> = new Map();
  private systemMetrics: SystemPerformanceData[] = [];
  private subscriptions: Set<string> = new Set();

  static getInstance(): GlobalPerformanceMonitor {
    if (!GlobalPerformanceMonitor.instance) {
      GlobalPerformanceMonitor.instance = new GlobalPerformanceMonitor();
    }
    return GlobalPerformanceMonitor.instance;
  }

  // Register context metrics
  registerContext(metrics: ContextPerformanceMetrics) {
    this.contextMetrics.set(metrics.contextName, metrics);
    this.collectSystemMetrics();
  }

  // Track subscription
  trackSubscription(channelName: string) {
    this.subscriptions.add(channelName);
  }

  // Untrack subscription
  untrackSubscription(channelName: string) {
    this.subscriptions.delete(channelName);
  }

  // Collect system-wide metrics
  private collectSystemMetrics() {
    const memory = (performance as any).memory;
    const systemData: SystemPerformanceData = {
      timestamp: new Date().toISOString(),
      contexts: Array.from(this.contextMetrics.values()),
      systemMetrics: {
        totalMemoryUsed: memory?.usedJSHeapSize || 0,
        totalMemoryAvailable: memory?.totalJSHeapSize || 0,
        activeContexts: this.contextMetrics.size,
        totalSubscriptions: this.subscriptions.size,
        averageResponseTime: this.calculateAverageResponseTime(),
      },
    };

    this.systemMetrics.push(systemData);
    
    // Keep only last 100 entries
    if (this.systemMetrics.length > 100) {
      this.systemMetrics = this.systemMetrics.slice(-100);
    }

    // Check for performance issues
    this.checkPerformanceIssues(systemData);
  }

  // Calculate average response time
  private calculateAverageResponseTime(): number {
    const allContexts = Array.from(this.contextMetrics.values());
    if (allContexts.length === 0) return 0;
    
    const totalResponseTime = allContexts.reduce((sum, ctx) => sum + ctx.averageRenderTime, 0);
    return totalResponseTime / allContexts.length;
  }

  // Check for performance issues
  private checkPerformanceIssues(data: SystemPerformanceData) {
    const issues: string[] = [];

    // Memory usage
    const memoryUsagePercent = (data.systemMetrics.totalMemoryUsed / data.systemMetrics.totalMemoryAvailable) * 100;
    if (memoryUsagePercent > 80) {
      issues.push(`High memory usage: ${memoryUsagePercent.toFixed(1)}%`);
    }

    // Context performance
    data.contexts.forEach(ctx => {
      if (ctx.loadTime > 5000) {
        issues.push(`Slow context load: ${ctx.contextName} (${ctx.loadTime}ms)`);
      }
      
      if (ctx.averageRenderTime > 50) {
        issues.push(`Slow rendering: ${ctx.contextName} (${ctx.averageRenderTime.toFixed(2)}ms)`);
      }
      
      if (ctx.errorCount > 10) {
        issues.push(`High error rate: ${ctx.contextName} (${ctx.errorCount} errors)`);
      }
    });

    // Log issues
    if (issues.length > 0) {
      console.warn('🚨 Performance issues detected:', issues);
      
      // Send to monitoring service (if configured)
      if (typeof window !== 'undefined' && (window as any).performanceMonitoringService) {
        (window as any).performanceMonitoringService.reportIssues(issues);
      }
    }
  }

  // Get performance report
  getPerformanceReport(): {
    summary: SystemPerformanceData;
    trends: SystemPerformanceData[];
    recommendations: string[];
  } {
    const latest = this.systemMetrics[this.systemMetrics.length - 1];
    const trends = this.systemMetrics.slice(-20); // Last 20 measurements
    const recommendations = this.generateRecommendations(latest);

    return {
      summary: latest,
      trends,
      recommendations,
    };
  }

  // Generate performance recommendations
  private generateRecommendations(data: SystemPerformanceData): string[] {
    const recommendations: string[] = [];

    // Memory recommendations
    const memoryUsagePercent = (data.systemMetrics.totalMemoryUsed / data.systemMetrics.totalMemoryAvailable) * 100;
    if (memoryUsagePercent > 70) {
      recommendations.push('Consider implementing memory optimization strategies');
      recommendations.push('Review data retention policies');
    }

    // Context recommendations
    data.contexts.forEach(ctx => {
      if (ctx.loadTime > 2000) {
        recommendations.push(`Optimize ${ctx.contextName} loading performance`);
      }
      
      if (ctx.averageRenderTime > 30) {
        recommendations.push(`Review ${ctx.contextName} render efficiency`);
      }
    });

    // Subscription recommendations
    if (data.systemMetrics.totalSubscriptions > 50) {
      recommendations.push('Consider reducing real-time subscriptions');
      recommendations.push('Implement subscription batching');
    }

    return recommendations;
  }

  // Export performance data
  exportData(): string {
    const exportData = {
      timestamp: new Date().toISOString(),
      contextMetrics: Object.fromEntries(this.contextMetrics),
      systemMetrics: this.systemMetrics,
      recommendations: this.generateRecommendations(this.systemMetrics[this.systemMetrics.length - 1]),
    };

    return JSON.stringify(exportData, null, 2);
  }

  // Clear all metrics
  clear() {
    this.contextMetrics.clear();
    this.systemMetrics = [];
    this.subscriptions.clear();
  }
}

// Performance monitoring hook for global access
export const useGlobalPerformanceMonitor = () => {
  const monitor = GlobalPerformanceMonitor.getInstance();

  return {
    registerContext: (metrics: ContextPerformanceMetrics) => monitor.registerContext(metrics),
    trackSubscription: (channelName: string) => monitor.trackSubscription(channelName),
    untrackSubscription: (channelName: string) => monitor.untrackSubscription(channelName),
    getReport: () => monitor.getPerformanceReport(),
    exportData: () => monitor.exportData(),
    clear: () => monitor.clear(),
  };
};

// Performance boundary component
export interface PerformanceBoundaryProps {
  children: React.ReactNode;
  contextName: string;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showMetrics?: boolean;
}

export const PerformanceBoundary: React.FC<PerformanceBoundaryProps> = ({
  children,
  contextName,
  onError,
  showMetrics = false,
}) => {
  const { measureFunction, getSummary, reset } = usePerformanceMonitor(contextName);
  const [showDetails, setShowDetails] = useState(false);
  const [summary, setSummary] = useState<ContextPerformanceMetrics | null>(null);

  // Update summary periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const currentSummary = getSummary();
      setSummary(currentSummary);
      
      // Register with global monitor
      const globalMonitor = GlobalPerformanceMonitor.getInstance();
      globalMonitor.registerContext(currentSummary);
    }, 5000); // Every 5 seconds

    return () => clearInterval(interval);
  }, [getSummary]);

  // Handle errors
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    console.error(`🚨 Performance boundary error in ${contextName}:`, error, errorInfo);
    
    if (onError) {
      onError(error, errorInfo);
    }
  };

  if (showMetrics && summary) {
    return React.createElement('div', { className: 'performance-metrics' },
      React.createElement('div', { className: 'metrics-summary' },
        React.createElement('h4', null, `${contextName} Performance`),
        React.createElement('button', { 
          onClick: () => setShowDetails(!showDetails) 
        }, showDetails ? 'Hide' : 'Show', ' Details'),
        
        showDetails && React.createElement('div', { className: 'metrics-details' },
          React.createElement('div', null, `Load Time: ${summary.loadTime.toFixed(2)}ms`),
          React.createElement('div', null, `Renders: ${summary.renderCount}`),
          React.createElement('div', null, `Errors: ${summary.errorCount}`),
          React.createElement('div', null, `Avg Render: ${summary.averageRenderTime.toFixed(2)}ms`),
          React.createElement('div', null, `Memory: ${(summary.memoryUsage! / 1024 / 1024).toFixed(2)}MB`),
          React.createElement('button', { onClick: reset }, 'Reset Metrics')
        )
      ),
      
      children
    );
  }

  return React.createElement(
    React.ErrorBoundary,
    { onError: handleError },
    children
  );
};

export default GlobalPerformanceMonitor;
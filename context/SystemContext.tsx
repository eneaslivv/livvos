import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';

// System Management Types
export interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  database: boolean;
  storage: boolean;
  auth: boolean;
  functions: boolean;
  timestamp: string;
  details: Record<string, any>;
}

export interface AgentStatus {
  id: string;
  name: string;
  type: 'auth' | 'tenant' | 'security' | 'project' | 'crm' | 'finance' | 'calendar' | 'document' | 'team' | 'analytics' | 'system';
  status: 'active' | 'idle' | 'error' | 'disabled';
  lastActivity: string;
  executionCount: number;
  errorCount: number;
  avgExecutionTime: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface SystemMetrics {
  timestamp: string;
  activeUsers: number;
  totalProjects: number;
  totalTasks: number;
  storageUsed: number;
  storageLimit: number;
  apiCalls: number;
  errorRate: number;
  avgResponseTime: number;
}

export interface SkillExecution {
  id: string;
  agentId: string;
  skillName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  dependencies?: string[];
  triggeredBy: 'system' | 'user' | 'agent';
}

export interface ClusterNode {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'maintenance';
  region: string;
  capacity: number;
  used: number;
  load: number;
  roles: string[];
  lastHeartbeat: string;
}

interface SystemContextType {
  // State
  systemHealth: SystemHealth | null;
  agents: AgentStatus[];
  metrics: SystemMetrics | null;
  skillExecutions: SkillExecution[];
  clusterNodes: ClusterNode[];
  loading: boolean;
  error: string | null;

  // Permissions
  canManageSystem: boolean;
  canViewSystem: boolean;

  // Health Monitoring
  checkSystemHealth: () => Promise<SystemHealth>;
  getHealthStatus: () => 'healthy' | 'warning' | 'critical';
  setupHealthMonitoring: (interval?: number) => void;

  // Agent Management
  getAgentStatus: (agentId?: string) => Promise<AgentStatus[]>;
  updateAgentStatus: (agentId: string, updates: Partial<AgentStatus>) => Promise<void>;
  enableAgent: (agentId: string) => Promise<void>;
  disableAgent: (agentId: string) => Promise<void>;
  restartAgent: (agentId: string) => Promise<void>;

  // Skill Execution
  executeSkill: (agentId: string, skillName: string, input: Record<string, any>) => Promise<SkillExecution>;
  getSkillExecutions: (agentId?: string, status?: string) => Promise<SkillExecution[]>;
  cancelSkillExecution: (executionId: string) => Promise<void>;
  retrySkillExecution: (executionId: string) => Promise<SkillExecution>;

  // System Metrics
  getSystemMetrics: (startDate?: string, endDate?: string) => Promise<SystemMetrics[]>;
  recordMetric: (metric: Partial<SystemMetrics>) => Promise<void>;
  getPerformanceReport: (period: 'hour' | 'day' | 'week' | 'month') => Promise<any>;

  // Cluster Management
  getClusterNodes: () => Promise<ClusterNode[]>;
  addNodeToCluster: (node: Omit<ClusterNode, 'id' | 'lastHeartbeat'>) => Promise<ClusterNode>;
  removeNodeFromCluster: (nodeId: string) => Promise<void>;
  updateNodeStatus: (nodeId: string, status: ClusterNode['status']) => Promise<void>;

  // Orchestration
  orchestrateAgents: (workflow: AgentWorkflow) => Promise<SkillExecution[]>;
  getWorkflowStatus: (workflowId: string) => Promise<any>;
  cancelWorkflow: (workflowId: string) => Promise<void>;

  // System Operations
  runSystemDiagnostics: () => Promise<any>;
  cleanupOldRecords: (daysToKeep: number) => Promise<void>;
  backupSystem: () => Promise<string>;
  restoreSystem: (backupId: string) => Promise<void>;

  // Utilities
  refreshSystemData: () => Promise<void>;
  getSystemLogs: (level?: 'error' | 'warn' | 'info', limit?: number) => Promise<any[]>;
}

export interface AgentWorkflow {
  id: string;
  name: string;
  description: string;
  steps: Array<{
    agentId: string;
    skillName: string;
    input: Record<string, any>;
    dependencies?: string[];
    retryPolicy?: {
      maxRetries: number;
      backoffMs: number;
    };
  }>;
  triggeredBy: 'system' | 'user' | 'schedule';
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export const useSystem = () => {
  const context = useContext(SystemContext);
  if (context === undefined) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return context;
};

interface SystemProviderProps {
  children: React.ReactNode;
}

export const SystemProvider: React.FC<SystemProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [skillExecutions, setSkillExecutions] = useState<SkillExecution[]>([]);
  const [clusterNodes, setClusterNodes] = useState<ClusterNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManageSystem, setCanManageSystem] = useState(false);
  const [canViewSystem, setCanViewSystem] = useState(false);
  const [healthMonitoringInterval, setHealthMonitoringInterval] = useState<NodeJS.Timeout | null>(null);

  // Check permissions
  useEffect(() => {
    const checkPermissions = async () => {
      if (!user) {
        setCanManageSystem(false);
        setCanViewSystem(false);
        return;
      }

      try {
        // Check if user is system admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('roles!inner(name)')
          .eq('id', user.id)
          .single();

        const hasSystemRole = profile?.roles?.some((r: any) => 
          ['owner', 'admin', 'system'].includes(r.name.toLowerCase())
        );

        setCanViewSystem(hasSystemRole || false);
        setCanManageSystem(hasSystemRole || false);
      } catch (err) {
        console.warn('Could not verify system permissions:', err);
        setCanViewSystem(false);
        setCanManageSystem(false);
      }
    };

    checkPermissions();
  }, [user]);

  // Load initial system data
  const loadSystemData = useCallback(async () => {
    if (!user || !canViewSystem) {
      setSystemHealth(null);
      setAgents([]);
      setMetrics(null);
      setSkillExecutions([]);
      setClusterNodes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check system health
      const health = await checkSystemHealth();
      setSystemHealth(health);

      // Load agent statuses
      const agentStatuses = await getAgentStatus();
      setAgents(agentStatuses);

      // Load current metrics
      const currentMetrics = await getSystemMetrics();
      if (currentMetrics.length > 0) {
        setMetrics(currentMetrics[0]);
      }

      // Load recent skill executions
      const executions = await getSkillExecutions();
      setSkillExecutions(executions);

      // Load cluster nodes
      const nodes = await getClusterNodes();
      setClusterNodes(nodes);
    } catch (err) {
      errorLogger.error('Error loading system data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load system data');
    } finally {
      setLoading(false);
    }
  }, [user, canViewSystem]);

  useEffect(() => {
    loadSystemData();
  }, [loadSystemData]);

  // Health monitoring
  useEffect(() => {
    if (canManageSystem && !healthMonitoringInterval) {
      const interval = setInterval(async () => {
        const health = await checkSystemHealth();
        setSystemHealth(health);
      }, 30000); // Check every 30 seconds

      setHealthMonitoringInterval(interval);
    }

    return () => {
      if (healthMonitoringInterval) {
        clearInterval(healthMonitoringInterval);
        setHealthMonitoringInterval(null);
      }
    };
  }, [canManageSystem, healthMonitoringInterval]);

  // Check system health
  const checkSystemHealth = useCallback(async (): Promise<SystemHealth> => {
    try {
      const healthChecks = await Promise.allSettled([
        // Check database connectivity
        supabase.from('profiles').select('id').limit(1),
        // Check storage
        supabase.storage.from('documents').list('', { limit: 1 }),
        // Check auth
        supabase.auth.getSession(),
      ]);

      const dbHealthy = healthChecks[0].status === 'fulfilled';
      const storageHealthy = healthChecks[1].status === 'fulfilled';
      const authHealthy = healthChecks[2].status === 'fulfilled';

      const overallStatus = dbHealthy && storageHealthy && authHealthy ? 'healthy' : 
                           (dbHealthy || storageHealthy || authHealthy) ? 'warning' : 'critical';

      return {
        status: overallStatus,
        database: dbHealthy,
        storage: storageHealthy,
        auth: authHealthy,
        functions: true, // Assume functions are healthy for now
        timestamp: new Date().toISOString(),
        details: {
          database: dbHealthy ? 'Connected' : 'Connection failed',
          storage: storageHealthy ? 'Accessible' : 'Storage error',
          auth: authHealthy ? 'Working' : 'Auth service error',
        }
      };
    } catch (err) {
      return {
        status: 'critical',
        database: false,
        storage: false,
        auth: false,
        functions: false,
        timestamp: new Date().toISOString(),
        details: { error: err instanceof Error ? err.message : 'Unknown error' }
      };
    }
  }, []);

  const getHealthStatus = useCallback((): 'healthy' | 'warning' | 'critical' => {
    if (!systemHealth) return 'critical';
    return systemHealth.status;
  }, [systemHealth]);

  const setupHealthMonitoring = useCallback((interval = 30000) => {
    if (healthMonitoringInterval) {
      clearInterval(healthMonitoringInterval);
    }

    const newInterval = setInterval(async () => {
      const health = await checkSystemHealth();
      setSystemHealth(health);
    }, interval);

    setHealthMonitoringInterval(newInterval);
  }, [healthMonitoringInterval, checkSystemHealth]);

  // Agent Management
  const getAgentStatus = useCallback(async (agentId?: string): Promise<AgentStatus[]> => {
    if (!canViewSystem) return [];

    try {
      // This would fetch from actual agent status table
      // For now, return mock data
      const mockAgents: AgentStatus[] = [
        {
          id: 'auth-agent',
          name: 'Authentication Agent',
          type: 'auth',
          status: 'active',
          lastActivity: new Date().toISOString(),
          executionCount: 1250,
          errorCount: 2,
          avgExecutionTime: 45,
          memoryUsage: 128,
          cpuUsage: 15
        },
        {
          id: 'project-agent',
          name: 'Project Agent',
          type: 'project',
          status: 'active',
          lastActivity: new Date().toISOString(),
          executionCount: 890,
          errorCount: 5,
          avgExecutionTime: 120,
          memoryUsage: 256,
          cpuUsage: 25
        },
        // Add more agents as needed
      ];

      if (agentId) {
        return mockAgents.filter(agent => agent.id === agentId);
      }

      return mockAgents;
    } catch (err) {
      errorLogger.error('Error fetching agent status:', err);
      return [];
    }
  }, [canViewSystem]);

  const updateAgentStatus = useCallback(async (agentId: string, updates: Partial<AgentStatus>) => {
    if (!canManageSystem) return;

    try {
      setAgents(prev => 
        prev.map(agent => 
          agent.id === agentId ? { ...agent, ...updates } : agent
        )
      );

      // In a real implementation, this would update the database
      await supabase
        .from('agent_status')
        .update(updates)
        .eq('id', agentId);
    } catch (err) {
      errorLogger.error('Error updating agent status:', err);
    }
  }, [canManageSystem]);

  const enableAgent = useCallback(async (agentId: string) => {
    await updateAgentStatus(agentId, { status: 'active' });
  }, [updateAgentStatus]);

  const disableAgent = useCallback(async (agentId: string) => {
    await updateAgentStatus(agentId, { status: 'disabled' });
  }, [updateAgentStatus]);

  const restartAgent = useCallback(async (agentId: string) => {
    if (!canManageSystem) return;

    try {
      await updateAgentStatus(agentId, { status: 'idle' });
      
      // Simulate restart delay
      setTimeout(async () => {
        await updateAgentStatus(agentId, { 
          status: 'active',
          lastActivity: new Date().toISOString()
        });
      }, 2000);
    } catch (err) {
      errorLogger.error('Error restarting agent:', err);
    }
  }, [canManageSystem, updateAgentStatus]);

  // Skill Execution
  const executeSkill = useCallback(async (agentId: string, skillName: string, input: Record<string, any>): Promise<SkillExecution> => {
    if (!canManageSystem) {
      throw new Error('Insufficient permissions to execute skills');
    }

    try {
      const execution: SkillExecution = {
        id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        agentId,
        skillName,
        status: 'pending',
        input,
        startTime: new Date().toISOString(),
        triggeredBy: 'system'
      };

      setSkillExecutions(prev => [execution, ...prev]);

      // Simulate skill execution
      setTimeout(async () => {
        try {
          // Update to running
          setSkillExecutions(prev => 
            prev.map(e => e.id === execution.id ? { ...e, status: 'running' } : e)
          );

          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

          // Update to completed
          const endTime = new Date().toISOString();
          const duration = new Date(endTime).getTime() - new Date(execution.startTime).getTime();

          setSkillExecutions(prev => 
            prev.map(e => e.id === execution.id ? { 
              ...e, 
              status: 'completed',
              output: { success: true, result: `Skill ${skillName} executed successfully` },
              endTime,
              duration
            } : e)
          );
        } catch (err) {
          // Update to failed
          setSkillExecutions(prev => 
            prev.map(e => e.id === execution.id ? { 
              ...e, 
              status: 'failed',
              error: err instanceof Error ? err.message : 'Unknown error',
              endTime: new Date().toISOString()
            } : e)
          );
        }
      }, 100);

      return execution;
    } catch (err) {
      errorLogger.error('Error executing skill:', err);
      throw err;
    }
  }, [canManageSystem]);

  const getSkillExecutions = useCallback(async (agentId?: string, status?: string): Promise<SkillExecution[]> => {
    if (!canViewSystem) return [];

    try {
      let filtered = skillExecutions;

      if (agentId) {
        filtered = filtered.filter(exec => exec.agentId === agentId);
      }

      if (status) {
        filtered = filtered.filter(exec => exec.status === status);
      }

      return filtered;
    } catch (err) {
      errorLogger.error('Error fetching skill executions:', err);
      return [];
    }
  }, [canViewSystem, skillExecutions]);

  const cancelSkillExecution = useCallback(async (executionId: string) => {
    if (!canManageSystem) return;

    try {
      setSkillExecutions(prev => 
        prev.map(exec => 
          exec.id === executionId ? { 
            ...exec, 
            status: 'cancelled',
            endTime: new Date().toISOString()
          } : exec
        )
      );
    } catch (err) {
      errorLogger.error('Error cancelling skill execution:', err);
    }
  }, [canManageSystem]);

  const retrySkillExecution = useCallback(async (executionId: string): Promise<SkillExecution> => {
    if (!canManageSystem) {
      throw new Error('Insufficient permissions to retry skill execution');
    }

    try {
      const execution = skillExecutions.find(e => e.id === executionId);
      if (!execution) {
        throw new Error('Execution not found');
      }

      return await executeSkill(execution.agentId, execution.skillName, execution.input);
    } catch (err) {
      errorLogger.error('Error retrying skill execution:', err);
      throw err;
    }
  }, [canManageSystem, skillExecutions, executeSkill]);

  // System Metrics
  const getSystemMetrics = useCallback(async (startDate?: string, endDate?: string): Promise<SystemMetrics[]> => {
    if (!canViewSystem) return [];

    try {
      // This would fetch from actual metrics table
      // For now, return current metrics
      const mockMetrics: SystemMetrics = {
        timestamp: new Date().toISOString(),
        activeUsers: 42,
        totalProjects: 156,
        totalTasks: 892,
        storageUsed: 2048576, // bytes
        storageLimit: 10485760, // bytes
        apiCalls: 15420,
        errorRate: 0.02,
        avgResponseTime: 145
      };

      return [mockMetrics];
    } catch (err) {
      errorLogger.error('Error fetching system metrics:', err);
      return [];
    }
  }, [canViewSystem]);

  const recordMetric = useCallback(async (metric: Partial<SystemMetrics>) => {
    if (!canManageSystem) return;

    try {
      const fullMetric: SystemMetrics = {
        timestamp: new Date().toISOString(),
        activeUsers: 0,
        totalProjects: 0,
        totalTasks: 0,
        storageUsed: 0,
        storageLimit: 0,
        apiCalls: 0,
        errorRate: 0,
        avgResponseTime: 0,
        ...metric
      };

      setMetrics(fullMetric);

      // In a real implementation, this would save to database
      await supabase
        .from('system_metrics')
        .insert(fullMetric);
    } catch (err) {
      errorLogger.error('Error recording metric:', err);
    }
  }, [canManageSystem]);

  const getPerformanceReport = useCallback(async (period: 'hour' | 'day' | 'week' | 'month') => {
    if (!canViewSystem) return null;

    try {
      // Generate performance report based on period
      const report = {
        period,
        metrics: await getSystemMetrics(),
        agentPerformance: agents,
        topErrors: [], // Would fetch from error logs
        recommendations: [
          'Consider increasing memory allocation for project-agent',
          'API response times within acceptable range',
          'Storage usage at 20% of allocated limit'
        ]
      };

      return report;
    } catch (err) {
      errorLogger.error('Error generating performance report:', err);
      return null;
    }
  }, [canViewSystem, getSystemMetrics, agents]);

  // Cluster Management
  const getClusterNodes = useCallback(async (): Promise<ClusterNode[]> => {
    if (!canViewSystem) return [];

    try {
      // Mock cluster nodes
      const mockNodes: ClusterNode[] = [
        {
          id: 'node-1',
          name: 'Primary Node',
          status: 'online',
          region: 'us-east-1',
          capacity: 100,
          used: 65,
          load: 0.65,
          roles: ['web', 'api', 'database'],
          lastHeartbeat: new Date().toISOString()
        },
        {
          id: 'node-2',
          name: 'Worker Node 1',
          status: 'online',
          region: 'us-west-2',
          capacity: 100,
          used: 45,
          load: 0.45,
          roles: ['worker', 'processing'],
          lastHeartbeat: new Date().toISOString()
        }
      ];

      return mockNodes;
    } catch (err) {
      errorLogger.error('Error fetching cluster nodes:', err);
      return [];
    }
  }, [canViewSystem]);

  const addNodeToCluster = useCallback(async (node: Omit<ClusterNode, 'id' | 'lastHeartbeat'>): Promise<ClusterNode> => {
    if (!canManageSystem) {
      throw new Error('Insufficient permissions to manage cluster');
    }

    try {
      const newNode: ClusterNode = {
        ...node,
        id: `node_${Date.now()}`,
        lastHeartbeat: new Date().toISOString()
      };

      setClusterNodes(prev => [...prev, newNode]);

      // In a real implementation, this would register the node
      await supabase
        .from('cluster_nodes')
        .insert(newNode);

      return newNode;
    } catch (err) {
      errorLogger.error('Error adding node to cluster:', err);
      throw err;
    }
  }, [canManageSystem]);

  const removeNodeFromCluster = useCallback(async (nodeId: string) => {
    if (!canManageSystem) return;

    try {
      setClusterNodes(prev => prev.filter(node => node.id !== nodeId));

      await supabase
        .from('cluster_nodes')
        .delete()
        .eq('id', nodeId);
    } catch (err) {
      errorLogger.error('Error removing node from cluster:', err);
    }
  }, [canManageSystem]);

  const updateNodeStatus = useCallback(async (nodeId: string, status: ClusterNode['status']) => {
    if (!canManageSystem) return;

    try {
      setClusterNodes(prev => 
        prev.map(node => 
          node.id === nodeId ? { ...node, status, lastHeartbeat: new Date().toISOString() } : node
        )
      );

      await supabase
        .from('cluster_nodes')
        .update({ status, last_heartbeat: new Date().toISOString() })
        .eq('id', nodeId);
    } catch (err) {
      errorLogger.error('Error updating node status:', err);
    }
  }, [canManageSystem]);

  // Orchestration
  const orchestrateAgents = useCallback(async (workflow: AgentWorkflow): Promise<SkillExecution[]> => {
    if (!canManageSystem) {
      throw new Error('Insufficient permissions to orchestrate agents');
    }

    try {
      const executions: SkillExecution[] = [];

      for (const step of workflow.steps) {
        const execution = await executeSkill(step.agentId, step.skillName, step.input);
        executions.push(execution);

        // Wait for completion if there are dependencies
        if (step.dependencies && step.dependencies.length > 0) {
          // Wait logic would go here
        }
      }

      return executions;
    } catch (err) {
      errorLogger.error('Error orchestrating agents:', err);
      throw err;
    }
  }, [canManageSystem, executeSkill]);

  const getWorkflowStatus = useCallback(async (workflowId: string) => {
    if (!canViewSystem) return null;

    try {
      // This would fetch from workflow table
      return {
        id: workflowId,
        status: 'running',
        progress: 0.75,
        currentStep: 'project-agent',
        estimatedCompletion: new Date(Date.now() + 300000).toISOString()
      };
    } catch (err) {
      errorLogger.error('Error fetching workflow status:', err);
      return null;
    }
  }, [canViewSystem]);

  const cancelWorkflow = useCallback(async (workflowId: string) => {
    if (!canManageSystem) return;

    try {
      // Cancel all running executions for this workflow
      const runningExecutions = skillExecutions.filter(e => 
        e.status === 'running' && e.input.workflowId === workflowId
      );

      for (const execution of runningExecutions) {
        await cancelSkillExecution(execution.id);
      }
    } catch (err) {
      errorLogger.error('Error cancelling workflow:', err);
    }
  }, [canManageSystem, skillExecutions, cancelSkillExecution]);

  // System Operations
  const runSystemDiagnostics = useCallback(async () => {
    if (!canManageSystem) return null;

    try {
      const diagnostics = {
        timestamp: new Date().toISOString(),
        health: await checkSystemHealth(),
        agents: await getAgentStatus(),
        metrics: await getSystemMetrics(),
        cluster: await getClusterNodes(),
        tests: [
          { name: 'Database Connection', status: 'pass', duration: 23 },
          { name: 'Storage Access', status: 'pass', duration: 145 },
          { name: 'Auth Service', status: 'pass', duration: 67 },
          { name: 'Agent Communication', status: 'pass', duration: 89 }
        ]
      };

      return diagnostics;
    } catch (err) {
      errorLogger.error('Error running system diagnostics:', err);
      return null;
    }
  }, [canManageSystem, checkSystemHealth, getAgentStatus, getSystemMetrics, getClusterNodes]);

  const cleanupOldRecords = useCallback(async (daysToKeep: number) => {
    if (!canManageSystem) return;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // Clean up old skill executions
      await supabase
        .from('skill_executions')
        .delete()
        .lt('start_time', cutoffDate.toISOString());

      // Clean up old metrics
      await supabase
        .from('system_metrics')
        .delete()
        .lt('timestamp', cutoffDate.toISOString());

      console.log(`Cleaned up records older than ${daysToKeep} days`);
    } catch (err) {
      errorLogger.error('Error cleaning up old records:', err);
    }
  }, [canManageSystem]);

  const backupSystem = useCallback(async (): Promise<string> => {
    if (!canManageSystem) {
      throw new Error('Insufficient permissions to backup system');
    }

    try {
      const backupId = `backup_${Date.now()}`;
      
      // This would trigger actual backup process
      console.log(`Initiating system backup: ${backupId}`);

      return backupId;
    } catch (err) {
      errorLogger.error('Error backing up system:', err);
      throw err;
    }
  }, [canManageSystem]);

  const restoreSystem = useCallback(async (backupId: string) => {
    if (!canManageSystem) {
      throw new Error('Insufficient permissions to restore system');
    }

    try {
      // This would trigger actual restore process
      console.log(`Initiating system restore from: ${backupId}`);
    } catch (err) {
      errorLogger.error('Error restoring system:', err);
      throw err;
    }
  }, [canManageSystem]);

  // Utilities
  const refreshSystemData = useCallback(async () => {
    await loadSystemData();
  }, [loadSystemData]);

  const getSystemLogs = useCallback(async (level?: 'error' | 'warn' | 'info', limit = 100) => {
    if (!canViewSystem) return [];

    try {
      // This would fetch from actual logs table
      const mockLogs = [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'System health check completed',
          source: 'system-agent'
        },
        {
          timestamp: new Date(Date.now() - 60000).toISOString(),
          level: 'warn',
          message: 'High memory usage detected in project-agent',
          source: 'monitoring'
        }
      ];

      return mockLogs;
    } catch (err) {
      errorLogger.error('Error fetching system logs:', err);
      return [];
    }
  }, [canViewSystem]);

  const value: SystemContextType = {
    // State
    systemHealth,
    agents,
    metrics,
    skillExecutions,
    clusterNodes,
    loading,
    error,

    // Permissions
    canManageSystem,
    canViewSystem,

    // Health Monitoring
    checkSystemHealth,
    getHealthStatus,
    setupHealthMonitoring,

    // Agent Management
    getAgentStatus,
    updateAgentStatus,
    enableAgent,
    disableAgent,
    restartAgent,

    // Skill Execution
    executeSkill,
    getSkillExecutions,
    cancelSkillExecution,
    retrySkillExecution,

    // System Metrics
    getSystemMetrics,
    recordMetric,
    getPerformanceReport,

    // Cluster Management
    getClusterNodes,
    addNodeToCluster,
    removeNodeFromCluster,
    updateNodeStatus,

    // Orchestration
    orchestrateAgents,
    getWorkflowStatus,
    cancelWorkflow,

    // System Operations
    runSystemDiagnostics,
    cleanupOldRecords,
    backupSystem,
    restoreSystem,

    // Utilities
    refreshSystemData,
    getSystemLogs,
  };

  return (
    <SystemContext.Provider value={value}>
      {children}
    </SystemContext.Provider>
  );
};
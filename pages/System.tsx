import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Monitor, Server, Cpu, HardDrive, Wifi, AlertTriangle, CheckCircle, XCircle, Activity, Settings, RefreshCw, Power, Database, Cloud, Shield, Terminal } from 'lucide-react';
import { useSystemContext } from '../context/SystemContext';
import { useRBACContext } from '../context/RBACContext';
import { SkillsManager } from '../components/SkillsManager';

interface SystemMetric {
  id: string;
  title: string;
  value: string | number;
  unit?: string;
  status: 'healthy' | 'warning' | 'critical';
  trend?: 'up' | 'down' | 'stable';
}

interface AgentStatus {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  lastHeartbeat: string;
  cpu: number;
  memory: number;
  tasks: number;
  errors: number;
  uptime: string;
}

interface SystemAlert {
  id: string;
  timestamp: string;
  type: 'error' | 'warning' | 'info';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  component?: string;
  resolved?: boolean;
}

interface ClusterInfo {
  id: string;
  name: string;
  status: 'active' | 'degraded' | 'offline';
  nodes: number;
  region: string;
  version: string;
  lastSync: string;
}

export const System: React.FC = () => {
  const { 
    systemMetrics,
    agentStatuses,
    systemAlerts,
    clusterInfo,
    getSystemMetrics,
    getAgentStatuses,
    getSystemAlerts,
    getClusterInfo,
    executeAgentCommand,
    restartAgent
  } = useSystemContext();

  const { hasPermission } = useRBACContext();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'alerts' | 'cluster'>('overview');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<SystemMetric[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const loadSystemData = async () => {
      try {
        setLoading(true);
        
        // Load system metrics
        const systemMetrics = await getSystemMetrics();
        setMetrics(systemMetrics || []);

        // Load agent statuses
        const agentStatuses = await getAgentStatuses();
        setAgents(agentStatuses || []);

        // Load system alerts
        const systemAlerts = await getSystemAlerts();
        setAlerts(systemAlerts || []);

        // Load cluster information
        const clusterData = await getClusterInfo();
        setClusters(clusterData || []);

      } catch (error) {
        console.error('Failed to load system data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSystemData();

    // Auto-refresh every 30 seconds
    const interval = autoRefresh ? setInterval(loadSystemData, 30000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'active':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'critical':
      case 'error':
      case 'offline':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'inactive':
        return <Power className="w-5 h-5 text-gray-500" />;
      case 'maintenance':
        return <Settings className="w-5 h-5 text-blue-500" />;
      default:
        return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'active':
        return 'text-green-600 bg-green-50';
      case 'warning':
      case 'degraded':
        return 'text-yellow-600 bg-yellow-50';
      case 'critical':
      case 'error':
      case 'offline':
        return 'text-red-600 bg-red-50';
      case 'inactive':
        return 'text-gray-600 bg-gray-50';
      case 'maintenance':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-blue-600 bg-blue-50';
      case 'info': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const handleAgentAction = async (agentId: string, action: string) => {
    try {
      if (action === 'restart') {
        await restartAgent(agentId);
      } else {
        await executeAgentCommand(agentId, action);
      }
      // Refresh data
      const agentStatuses = await getAgentStatuses();
      setAgents(agentStatuses || []);
    } catch (error) {
      console.error(`Failed to ${action} agent ${agentId}:`, error);
    }
  };

  if (!hasPermission('system', 'view')) {
    return (
      <div className="p-6">
        <Card>
          <div className="text-center py-8">
            <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-600">You don't have permission to access system administration.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Administration</h1>
          <p className="text-gray-600">Monitor and manage system health, agents, and infrastructure</p>
        </div>
        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span>Auto Refresh</span>
          </label>
          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 border-b border-gray-200">
        {[
          { id: 'overview', label: 'Overview', icon: Monitor },
          { id: 'agents', label: 'Agents', icon: Cpu },
          { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
          { id: 'skills', label: 'Skills', icon: Terminal },
          { id: 'cluster', label: 'Cluster', icon: Cloud }
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
          {/* System Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { id: '1', title: 'CPU Usage', value: 45, unit: '%', status: 'healthy', icon: Cpu },
              { id: '2', title: 'Memory Usage', value: 6.2, unit: 'GB', status: 'healthy', icon: HardDrive },
              { id: '3', title: 'Network', value: 125, unit: 'Mbps', status: 'healthy', icon: Wifi },
              { id: '4', title: 'Database', value: 99.9, unit: '%', status: 'healthy', icon: Database }
            ].map(metric => {
              const Icon = metric.icon;
              return (
                <Card key={metric.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{metric.title}</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {metric.value}{metric.unit}
                      </p>
                    </div>
                    <div className="flex items-center space-x-1">
                      {getStatusIcon(metric.status)}
                      <Icon className="w-6 h-6 text-gray-400" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* System Health Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">System Health</h3>
                <div className="space-y-3">
                  {[
                    { component: 'API Gateway', status: 'healthy', uptime: '99.9%' },
                    { component: 'Database', status: 'healthy', uptime: '99.8%' },
                    { component: 'Message Queue', status: 'warning', uptime: '99.5%' },
                    { component: 'File Storage', status: 'healthy', uptime: '99.9%' }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(item.status)}
                        <span className="text-sm font-medium text-gray-900">{item.component}</span>
                      </div>
                      <span className="text-sm text-gray-600">{item.uptime}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Alerts</h3>
                <div className="space-y-3">
                  {alerts.slice(0, 5).map(alert => (
                    <div key={alert.id} className="flex items-start space-x-3">
                      {getStatusIcon(alert.severity)}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                        <p className="text-xs text-gray-500">{alert.timestamp}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(alert.severity)}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Agents Tab */}
      {activeTab === 'agents' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Agent Status</h3>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">
                    {agents.filter(a => a.status === 'active').length} / {agents.length} Active
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map(agent => (
                  <div key={agent.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{agent.name}</h4>
                        <p className="text-xs text-gray-500">Last seen: {agent.lastHeartbeat}</p>
                      </div>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(agent.status)}
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(agent.status)}`}>
                          {agent.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-600">CPU:</span>
                        <span className={`ml-1 font-medium ${
                          agent.cpu > 80 ? 'text-red-600' : agent.cpu > 60 ? 'text-yellow-600' : 'text-green-600'
                        }`}>
                          {agent.cpu}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Memory:</span>
                        <span className={`ml-1 font-medium ${
                          agent.memory > 80 ? 'text-red-600' : agent.memory > 60 ? 'text-yellow-600' : 'text-green-600'
                        }`}>
                          {agent.memory}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Tasks:</span>
                        <span className="ml-1 font-medium">{agent.tasks}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Uptime:</span>
                        <span className="ml-1 font-medium">{agent.uptime}</span>
                      </div>
                    </div>
                    {hasPermission('system', 'manage') && (
                      <div className="mt-3 flex space-x-2">
                        {agent.status === 'active' ? (
                          <button
                            onClick={() => handleAgentAction(agent.id, 'stop')}
                            className="flex-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAgentAction(agent.id, 'start')}
                            className="flex-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            Start
                          </button>
                        )}
                        <button
                          onClick={() => handleAgentAction(agent.id, 'restart')}
                          className="flex-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          Restart
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">System Alerts</h3>
                <div className="flex space-x-2">
                  <button className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                    Clear Resolved
                  </button>
                  <button className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                    Export
                  </button>
                </div>
              </div>
              
              <div className="space-y-3">
                {alerts.map(alert => (
                  <div key={alert.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(alert.severity)}`}>
                            {alert.severity.toUpperCase()}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            alert.type === 'error' ? 'bg-red-100 text-red-800' :
                            alert.type === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {alert.type.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500">{alert.timestamp}</span>
                          {alert.component && (
                            <span className="text-xs text-gray-600">Component: {alert.component}</span>
                          )}
                        </div>
                        <h4 className="text-sm font-medium text-gray-900 mb-1">{alert.title}</h4>
                        <p className="text-sm text-gray-600">{alert.description}</p>
                      </div>
                      <div className="ml-4">
                        {alert.resolved ? (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            RESOLVED
                          </span>
                        ) : (
                          <button className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Skills Tab */}
      {activeTab === 'skills' && (
        <div className="space-y-6">
          <SkillsManager />
        </div>
      )}

      {/* Cluster Tab */}
      {activeTab === 'cluster' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Cluster Management</h3>
                <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Cloud className="w-4 h-4" />
                  <span>Add Cluster</span>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {clusters.map(cluster => (
                  <div key={cluster.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{cluster.name}</h4>
                        <p className="text-xs text-gray-500">{cluster.region} • v{cluster.version}</p>
                      </div>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(cluster.status)}
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(cluster.status)}`}>
                          {cluster.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-600">Nodes:</span>
                        <span className="ml-1 font-medium">{cluster.nodes}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Last Sync:</span>
                        <span className="ml-1 font-medium">{cluster.lastSync}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex space-x-2">
                      <button className="flex-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                        Details
                      </button>
                      <button className="flex-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                        Settings
                      </button>
                    </div>
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
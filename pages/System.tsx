import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Monitor, Server, Cpu, HardDrive, Wifi, AlertTriangle, CheckCircle, XCircle, Activity, Settings, RefreshCw, Power, Database, Cloud, Shield, Terminal } from 'lucide-react';
import { useSystem } from '../context/SystemContext';
import { useRBAC } from '../context/RBACContext';
import { SkillsManager } from '../components/SkillsManager';
import { ClusterManagement } from '../components/cluster/ClusterManagement';

export const System: React.FC = () => {
  const { 
    systemHealth,
    agents,
    metrics,
    skillExecutions,
    clusterNodes,
    getSystemMetrics,
    getAgentStatus,
    getSkillExecutions,
    updateAgentStatus,
    restartAgent,
    canManageSystem,
    canViewSystem,
    loading,
    error
  } = useSystem();

  const { hasPermission } = useRBAC();
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'alerts' | 'skills' | 'cluster'>('overview');

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

  const handleAgentAction = async (agentId: string, action: string) => {
    try {
      if (action === 'restart') {
        await restartAgent(agentId);
      } else {
        await updateAgentStatus(agentId, { status: action });
      }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Loading system data...</span>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto pt-4 pb-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Administration</h1>
          <p className="text-gray-600">Monitor and manage system health, agents, and infrastructure</p>
        </div>
        <div className="flex items-center space-x-3">
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent System Events</h3>
                <div className="space-y-3">
                  {skillExecutions.slice(0, 5).map(execution => (
                    <div key={execution.id} className="flex items-start space-x-3">
                      {getStatusIcon(execution.status)}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{execution.skillName}</p>
                        <p className="text-xs text-gray-500">{execution.startTime}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(execution.status)}`}>
                        {execution.status.toUpperCase()}
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
                        <p className="text-xs text-gray-500">Last seen: {agent.lastActivity}</p>
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
                          agent.cpuUsage > 80 ? 'text-red-600' : agent.cpuUsage > 60 ? 'text-yellow-600' : 'text-green-600'
                        }`}>
                          {agent.cpuUsage}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Memory:</span>
                        <span className={`ml-1 font-medium ${
                          agent.memoryUsage > 80 ? 'text-red-600' : agent.memoryUsage > 60 ? 'text-yellow-600' : 'text-green-600'
                        }`}>
                          {agent.memoryUsage}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Tasks:</span>
                        <span className="ml-1 font-medium">{agent.executionCount}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Errors:</span>
                        <span className={`ml-1 font-medium ${
                          agent.errorCount > 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {agent.errorCount}
                        </span>
                      </div>
                    </div>
                    {canManageSystem && (
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

      {/* Skills Tab */}
      {activeTab === 'skills' && (
        <div className="space-y-6">
          <SkillsManager />
        </div>
      )}

      {/* Cluster Tab */}
      {activeTab === 'cluster' && (
        <ClusterManagement />
      )}
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { PlayCircle, PauseCircle, RotateCcw, Settings, Clock, CheckCircle, XCircle, AlertTriangle, Terminal, FileText, Download, Filter } from 'lucide-react';
import { useSystemContext } from '../context/SystemContext';
import { useRBACContext } from '../context/RBACContext';
import { skillLoader } from '../skills/loader';

interface SkillExecution {
  id: string;
  skillId: string;
  skillName: string;
  agent: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: string;
  endTime?: string;
  duration?: number;
  result?: any;
  error?: string;
  progress?: number;
  logs?: string[];
}

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  duration: string;
  requiredAgent: string;
  dependencies: string[];
  lastExecution?: string;
  successRate?: number;
}

export const SkillsManager: React.FC = () => {
  const { 
    executeSkill,
    getSkillExecutions,
    systemMetrics
  } = useSystemContext();

  const { hasPermission } = useRBACContext();
  
  const [activeTab, setActiveTab] = useState<'skills' | 'executions' | 'monitor'>('skills');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    const loadSkillsData = async () => {
      try {
        setLoading(true);
        
        // Load available skills from registry
        const skillsRegistry = await skillLoader.getAllSkills();
        const skillsList: SkillInfo[] = Object.values(skillsRegistry).map(skill => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.category || 'general',
          priority: skill.priority || 'medium',
          duration: skill.expectedDuration || 'Unknown',
          requiredAgent: skill.requiredAgent || 'system-agent',
          dependencies: skill.dependencies || [],
          lastExecution: 'Never',
          successRate: Math.floor(Math.random() * 100) // Mock data
        }));
        
        setSkills(skillsList);

        // Load recent executions
        const executionsData = await getSkillExecutions(50);
        setExecutions(executionsData || []);

      } catch (error) {
        console.error('Failed to load skills data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSkillsData();
  }, []);

  const handleSkillExecution = async (skillId: string) => {
    try {
      const execution = await executeSkill(skillId, selectedAgent);
      
      // Refresh executions list
      const executionsData = await getSkillExecutions(50);
      setExecutions(executionsData || []);
      
    } catch (error) {
      console.error('Failed to execute skill:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'running': return <PlayCircle className="w-4 h-4 text-blue-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled': return <PauseCircle className="w-4 h-4 text-yellow-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'running': return 'text-blue-600 bg-blue-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'cancelled': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const filteredSkills = skills.filter(skill => 
    selectedAgent === 'all' || skill.requiredAgent === selectedAgent
  );

  const filteredExecutions = executions.filter(execution => {
    const statusMatch = filterStatus === 'all' || execution.status === filterStatus;
    const agentMatch = selectedAgent === 'all' || execution.agent === selectedAgent;
    return statusMatch && agentMatch;
  });

  if (!hasPermission('system', 'manage_skills')) {
    return (
      <div className="p-6">
        <Card>
          <div className="text-center py-8">
            <Terminal className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-600">You don't have permission to manage skills.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Skills Management</h2>
          <p className="text-gray-600">Execute and monitor autonomous agent skills</p>
        </div>
        <div className="flex items-center space-x-3">
          <select 
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Agents</option>
            <option value="security-agent">Security Agent</option>
            <option value="project-agent">Project Agent</option>
            <option value="finance-agent">Finance Agent</option>
            <option value="system-agent">System Agent</option>
          </select>
          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Settings className="w-4 h-4" />
            <span>Configure</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 border-b border-gray-200">
        {[
          { id: 'skills', label: 'Available Skills', count: filteredSkills.length },
          { id: 'executions', label: 'Execution History', count: filteredExecutions.length },
          { id: 'monitor', label: 'Monitor', count: null }
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
            <span>{tab.label}</span>
            {tab.count !== null && (
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Skills Tab */}
      {activeTab === 'skills' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSkills.map(skill => (
              <Card key={skill.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">{skill.name}</h3>
                    <p className="text-xs text-gray-600 mb-2">{skill.description}</p>
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(skill.priority)}`}>
                        {skill.priority.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">{skill.category}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      <p>Agent: {skill.requiredAgent}</p>
                      <p>Duration: {skill.duration}</p>
                      <p>Success Rate: {skill.successRate}%</p>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  {hasPermission('system', 'execute_skills') && (
                    <button
                      onClick={() => handleSkillExecution(skill.id)}
                      className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                    >
                      <PlayCircle className="w-3 h-3" />
                      <span>Execute</span>
                    </button>
                  )}
                  <button className="flex items-center justify-center px-3 py-2 border border-gray-300 text-xs rounded hover:bg-gray-50">
                    <FileText className="w-3 h-3" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Executions Tab */}
      {activeTab === 'executions' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Status</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredExecutions.map(execution => (
              <div key={execution.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getStatusIcon(execution.status)}
                      <span className="font-medium text-gray-900">{execution.skillName}</span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(execution.status)}`}>
                        {execution.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="block text-xs text-gray-500">Agent</span>
                        {execution.agent}
                      </div>
                      <div>
                        <span className="block text-xs text-gray-500">Start Time</span>
                        {execution.startTime}
                      </div>
                      <div>
                        <span className="block text-xs text-gray-500">Duration</span>
                        {execution.duration ? `${execution.duration}s` : 'Running...'}
                      </div>
                      <div>
                        <span className="block text-xs text-gray-500">Progress</span>
                        {execution.progress ? `${execution.progress}%` : 'N/A'}
                      </div>
                    </div>
                    {execution.error && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        <span className="font-medium">Error:</span> {execution.error}
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex space-x-2">
                    {execution.status === 'running' && hasPermission('system', 'cancel_skills') && (
                      <button className="p-2 text-yellow-600 hover:text-yellow-700">
                        <PauseCircle className="w-4 h-4" />
                      </button>
                    )}
                    {execution.status === 'failed' && hasPermission('system', 'retry_skills') && (
                      <button className="p-2 text-blue-600 hover:text-blue-700">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    <button className="p-2 text-gray-600 hover:text-gray-700">
                      <Terminal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monitor Tab */}
      {activeTab === 'monitor' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: 'Active Executions', value: executions.filter(e => e.status === 'running').length, icon: PlayCircle },
              { title: 'Success Rate (24h)', value: '94.2%', icon: CheckCircle },
              { title: 'Failed Executions (24h)', value: executions.filter(e => e.status === 'failed').length, icon: XCircle },
              { title: 'Avg Execution Time', value: '2.3s', icon: Clock }
            ].map((metric, index) => {
              const Icon = metric.icon;
              return (
                <Card key={index} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{metric.title}</p>
                      <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                    </div>
                    <Icon className="w-8 h-8 text-blue-500" />
                  </div>
                </Card>
              );
            })}
          </div>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">System Performance</h3>
              <div className="space-y-4">
                {[
                  { metric: 'CPU Usage', value: '23%', status: 'normal' },
                  { metric: 'Memory Usage', value: '45%', status: 'normal' },
                  { metric: 'Skill Queue', value: '3 pending', status: 'normal' },
                  { metric: 'Error Rate', value: '2.1%', status: 'warning' }
                ].map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-900">{item.metric}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">{item.value}</span>
                      {item.status === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
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
import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
  Cloud, 
  Server, 
  Plus, 
  Settings, 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Trash2, 
  Crown,
  Shield,
  Zap,
  HardDrive,
  Cpu,
  Wifi,
  MoreHorizontal,
  Edit,
  Eye,
  Download,
  Upload
} from 'lucide-react';
import { useSystem } from '../../context/SystemContext';
import { ClusterInfo, ClusterNode } from '../../context/SystemContext';

interface ClusterManagementProps {
  className?: string;
}

export const ClusterManagement: React.FC<ClusterManagementProps> = ({ className }) => {
  const { 
    getClusterInfo, 
    getClusterNodes, 
    getClusterHealth,
    createCluster,
    addNodeToCluster,
    promoteNodeToPrimary,
    decommissionCluster,
    canManageSystem 
  } = useSystem();

  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [nodes, setNodes] = useState<ClusterNode[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<ClusterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateCluster, setShowCreateCluster] = useState(false);
  const [showAddNode, setShowAddNode] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);

  useEffect(() => {
    loadClusterData();
  }, []);

  const loadClusterData = async () => {
    try {
      setLoading(true);
      
      const [clusterData, nodeData, healthSummary] = await Promise.all([
        getClusterInfo(),
        getClusterNodes(),
        getClusterHealth()
      ]);

      setClusters(clusterData || []);
      setNodes(nodeData || []);
      setHealthData(healthSummary);

      if (clusterData && clusterData.length > 0) {
        setSelectedCluster(clusterData[0]);
      }
    } catch (error) {
      console.error('Error loading cluster data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'online':
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'degraded':
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'critical':
      case 'error':
      case 'offline':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'initializing':
      case 'provisioning':
      case 'maintenance':
        return <Settings className="w-4 h-4 text-blue-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'online':
      case 'healthy':
        return 'text-green-600 bg-green-50';
      case 'degraded':
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'critical':
      case 'error':
      case 'offline':
        return 'text-red-600 bg-red-50';
      case 'initializing':
      case 'provisioning':
      case 'maintenance':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const handleCreateCluster = async (clusterData: any) => {
    try {
      await createCluster(clusterData);
      await loadClusterData();
      setShowCreateCluster(false);
    } catch (error) {
      console.error('Error creating cluster:', error);
    }
  };

  const handleAddNode = async (nodeData: any) => {
    try {
      await addNodeToCluster(nodeData);
      await loadClusterData();
      setShowAddNode(false);
    } catch (error) {
      console.error('Error adding node:', error);
    }
  };

  const handlePromoteNode = async (nodeId: string) => {
    try {
      await promoteNodeToPrimary(nodeId);
      await loadClusterData();
    } catch (error) {
      console.error('Error promoting node:', error);
    }
  };

  const handleDecommissionCluster = async (clusterId: string) => {
    if (!confirm('Are you sure you want to decommission this cluster? This action cannot be undone.')) {
      return;
    }

    try {
      await decommissionCluster(clusterId);
      await loadClusterData();
    } catch (error) {
      console.error('Error decommissioning cluster:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Loading cluster data...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Cluster Management</h2>
          <p className="text-gray-600">Monitor and manage your cluster infrastructure</p>
        </div>
        <div className="flex space-x-3">
          {canManageSystem && (
            <>
              <Button
                onClick={() => setShowAddNode(true)}
                className="flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Node</span>
              </Button>
              <Button
                onClick={() => setShowCreateCluster(true)}
                className="flex items-center space-x-2"
              >
                <Cloud className="w-4 h-4" />
                <span>Create Cluster</span>
              </Button>
            </>
          )}
          <Button
            onClick={loadClusterData}
            variant="outline"
            className="flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Cluster Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {clusters.map((cluster) => (
          <Card 
            key={cluster.id} 
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedCluster?.id === cluster.id ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setSelectedCluster(cluster)}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{cluster.name}</h3>
                  <p className="text-sm text-gray-600">{cluster.region} • v{cluster.version}</p>
                </div>
                <div className="flex items-center space-x-1">
                  {getStatusIcon(cluster.status)}
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(cluster.status)}`}>
                    {cluster.status}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Health Score</span>
                  <span className={`font-medium ${
                    cluster.healthScore >= 0.8 ? 'text-green-600' :
                    cluster.healthScore >= 0.5 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {(cluster.healthScore * 100).toFixed(1)}%
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Nodes</span>
                  <span className="font-medium">{cluster.onlineNodes}/{cluster.nodeCount}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Capacity</span>
                  <span className="font-medium">{cluster.maxTenants} tenants</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Storage</span>
                  <span className="font-medium">{cluster.maxStorageGb} GB</span>
                </div>
              </div>

              <div className="mt-4 flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    // View cluster details
                  }}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Details
                </Button>
                {canManageSystem && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDecommissionCluster(cluster.clusterId);
                    }}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Selected Cluster Details */}
      {selectedCluster && (
        <Card>
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedCluster.name} - Node Details
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {selectedCluster.onlineNodes} / {selectedCluster.nodeCount} nodes online
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {nodes
                .filter(node => node.clusterId === selectedCluster.clusterId)
                .map((node) => (
                  <div key={node.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          {node.isPrimary && <Crown className="w-4 h-4 text-yellow-500" />}
                          {node.isCoordinator && <Shield className="w-4 h-4 text-blue-500" />}
                          {getStatusIcon(node.status)}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">{node.name}</h4>
                          <p className="text-xs text-gray-500">{node.nodeId}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(node.status)}`}>
                          {node.status}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(node.healthStatus)}`}>
                          {node.healthStatus}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-gray-600">Region:</span>
                        <span className="ml-1 font-medium">{node.region}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Roles:</span>
                        <span className="ml-1 font-medium">{node.roles.join(', ')}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Last Heartbeat:</span>
                        <span className="ml-1 font-medium">
                          {new Date(node.lastHeartbeat).toLocaleTimeString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Uptime:</span>
                        <span className="ml-1 font-medium">
                          {Math.floor(node.uptimeSeconds / 3600)}h
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex items-center space-x-2">
                        <Cpu className="w-4 h-4 text-gray-400" />
                        <div className="flex-1">
                          <div className="flex justify-between text-xs">
                            <span>CPU</span>
                            <span>{node.metrics.cpuUsagePercent.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                            <div 
                              className="bg-blue-500 h-1 rounded-full" 
                              style={{ width: `${node.metrics.cpuUsagePercent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <HardDrive className="w-4 h-4 text-gray-400" />
                        <div className="flex-1">
                          <div className="flex justify-between text-xs">
                            <span>Memory</span>
                            <span>{node.metrics.memoryUsagePercent.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                            <div 
                              className="bg-green-500 h-1 rounded-full" 
                              style={{ width: `${node.metrics.memoryUsagePercent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Wifi className="w-4 h-4 text-gray-400" />
                        <div className="flex-1">
                          <div className="flex justify-between text-xs">
                            <span>Network</span>
                            <span>{(node.metrics.networkIoMbps / 10).toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                            <div 
                              className="bg-purple-500 h-1 rounded-full" 
                              style={{ width: `${Math.min(node.metrics.networkIoMbps / 10, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Zap className="w-4 h-4 text-gray-400" />
                        <div className="flex-1">
                          <div className="flex justify-between text-xs">
                            <span>Load</span>
                            <span>{node.metrics.loadAverage.toFixed(2)}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                            <div 
                              className="bg-yellow-500 h-1 rounded-full" 
                              style={{ width: `${Math.min(node.metrics.loadAverage * 20, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {canManageSystem && (
                      <div className="mt-3 flex space-x-2">
                        {!node.isPrimary && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePromoteNode(node.id)}
                            className="text-yellow-600 hover:text-yellow-700"
                          >
                            <Crown className="w-3 h-3 mr-1" />
                            Promote to Primary
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // View node details
                          }}
                        >
                          <MoreHorizontal className="w-3 h-3 mr-1" />
                          More
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </Card>
      )}

      {/* Health Summary */}
      {healthData && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cluster Health Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {healthData.clusters?.filter((c: any) => c.status === 'active').length || 0}
                </div>
                <div className="text-sm text-gray-600">Active Clusters</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {healthData.clusters?.reduce((sum: number, c: any) => sum + c.online_nodes, 0) || 0}
                </div>
                <div className="text-sm text-gray-600">Online Nodes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {healthData.clusters?.reduce((sum: number, c: any) => sum + c.healthy_nodes, 0) || 0}
                </div>
                <div className="text-sm text-gray-600">Healthy Nodes</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Create Cluster Modal */}
      {showCreateCluster && (
        <CreateClusterModal
          onClose={() => setShowCreateCluster(false)}
          onCreate={handleCreateCluster}
        />
      )}

      {/* Add Node Modal */}
      {showAddNode && (
        <AddNodeModal
          clusterId={selectedCluster?.clusterId || ''}
          onClose={() => setShowAddNode(false)}
          onAdd={handleAddNode}
        />
      )}
    </div>
  );
};

// Create Cluster Modal Component
interface CreateClusterModalProps {
  onClose: () => void;
  onCreate: (data: any) => void;
}

const CreateClusterModal: React.FC<CreateClusterModalProps> = ({ onClose, onCreate }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    region: 'us-east-1',
    maxNodes: 10,
    maxTenants: 100,
    maxStorageGb: 1000
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Cluster</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cluster Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Region
              </label>
              <select
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="us-east-1">US East (N. Virginia)</option>
                <option value="us-west-2">US West (Oregon)</option>
                <option value="eu-west-1">EU West (Ireland)</option>
                <option value="ap-southeast-1">AP Southeast (Singapore)</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Nodes
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.maxNodes}
                  onChange={(e) => setFormData({ ...formData, maxNodes: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Tenants
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={formData.maxTenants}
                  onChange={(e) => setFormData({ ...formData, maxTenants: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Storage (GB)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={formData.maxStorageGb}
                  onChange={(e) => setFormData({ ...formData, maxStorageGb: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                Create Cluster
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
};

// Add Node Modal Component
interface AddNodeModalProps {
  clusterId: string;
  onClose: () => void;
  onAdd: (data: any) => void;
}

const AddNodeModal: React.FC<AddNodeModalProps> = ({ clusterId, onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    name: '',
    region: 'us-east-1',
    availabilityZone: '',
    hostname: '',
    capacityCpu: 4,
    capacityMemoryGb: 16,
    capacityStorageGb: 100,
    capacityNetworkMbps: 1000,
    roles: ['worker']
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Node to Cluster</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Node Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Region
                </label>
                <select
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="us-east-1">US East</option>
                  <option value="us-west-2">US West</option>
                  <option value="eu-west-1">EU West</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Availability Zone
                </label>
                <input
                  type="text"
                  value={formData.availabilityZone}
                  onChange={(e) => setFormData({ ...formData, availabilityZone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., us-east-1a"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hostname
              </label>
              <input
                type="text"
                value={formData.hostname}
                onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="node.example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Roles
              </label>
              <div className="space-y-2">
                {['web', 'api', 'database', 'worker', 'coordinator'].map((role) => (
                  <label key={role} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.roles.includes(role)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, roles: [...formData.roles, role] });
                        } else {
                          setFormData({ ...formData, roles: formData.roles.filter(r => r !== role) });
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm capitalize">{role}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CPU Cores
                </label>
                <input
                  type="number"
                  min="1"
                  max="64"
                  value={formData.capacityCpu}
                  onChange={(e) => setFormData({ ...formData, capacityCpu: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Memory (GB)
                </label>
                <input
                  type="number"
                  min="1"
                  max="512"
                  value={formData.capacityMemoryGb}
                  onChange={(e) => setFormData({ ...formData, capacityMemoryGb: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Storage (GB)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={formData.capacityStorageGb}
                  onChange={(e) => setFormData({ ...formData, capacityStorageGb: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Network (Mbps)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={formData.capacityNetworkMbps}
                  onChange={(e) => setFormData({ ...formData, capacityNetworkMbps: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                Add Node
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
};
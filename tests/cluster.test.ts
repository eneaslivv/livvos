// Cluster Management Tests
// Tests for cluster ID generation, validation, and management functions

import { 
  ClusterIdManager,
  ClusterConfigManager,
  ClusterHealthCalculator,
  ClusterCoordinationManager,
  ClusterMetricsCollector,
  ClusterInfo,
  ClusterNode,
  ClusterStatus,
  NodeStatus,
  NodeHealthStatus
} from '../lib/cluster';

// Mock data for testing
const mockCluster: ClusterInfo = {
  id: 'cluster-uuid-001',
  clusterId: 'cluster-test123-2026-01-21-12-00-00-abcdef12',
  name: 'Test Cluster',
  description: 'Test cluster for unit testing',
  region: 'us-east-1',
  version: '1.0.0',
  status: 'active',
  config: {
    maxNodes: 10,
    maxTenants: 100,
    maxStorageGb: 1000,
    backupRetentionDays: 30,
    healthCheckInterval: 30,
    autoScaling: false,
    highAvailability: true,
    encryptionEnabled: true,
    monitoringEnabled: true
  },
  metadata: {
    deploymentType: 'single-tenant',
    environment: 'test',
    createdBy: 'test-user',
    provisionedBy: 'system',
    tags: ['test'],
    labels: { environment: 'test' }
  },
  maxNodes: 10,
  maxTenants: 100,
  maxStorageGb: 1000,
  healthScore: 1.0,
  lastHealthCheck: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  activatedAt: new Date().toISOString(),
  tags: ['test'],
  labels: { environment: 'test' },
  nodeCount: 3,
  onlineNodes: 3,
  healthyNodes: 3,
  coordinationStatus: {
    status: 'healthy',
    primaryNode: undefined,
    coordinatorNode: undefined,
    issues: []
  }
};

const mockNodes: ClusterNode[] = [
  {
    id: 'node-uuid-001',
    nodeId: 'node-test123-1-12345678',
    name: 'Primary Node',
    status: 'online',
    healthStatus: 'healthy',
    region: 'us-east-1',
    availabilityZone: 'us-east-1a',
    hostname: 'primary-node.test.local',
    capacity: {
      cpu: 8.0,
      memoryGb: 32.0,
      storageGb: 500.0,
      networkMbps: 1000.0
    },
    usage: {
      cpu: 4.0,
      memoryGb: 16.0,
      storageGb: 250.0,
      networkMbps: 500.0
    },
    roles: ['web', 'api', 'database', 'coordinator'],
    capabilities: { autoFailover: true },
    metrics: {
      loadAverage: 0.5,
      cpuUsagePercent: 50.0,
      memoryUsagePercent: 50.0,
      diskUsagePercent: 50.0,
      networkIoMbps: 500.0
    },
    isPrimary: true,
    isCoordinator: true,
    priority: 100,
    lastHeartbeat: new Date().toISOString(),
    uptimeSeconds: 86400,
    config: { role: 'primary' },
    metadata: { nodeType: 'primary' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'node-uuid-002',
    nodeId: 'node-test123-2-87654321',
    name: 'Worker Node 1',
    status: 'online',
    healthStatus: 'healthy',
    region: 'us-east-1',
    availabilityZone: 'us-east-1b',
    hostname: 'worker-node-1.test.local',
    capacity: {
      cpu: 4.0,
      memoryGb: 16.0,
      storageGb: 250.0,
      networkMbps: 500.0
    },
    usage: {
      cpu: 2.0,
      memoryGb: 8.0,
      storageGb: 125.0,
      networkMbps: 250.0
    },
    roles: ['worker'],
    capabilities: { specializedProcessing: true },
    metrics: {
      loadAverage: 0.25,
      cpuUsagePercent: 50.0,
      memoryUsagePercent: 50.0,
      diskUsagePercent: 50.0,
      networkIoMbps: 500.0
    },
    isPrimary: false,
    isCoordinator: false,
    priority: 50,
    lastHeartbeat: new Date().toISOString(),
    uptimeSeconds: 43200,
    config: { role: 'worker' },
    metadata: { nodeType: 'worker' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// ClusterIdManager Tests
describe('ClusterIdManager', () => {
  describe('generateClusterId', () => {
    it('should generate a valid cluster ID format', () => {
      const clusterId = ClusterIdManager.generateClusterId();
      
      expect(clusterId).toMatch(/^cluster-[a-z0-9]{8}-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-[a-z0-9]{8}$/);
      expect(clusterId).toHaveLength(37); // Expected length
    });

    it('should generate unique cluster IDs', () => {
      const id1 = ClusterIdManager.generateClusterId();
      const id2 = ClusterIdManager.generateClusterId();
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateNodeId', () => {
    it('should generate a valid node ID format', () => {
      const clusterId = 'cluster-test123-2026-01-21-12-00-00-abcdef12';
      const nodeId = ClusterIdManager.generateNodeId(clusterId, 1);
      
      expect(nodeId).toMatch(/^node-test123-\d+-[a-z0-9]{8}$/);
      expect(nodeId).toContain('test123-1');
    });

    it('should generate unique node IDs', () => {
      const clusterId = 'cluster-test123-2026-01-21-12-00-00-abcdef12';
      const id1 = ClusterIdManager.generateNodeId(clusterId, 1);
      const id2 = ClusterIdManager.generateNodeId(clusterId, 2);
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('validateClusterId', () => {
    it('should validate correct cluster ID format', () => {
      const validId = 'cluster-test123-2026-01-21-12-00-00-abcdef12';
      
      expect(ClusterIdManager.validateClusterId(validId)).toBe(true);
    });

    it('should reject invalid cluster ID format', () => {
      const invalidIds = [
        'invalid-cluster-id',
        'cluster-invalid',
        'cluster-test123-2026-01-21-12-00-00',
        'CLUSTER-test123-2026-01-21-12-00-00-abcdef12'
      ];
      
      invalidIds.forEach(id => {
        expect(ClusterIdManager.validateClusterId(id)).toBe(false);
      });
    });
  });

  describe('parseClusterId', () => {
    it('should parse valid cluster ID', () => {
      const clusterId = 'cluster-test123-2026-01-21-12-00-00-abcdef12';
      const parsed = ClusterIdManager.parseClusterId(clusterId);
      
      expect(parsed).not.toBeNull();
      expect(parsed?.random1).toBe('test123');
      expect(parsed?.timestamp).toBe('2026-01-21T12:00:00');
      expect(parsed?.random2).toBe('abcdef12');
      expect(parsed?.createdAt).toBeInstanceOf(Date);
    });

    it('should return null for invalid cluster ID', () => {
      const parsed = ClusterIdManager.parseClusterId('invalid-id');
      
      expect(parsed).toBeNull();
    });
  });
});

// ClusterConfigManager Tests
describe('ClusterConfigManager', () => {
  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      const config = ClusterConfigManager.getDefaultConfig();
      
      expect(config.maxNodes).toBe(10);
      expect(config.maxTenants).toBe(100);
      expect(config.maxStorageGb).toBe(1000);
      expect(config.backupRetentionDays).toBe(30);
      expect(config.autoScaling).toBe(false);
      expect(config.highAvailability).toBe(true);
      expect(config.encryptionEnabled).toBe(true);
      expect(config.monitoringEnabled).toBe(true);
    });
  });

  describe('getConfigTemplate', () => {
    it('should return development template', () => {
      const config = ClusterConfigManager.getConfigTemplate('development');
      
      expect(config.maxNodes).toBe(3);
      expect(config.maxTenants).toBe(10);
      expect(config.maxStorageGb).toBe(100);
      expect(config.backupRetentionDays).toBe(7);
      expect(config.autoScaling).toBe(false);
      expect(config.highAvailability).toBe(false);
    });

    it('should return staging template', () => {
      const config = ClusterConfigManager.getConfigTemplate('staging');
      
      expect(config.maxNodes).toBe(5);
      expect(config.maxTenants).toBe(50);
      expect(config.maxStorageGb).toBe(500);
      expect(config.backupRetentionDays).toBe(14);
      expect(config.autoScaling).toBe(false);
      expect(config.highAvailability).toBe(true);
    });

    it('should return production template', () => {
      const config = ClusterConfigManager.getConfigTemplate('production');
      
      expect(config.maxNodes).toBe(20);
      expect(config.maxTenants).toBe(1000);
      expect(config.maxStorageGb).toBe(10000);
      expect(config.backupRetentionDays).toBe(90);
      expect(config.autoScaling).toBe(true);
      expect(config.highAvailability).toBe(true);
    });
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      const config = {
        maxNodes: 10,
        maxTenants: 100,
        maxStorageGb: 1000,
        backupRetentionDays: 30,
        healthCheckInterval: 30
      };
      
      const result = ClusterConfigManager.validateConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid configuration', () => {
      const config = {
        maxNodes: 0,
        maxTenants: -1,
        maxStorageGb: 0,
        backupRetentionDays: -5,
        healthCheckInterval: 2
      };
      
      const result = ClusterConfigManager.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('maxNodes must be at least 1');
      expect(result.errors).toContain('maxTenants must be at least 1');
      expect(result.errors).toContain('maxStorageGb must be at least 1');
      expect(result.errors).toContain('backupRetentionDays must be at least 1');
      expect(result.errors).toContain('healthCheckInterval must be at least 5 seconds');
    });
  });
});

// ClusterHealthCalculator Tests
describe('ClusterHealthCalculator', () => {
  describe('calculateClusterHealth', () => {
    it('should calculate perfect health score', () => {
      const healthyNodes = mockNodes.map(node => ({
        ...node,
        status: 'online' as NodeStatus,
        healthStatus: 'healthy' as NodeHealthStatus
      }));
      
      const score = ClusterHealthCalculator.calculateClusterHealth(healthyNodes);
      
      expect(score).toBe(1.0);
    });

    it('should calculate degraded health score', () => {
      const degradedNodes = [
        { ...mockNodes[0], status: 'online', healthStatus: 'healthy' },
        { ...mockNodes[1], status: 'online', healthStatus: 'warning' },
        { ...mockNodes[1], status: 'offline', healthStatus: 'critical' }
      ];
      
      const score = ClusterHealthCalculator.calculateClusterHealth(degradedNodes);
      
      expect(score).toBeLessThan(1.0);
      expect(score).toBeGreaterThan(0.0);
    });

    it('should return 0 for empty node list', () => {
      const score = ClusterHealthCalculator.calculateClusterHealth([]);
      
      expect(score).toBe(0.0);
    });
  });

  describe('getClusterStatus', () => {
    it('should return active for high health score', () => {
      const status = ClusterHealthCalculator.getClusterStatus(0.95);
      
      expect(status).toBe('active');
    });

    it('should return degraded for medium health score', () => {
      const status = ClusterHealthCalculator.getClusterStatus(0.75);
      
      expect(status).toBe('degraded');
    });

    it('should return maintenance for low health score', () => {
      const status = ClusterHealthCalculator.getClusterStatus(0.5);
      
      expect(status).toBe('maintenance');
    });

    it('should return offline for very low health score', () => {
      const status = ClusterHealthCalculator.getClusterStatus(0.2);
      
      expect(status).toBe('offline');
    });
  });

  describe('calculateNodeHealth', () => {
    it('should return healthy for normal usage', () => {
      const healthyNode = {
        ...mockNodes[0],
        metrics: {
          cpuUsagePercent: 50,
          memoryUsagePercent: 60,
          diskUsagePercent: 70
        },
        capacity: {
          cpu: 8.0,
          memoryGb: 32.0,
          storageGb: 500.0
        },
        usage: {
          cpu: 4.0,
          memoryGb: 19.2,
          storageGb: 350.0
        }
      };
      
      const health = ClusterHealthCalculator.calculateNodeHealth(healthyNode);
      
      expect(health).toBe('healthy');
    });

    it('should return critical for high usage', () => {
      const criticalNode = {
        ...mockNodes[0],
        metrics: {
          cpuUsagePercent: 95,
          memoryUsagePercent: 92,
          diskUsagePercent: 98
        }
      };
      
      const health = ClusterHealthCalculator.calculateNodeHealth(criticalNode);
      
      expect(health).toBe('critical');
    });
  });

  describe('generateHealthRecommendations', () => {
    it('should generate recommendations for unhealthy cluster', () => {
      const unhealthyNodes = [
        { ...mockNodes[0], status: 'offline' },
        { ...mockNodes[1], metrics: { cpuUsagePercent: 85 } },
        { ...mockNodes[1], metrics: { memoryUsagePercent: 90 } },
        { ...mockNodes[1], metrics: { diskUsagePercent: 95 } }
      ];
      
      const recommendations = ClusterHealthCalculator.generateHealthRecommendations(unhealthyNodes);
      
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations).toContain('1 node(s) are offline and should be investigated');
      expect(recommendations).toContain('1 node(s) have high CPU usage (>80%)');
      expect(recommendations).toContain('1 node(s) have high memory usage (>85%)');
      expect(recommendations).toContain('1 node(s) have high disk usage (>90%)');
    });

    it('should return empty recommendations for healthy cluster', () => {
      const recommendations = ClusterHealthCalculator.generateHealthRecommendations(mockNodes);
      
      expect(recommendations).toHaveLength(0);
    });
  });
});

// ClusterCoordinationManager Tests
describe('ClusterCoordinationManager', () => {
  describe('selectPrimaryNode', () => {
    it('should select node with highest priority', () => {
      const nodes = [
        { ...mockNodes[0], isPrimary: false, priority: 50 },
        { ...mockNodes[1], isPrimary: false, priority: 100 },
        { ...mockNodes[1], isPrimary: false, priority: 75 }
      ];
      
      const primary = ClusterCoordinationManager.selectPrimaryNode(nodes);
      
      expect(primary).toBeDefined();
      expect(primary?.priority).toBe(100);
    });

    it('should prefer healthy nodes', () => {
      const nodes = [
        { ...mockNodes[0], isPrimary: false, priority: 100, healthStatus: 'warning' },
        { ...mockNodes[1], isPrimary: false, priority: 90, healthStatus: 'healthy' }
      ];
      
      const primary = ClusterCoordinationManager.selectPrimaryNode(nodes);
      
      expect(primary).toBeDefined();
      expect(primary?.healthStatus).toBe('healthy');
    });

    it('should return null for offline nodes', () => {
      const offlineNodes = mockNodes.map(node => ({
        ...node,
        status: 'offline' as NodeStatus
      }));
      
      const primary = ClusterCoordinationManager.selectPrimaryNode(offlineNodes);
      
      expect(primary).toBeNull();
    });
  });

  describe('selectCoordinatorNode', () => {
    it('should select node with coordinator role', () => {
      const nodes = [
        { ...mockNodes[0], isCoordinator: false, roles: ['worker'] },
        { ...mockNodes[1], isCoordinator: false, roles: ['coordinator'] }
      ];
      
      const coordinator = ClusterCoordinationManager.selectCoordinatorNode(nodes);
      
      expect(coordinator).toBeDefined();
      expect(coordinator?.roles).toContain('coordinator');
    });

    it('should fallback to highest priority node', () => {
      const nodes = [
        { ...mockNodes[0], isCoordinator: false, priority: 50, roles: ['worker'] },
        { ...mockNodes[1], isCoordinator: false, priority: 100, roles: ['worker'] }
      ];
      
      const coordinator = ClusterCoordinationManager.selectCoordinatorNode(nodes);
      
      expect(coordinator).toBeDefined();
      expect(coordinator?.priority).toBe(100);
    });
  });

  describe('checkCoordinationStatus', () => {
    it('should return healthy status for good coordination', () => {
      const status = ClusterCoordinationManager.checkCoordinationStatus(mockCluster, mockNodes);
      
      expect(status.status).toBe('healthy');
      expect(status.primaryNode).toBeDefined();
      expect(status.coordinatorNode).toBeDefined();
      expect(status.issues).toHaveLength(0);
    });

    it('should return degraded status with issues', () => {
      const unhealthyNodes = [
        { ...mockNodes[0], isPrimary: false, isCoordinator: false },
        { ...mockNodes[1], status: 'offline' }
      ];
      
      const status = ClusterCoordinationManager.checkCoordinationStatus(mockCluster, unhealthyNodes);
      
      expect(status.status).toBe('critical');
      expect(status.issues.length).toBeGreaterThan(0);
      expect(status.issues).toContain('No online primary node found');
    });
  });
});

// ClusterMetricsCollector Tests
describe('ClusterMetricsCollector', () => {
  describe('collectSystemMetrics', () => {
    it('should collect metrics from nodes', () => {
      const metrics = ClusterMetricsCollector.collectSystemMetrics(mockNodes);
      
      expect(metrics.totalCpu).toBe(12.0);
      expect(metrics.totalMemory).toBe(48.0);
      expect(metrics.totalStorage).toBe(750.0);
      expect(metrics.totalNetwork).toBe(1500.0);
      expect(metrics.usedCpu).toBe(6.0);
      expect(metrics.usedMemory).toBe(24.0);
      expect(metrics.usedStorage).toBe(375.0);
      expect(metrics.usedNetwork).toBe(750.0);
    });

    it('should return zeros for empty node list', () => {
      const metrics = ClusterMetricsCollector.collectSystemMetrics([]);
      
      expect(metrics.totalCpu).toBe(0);
      expect(metrics.totalMemory).toBe(0);
      expect(metrics.totalStorage).toBe(0);
      expect(metrics.totalNetwork).toBe(0);
      expect(metrics.usedCpu).toBe(0);
      expect(metrics.usedMemory).toBe(0);
      expect(metrics.usedStorage).toBe(0);
      expect(metrics.usedNetwork).toBe(0);
    });
  });

  describe('generatePerformanceMetrics', () => {
    it('should calculate performance metrics', () => {
      const performance = ClusterMetricsCollector.generatePerformanceMetrics(mockCluster, mockNodes);
      
      expect(performance.clusterUtilization).toBeGreaterThan(0);
      expect(performance.clusterUtilization).toBeLessThan(1);
      expect(performance.nodeUtilization).toBe(1.0);
      expect(performance.healthScore).toBe(1.0);
      expect(performance.performanceScore).toBeGreaterThan(0);
      expect(performance.efficiency).toBeGreaterThan(0);
    });
  });
});

// Integration Tests
describe('Cluster Management Integration', () => {
  it('should handle complete cluster lifecycle', () => {
    // Generate cluster ID
    const clusterId = ClusterIdManager.generateClusterId();
    expect(ClusterIdManager.validateClusterId(clusterId)).toBe(true);

    // Get configuration template
    const config = ClusterConfigManager.getConfigTemplate('production');
    expect(config.autoScaling).toBe(true);

    // Validate configuration
    const validation = ClusterConfigManager.validateConfig(config);
    expect(validation.isValid).toBe(true);

    // Generate node IDs
    const nodeId1 = ClusterIdManager.generateNodeId(clusterId, 1);
    const nodeId2 = ClusterIdManager.generateNodeId(clusterId, 2);
    expect(ClusterIdManager.validateNodeId(nodeId1)).toBe(true);
    expect(ClusterIdManager.validateNodeId(nodeId2)).toBe(true);

    // Parse and verify cluster info
    const parsed = ClusterIdManager.parseClusterId(clusterId);
    expect(parsed).not.toBeNull();
    expect(parsed?.createdAt).toBeInstanceOf(Date);
  });

  it('should handle health monitoring workflow', () => {
    // Calculate cluster health
    const healthScore = ClusterHealthCalculator.calculateClusterHealth(mockNodes);
    expect(healthScore).toBe(1.0);

    const status = ClusterHealthCalculator.getClusterStatus(healthScore);
    expect(status).toBe('active');

    // Generate recommendations (should be none for healthy cluster)
    const recommendations = ClusterHealthCalculator.generateHealthRecommendations(mockNodes);
    expect(recommendations).toHaveLength(0);

    // Check coordination status
    const coordination = ClusterCoordinationManager.checkCoordinationStatus(mockCluster, mockNodes);
    expect(coordination.status).toBe('healthy');
    expect(coordination.issues).toHaveLength(0);
  });
});

export {
  mockCluster,
  mockNodes
};
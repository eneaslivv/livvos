// Cluster Management Utilities
// Provides functions for cluster ID generation, validation, and management

// import { v4 as uuidv4 } from 'uuid'; // Not needed for this implementation

// Cluster Types
export interface ClusterConfig {
  maxNodes: number;
  maxTenants: number;
  maxStorageGb: number;
  backupRetentionDays: number;
  healthCheckInterval: number;
  autoScaling: boolean;
  highAvailability: boolean;
  encryptionEnabled: boolean;
  monitoringEnabled: boolean;
}

export interface ClusterMetadata {
  deploymentType: 'single-tenant' | 'multi-tenant';
  environment: 'development' | 'staging' | 'production';
  createdBy: string;
  provisionedBy: string;
  tags: string[];
  labels: Record<string, string>;
}

export interface NodeConfig {
  role: string;
  autoFailover: boolean;
  backupResponsible: boolean;
  maxConnections: number;
  connectionTimeout: number;
  healthCheckPath: string;
  metricsPort: number;
}

export interface NodeMetadata {
  nodeType: 'primary' | 'secondary' | 'worker' | 'coordinator';
  deploymentType: 'single-tenant' | 'multi-tenant';
  provisionedBy: string;
  instanceType: string;
  imageId: string;
}

export interface ClusterInfo {
  id: string;
  clusterId: string;
  name: string;
  description?: string;
  region: string;
  version: string;
  status: ClusterStatus;
  config: ClusterConfig;
  metadata: ClusterMetadata;
  healthScore: number;
  lastHealthCheck: string;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  decommissionedAt?: string;
  tags: string[];
  labels: Record<string, string>;
}

export interface NodeInfo {
  id: string;
  clusterId: string;
  nodeId: string;
  name: string;
  status: NodeStatus;
  healthStatus: NodeHealthStatus;
  region: string;
  availabilityZone?: string;
  privateIp?: string;
  publicIp?: string;
  hostname?: string;
  capacity: {
    cpu: number;
    memoryGb: number;
    storageGb: number;
    networkMbps: number;
  };
  usage: {
    cpu: number;
    memoryGb: number;
    storageGb: number;
    networkMbps: number;
  };
  roles: string[];
  capabilities: Record<string, any>;
  metrics: {
    loadAverage: number;
    cpuUsagePercent: number;
    memoryUsagePercent: number;
    diskUsagePercent: number;
    networkIoMbps: number;
  };
  isPrimary: boolean;
  isCoordinator: boolean;
  priority: number;
  lastHeartbeat: string;
  lastRestart?: string;
  uptimeSeconds: number;
  config: NodeConfig;
  metadata: NodeMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface ClusterEvent {
  id: string;
  clusterId: string;
  nodeId?: string;
  eventType: string;
  eventCategory: EventCategory;
  severity: EventSeverity;
  title: string;
  description?: string;
  details: Record<string, any>;
  sourceAgent?: string;
  sourceNode?: string;
  userId?: string;
  status: EventStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  parentEventId?: string;
  correlationId?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  tags: string[];
  metadata: Record<string, any>;
}

export interface ClusterMetric {
  id: string;
  clusterId: string;
  nodeId?: string;
  metricName: string;
  metricCategory: string;
  metricType: MetricType;
  value: number;
  unit?: string;
  dimensions: Record<string, string>;
  labels: Record<string, string>;
  collectionMethod: string;
  sourceAgent?: string;
  timestamp: string;
  createdAt: string;
}

// Enums
export type ClusterStatus = 
  | 'initializing' 
  | 'active' 
  | 'degraded' 
  | 'maintenance' 
  | 'offline' 
  | 'decommissioning';

export type NodeStatus = 
  | 'provisioning' 
  | 'online' 
  | 'offline' 
  | 'maintenance' 
  | 'error' 
  | 'decommissioning';

export type NodeHealthStatus = 
  | 'healthy' 
  | 'warning' 
  | 'critical' 
  | 'unknown';

export type EventCategory = 
  | 'system' 
  | 'health' 
  | 'coordination' 
  | 'security' 
  | 'lifecycle' 
  | 'configuration';

export type EventSeverity = 
  | 'debug' 
  | 'info' 
  | 'warning' 
  | 'error' 
  | 'critical';

export type EventStatus = 
  | 'new' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export type MetricType = 
  | 'counter' 
  | 'gauge' 
  | 'histogram' 
  | 'timer';

// Cluster ID Generation and Validation
export class ClusterIdManager {
  private static readonly CLUSTER_ID_PATTERN = /^cluster-[a-z0-9]{8}-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-[a-z0-9]{8}$/;
  private static readonly NODE_ID_PATTERN = /^node-[a-z0-9]{8}-\d+-[a-z0-9]{8}$/;

  /**
   * Generate a unique cluster ID
   * Format: cluster-<random>-<timestamp>-<random>
   */
  static generateClusterId(): string {
    const random1 = this.generateRandomString(8);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const random2 = this.generateRandomString(8);
    
    return `cluster-${random1}-${timestamp}-${random2}`;
  }

  /**
   * Generate a unique node ID for a cluster
   * Format: node-<cluster-suffix>-<number>-<random>
   */
  static generateNodeId(clusterId: string, nodeNumber: number): string {
    const clusterSuffix = clusterId.replace('cluster-', '').split('-').slice(0, 2).join('-');
    const random = this.generateRandomString(8);
    
    return `node-${clusterSuffix}-${nodeNumber}-${random}`;
  }

  /**
   * Validate cluster ID format
   */
  static validateClusterId(clusterId: string): boolean {
    return this.CLUSTER_ID_PATTERN.test(clusterId);
  }

  /**
   * Validate node ID format
   */
  static validateNodeId(nodeId: string): boolean {
    return this.NODE_ID_PATTERN.test(nodeId);
  }

  /**
   * Extract cluster information from cluster ID
   */
  static parseClusterId(clusterId: string): {
    random1: string;
    timestamp: string;
    random2: string;
    createdAt: Date;
  } | null {
    if (!this.validateClusterId(clusterId)) {
      return null;
    }

    const parts = clusterId.split('-');
    const timestamp = `${parts[2]}-${parts[3]}-${parts[4]}T${parts[5]}:${parts[6]}:${parts[7]}`;

    return {
      random1: parts[1],
      timestamp,
      random2: parts[8],
      createdAt: new Date(timestamp)
    };
  }

  /**
   * Extract node information from node ID
   */
  static parseNodeId(nodeId: string): {
    clusterSuffix: string;
    nodeNumber: number;
    random: string;
  } | null {
    if (!this.validateNodeId(nodeId)) {
      return null;
    }

    const parts = nodeId.split('-');
    const clusterSuffix = `${parts[1]}-${parts[2]}`;
    const nodeNumber = parseInt(parts[3], 10);
    const random = parts[4];

    return {
      clusterSuffix,
      nodeNumber,
      random
    };
  }

  /**
   * Generate a random string
   */
  private static generateRandomString(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }
}

// Cluster Configuration Manager
export class ClusterConfigManager {
  private static readonly DEFAULT_CONFIG: ClusterConfig = {
    maxNodes: 10,
    maxTenants: 100,
    maxStorageGb: 1000,
    backupRetentionDays: 30,
    healthCheckInterval: 30,
    autoScaling: false,
    highAvailability: true,
    encryptionEnabled: true,
    monitoringEnabled: true
  };

  /**
   * Get default cluster configuration
   */
  static getDefaultConfig(): ClusterConfig {
    return { ...this.DEFAULT_CONFIG };
  }

  /**
   * Get configuration template for environment
   */
  static getConfigTemplate(environment: 'development' | 'staging' | 'production'): ClusterConfig {
    const baseConfig = this.getDefaultConfig();

    switch (environment) {
      case 'development':
        return {
          ...baseConfig,
          maxNodes: 3,
          maxTenants: 10,
          maxStorageGb: 100,
          backupRetentionDays: 7,
          healthCheckInterval: 60,
          autoScaling: false,
          highAvailability: false,
          encryptionEnabled: true,
          monitoringEnabled: true
        };

      case 'staging':
        return {
          ...baseConfig,
          maxNodes: 5,
          maxTenants: 50,
          maxStorageGb: 500,
          backupRetentionDays: 14,
          healthCheckInterval: 30,
          autoScaling: false,
          highAvailability: true,
          encryptionEnabled: true,
          monitoringEnabled: true
        };

      case 'production':
        return {
          ...baseConfig,
          maxNodes: 20,
          maxTenants: 1000,
          maxStorageGb: 10000,
          backupRetentionDays: 90,
          healthCheckInterval: 15,
          autoScaling: true,
          highAvailability: true,
          encryptionEnabled: true,
          monitoringEnabled: true
        };

      default:
        return baseConfig;
    }
  }

  /**
   * Validate cluster configuration
   */
  static validateConfig(config: Partial<ClusterConfig>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (config.maxNodes !== undefined && config.maxNodes < 1) {
      errors.push('maxNodes must be at least 1');
    }

    if (config.maxTenants !== undefined && config.maxTenants < 1) {
      errors.push('maxTenants must be at least 1');
    }

    if (config.maxStorageGb !== undefined && config.maxStorageGb < 1) {
      errors.push('maxStorageGb must be at least 1');
    }

    if (config.backupRetentionDays !== undefined && config.backupRetentionDays < 1) {
      errors.push('backupRetentionDays must be at least 1');
    }

    if (config.healthCheckInterval !== undefined && config.healthCheckInterval < 5) {
      errors.push('healthCheckInterval must be at least 5 seconds');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Merge configuration with defaults
   */
  static mergeWithDefaults(config: Partial<ClusterConfig>): ClusterConfig {
    return {
      ...this.DEFAULT_CONFIG,
      ...config
    };
  }
}

// Cluster Health Calculator
export class ClusterHealthCalculator {
  /**
   * Calculate cluster health score based on node health
   */
  static calculateClusterHealth(nodes: NodeInfo[]): number {
    if (nodes.length === 0) {
      return 0.0;
    }

    const onlineNodes = nodes.filter(node => node.status === 'online');
    const healthyNodes = onlineNodes.filter(node => node.healthStatus === 'healthy');
    
    // Base health score from healthy nodes
    let healthScore = healthyNodes.length / nodes.length;

    // Penalty for degraded nodes
    const degradedNodes = onlineNodes.filter(node => node.healthStatus === 'warning');
    healthScore -= (degradedNodes.length * 0.1) / nodes.length;

    // Penalty for critical nodes
    const criticalNodes = onlineNodes.filter(node => node.healthStatus === 'critical');
    healthScore -= (criticalNodes.length * 0.3) / nodes.length;

    // Penalty for offline nodes
    const offlineNodes = nodes.filter(node => node.status === 'offline');
    healthScore -= (offlineNodes.length * 0.5) / nodes.length;

    // Ensure score is between 0 and 1
    return Math.max(0.0, Math.min(1.0, healthScore));
  }

  /**
   * Determine cluster status from health score
   */
  static getClusterStatus(healthScore: number): ClusterStatus {
    if (healthScore >= 0.9) {
      return 'active';
    } else if (healthScore >= 0.7) {
      return 'degraded';
    } else if (healthScore >= 0.3) {
      return 'maintenance';
    } else {
      return 'offline';
    }
  }

  /**
   * Calculate node health score from metrics
   */
  static calculateNodeHealth(node: NodeInfo): NodeHealthStatus {
    const { metrics, capacity, usage } = node;

    // CPU health check
    const cpuHealth = usage.cpu / capacity.cpu;
    const cpuStatus = cpuHealth > 0.9 ? 'critical' : cpuHealth > 0.7 ? 'warning' : 'healthy';

    // Memory health check
    const memoryHealth = usage.memoryGb / capacity.memoryGb;
    const memoryStatus = memoryHealth > 0.9 ? 'critical' : memoryHealth > 0.8 ? 'warning' : 'healthy';

    // Disk health check
    const diskHealth = usage.storageGb / capacity.storageGb;
    const diskStatus = diskHealth > 0.95 ? 'critical' : diskHealth > 0.8 ? 'warning' : 'healthy';

    // Overall health (worst case)
    const statuses = [cpuStatus, memoryStatus, diskStatus];
    
    if (statuses.includes('critical')) {
      return 'critical';
    } else if (statuses.includes('warning')) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Generate health recommendations
   */
  static generateHealthRecommendations(nodes: NodeInfo[]): string[] {
    const recommendations: string[] = [];

    // Check for offline nodes
    const offlineNodes = nodes.filter(node => node.status === 'offline');
    if (offlineNodes.length > 0) {
      recommendations.push(`${offlineNodes.length} node(s) are offline and should be investigated`);
    }

    // Check for high CPU usage
    const highCpuNodes = nodes.filter(node => node.metrics.cpuUsagePercent > 80);
    if (highCpuNodes.length > 0) {
      recommendations.push(`${highCpuNodes.length} node(s) have high CPU usage (>80%)`);
    }

    // Check for high memory usage
    const highMemoryNodes = nodes.filter(node => node.metrics.memoryUsagePercent > 85);
    if (highMemoryNodes.length > 0) {
      recommendations.push(`${highMemoryNodes.length} node(s) have high memory usage (>85%)`);
    }

    // Check for disk space issues
    const highDiskNodes = nodes.filter(node => node.metrics.diskUsagePercent > 90);
    if (highDiskNodes.length > 0) {
      recommendations.push(`${highDiskNodes.length} node(s) have high disk usage (>90%)`);
    }

    // Check for missing primary node
    const primaryNodes = nodes.filter(node => node.isPrimary && node.status === 'online');
    if (primaryNodes.length === 0) {
      recommendations.push('No online primary node found - cluster coordination may be affected');
    }

    // Check for missing coordinator node
    const coordinatorNodes = nodes.filter(node => node.isCoordinator && node.status === 'online');
    if (coordinatorNodes.length === 0) {
      recommendations.push('No online coordinator node found - cluster management may be affected');
    }

    return recommendations;
  }
}

// Cluster Coordination Manager
export class ClusterCoordinationManager {
  /**
   * Select primary node from available nodes
   */
  static selectPrimaryNode(nodes: NodeInfo[]): NodeInfo | null {
    const onlineNodes = nodes.filter(node => node.status === 'online');
    
    if (onlineNodes.length === 0) {
      return null;
    }

    // Sort by priority (highest first) and then by health
    onlineNodes.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      
      // Prefer healthy nodes
      const healthOrder = { healthy: 3, warning: 2, critical: 1, unknown: 0 };
      const aHealth = healthOrder[a.healthStatus] || 0;
      const bHealth = healthOrder[b.healthStatus] || 0;
      
      return bHealth - aHealth;
    });

    return onlineNodes[0];
  }

  /**
   * Select coordinator node from available nodes
   */
  static selectCoordinatorNode(nodes: NodeInfo[]): NodeInfo | null {
    const onlineNodes = nodes.filter(node => node.status === 'online');
    
    if (onlineNodes.length === 0) {
      return null;
    }

    // Prefer nodes with coordinator role, then by priority
    const coordinatorNodes = onlineNodes.filter(node => 
      node.roles.includes('coordinator') || node.isCoordinator
    );

    if (coordinatorNodes.length > 0) {
      coordinatorNodes.sort((a, b) => b.priority - a.priority);
      return coordinatorNodes[0];
    }

    // Fallback to highest priority node
    onlineNodes.sort((a, b) => b.priority - a.priority);
    return onlineNodes[0];
  }

  /**
   * Check cluster coordination status
   */
  static checkCoordinationStatus(cluster: ClusterInfo, nodes: NodeInfo[]): {
    status: 'healthy' | 'degraded' | 'critical';
    primaryNode?: NodeInfo;
    coordinatorNode?: NodeInfo;
    issues: string[];
  } {
    const issues: string[] = [];
    const onlineNodes = nodes.filter(node => node.status === 'online');

    // Check primary node
    const primaryNode = nodes.find(node => node.isPrimary && node.status === 'online');
    if (!primaryNode) {
      issues.push('No online primary node found');
    }

    // Check coordinator node
    const coordinatorNode = nodes.find(node => node.isCoordinator && node.status === 'online');
    if (!coordinatorNode) {
      issues.push('No online coordinator node found');
    }

    // Check node count
    if (onlineNodes.length < cluster.config.maxNodes * 0.5) {
      issues.push(`Less than 50% of nodes are online (${onlineNodes.length}/${cluster.config.maxNodes})`);
    }

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    if (issues.length >= 2 || onlineNodes.length === 0) {
      status = 'critical';
    } else if (issues.length > 0) {
      status = 'degraded';
    }

    return {
      status,
      primaryNode,
      coordinatorNode,
      issues
    };
  }

  /**
   * Generate failover plan
   */
  static generateFailoverPlan(nodes: NodeInfo[]): {
    primaryCandidate: NodeInfo | null;
    coordinatorCandidate: NodeInfo | null;
    order: NodeInfo[];
  } {
    const onlineNodes = nodes.filter(node => node.status === 'online');
    
    // Sort by priority and health
    onlineNodes.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      
      const healthOrder = { healthy: 3, warning: 2, critical: 1, unknown: 0 };
      const aHealth = healthOrder[a.healthStatus] || 0;
      const bHealth = healthOrder[b.healthStatus] || 0;
      
      return bHealth - aHealth;
    });

    const primaryCandidate = onlineNodes[0] || null;
    const coordinatorCandidate = onlineNodes[1] || onlineNodes[0] || null;

    return {
      primaryCandidate,
      coordinatorCandidate,
      order: onlineNodes
    };
  }
}

// Cluster Metrics Collector
export class ClusterMetricsCollector {
  /**
   * Collect system metrics from nodes
   */
  static collectSystemMetrics(nodes: NodeInfo[]): {
    totalCpu: number;
    totalMemory: number;
    totalStorage: number;
    totalNetwork: number;
    usedCpu: number;
    usedMemory: number;
    usedStorage: number;
    usedNetwork: number;
    averageCpuUsage: number;
    averageMemoryUsage: number;
    averageDiskUsage: number;
    averageNetworkUsage: number;
  } {
    const metrics = {
      totalCpu: 0,
      totalMemory: 0,
      totalStorage: 0,
      totalNetwork: 0,
      usedCpu: 0,
      usedMemory: 0,
      usedStorage: 0,
      usedNetwork: 0,
      averageCpuUsage: 0,
      averageMemoryUsage: 0,
      averageDiskUsage: 0,
      averageNetworkUsage: 0
    };

    if (nodes.length === 0) {
      return metrics;
    }

    // Sum up totals
    nodes.forEach(node => {
      metrics.totalCpu += node.capacity.cpu;
      metrics.totalMemory += node.capacity.memoryGb;
      metrics.totalStorage += node.capacity.storageGb;
      metrics.totalNetwork += node.capacity.networkMbps;
      
      metrics.usedCpu += node.usage.cpu;
      metrics.usedMemory += node.usage.memoryGb;
      metrics.usedStorage += node.usage.storageGb;
      metrics.usedNetwork += node.usage.networkMbps;
      
      metrics.averageCpuUsage += node.metrics.cpuUsagePercent;
      metrics.averageMemoryUsage += node.metrics.memoryUsagePercent;
      metrics.averageDiskUsage += node.metrics.diskUsagePercent;
      metrics.averageNetworkUsage += node.metrics.networkIoMbps;
    });

    // Calculate averages
    metrics.averageCpuUsage /= nodes.length;
    metrics.averageMemoryUsage /= nodes.length;
    metrics.averageDiskUsage /= nodes.length;
    metrics.averageNetworkUsage /= nodes.length;

    return metrics;
  }

  /**
   * Generate performance metrics
   */
  static generatePerformanceMetrics(cluster: ClusterInfo, nodes: NodeInfo[]): {
    clusterUtilization: number;
    nodeUtilization: number;
    healthScore: number;
    performanceScore: number;
    efficiency: number;
  } {
    const systemMetrics = this.collectSystemMetrics(nodes);
    
    // Cluster utilization (average of all resources)
    const clusterUtilization = (
      (systemMetrics.usedCpu / systemMetrics.totalCpu) +
      (systemMetrics.usedMemory / systemMetrics.totalMemory) +
      (systemMetrics.usedStorage / systemMetrics.totalStorage)
    ) / 3;

    // Node utilization (percentage of online nodes)
    const onlineNodes = nodes.filter(node => node.status === 'online').length;
    const nodeUtilization = onlineNodes / nodes.length;

    // Health score from cluster
    const healthScore = cluster.healthScore;

    // Performance score (combination of utilization and health)
    const performanceScore = (clusterUtilization * 0.4) + (healthScore * 0.6);

    // Efficiency (performance vs resource usage)
    const efficiency = performanceScore / Math.max(clusterUtilization, 0.1);

    return {
      clusterUtilization,
      nodeUtilization,
      healthScore,
      performanceScore,
      efficiency
    };
  }
}

// All classes are already exported inline above
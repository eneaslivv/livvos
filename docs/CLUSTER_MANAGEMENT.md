# Cluster Management System Documentation

## Overview

The Cluster Management System provides comprehensive infrastructure for managing multi-cluster deployments in the eneas-os platform. This system includes cluster identification, node management, health monitoring, and coordination capabilities.

## Architecture

### Core Components

1. **Database Schema**
   - `clusters` - Cluster metadata and configuration
   - `cluster_nodes` - Individual cluster nodes
   - `cluster_events` - Audit trail and coordination events
   - `cluster_metrics` - Performance and health metrics
   - `cluster_config_templates` - Reusable configuration templates

2. **Cluster Utilities** (`lib/cluster.ts`)
   - `ClusterIdManager` - ID generation and validation
   - `ClusterConfigManager` - Configuration management
   - `ClusterHealthCalculator` - Health assessment
   - `ClusterCoordinationManager` - Node coordination
   - `ClusterMetricsCollector` - Performance tracking

3. **API Layer** (RPC Functions)
   - Cluster CRUD operations
   - Node management
   - Health monitoring
   - Event logging
   - Metrics collection

4. **UI Components**
   - `ClusterManagement` - Main cluster interface
   - Node status visualization
   - Health monitoring dashboards
   - Configuration management

## Features

### Cluster Identification System

**Unique ID Generation**
- Format: `cluster-<random>-<timestamp>-<random>`
- Example: `cluster-a1b2c3d4-2026-01-21-12-00-00-e5f6g7h8`
- Guaranteed uniqueness through collision detection

**Node ID Generation**
- Format: `node-<cluster-suffix>-<number>-<random>`
- Example: `node-a1b2c3d4-2026-01-21-1-1i2j3k4l`
- Sequential numbering within cluster

**Validation**
- Format validation with regex patterns
- Component parsing for extraction
- Timestamp verification

### Configuration Management

**Environment Templates**
- **Development**: 3 nodes, 10 tenants, 100GB storage
- **Staging**: 5 nodes, 50 tenants, 500GB storage
- **Production**: 20 nodes, 1000 tenants, 10TB storage

**Configuration Validation**
- Resource limit verification
- Parameter type checking
- Business rule enforcement

**Template System**
- Reusable configuration templates
- Environment-specific defaults
- Custom configuration support

### Health Monitoring

**Cluster Health Score**
- Calculation based on node health (0.0 to 1.0)
- Status determination: active, degraded, maintenance, offline
- Real-time health assessment

**Node Health Assessment**
- CPU, memory, disk usage monitoring
- Load average tracking
- Network performance metrics
- Health status: healthy, warning, critical

**Health Recommendations**
- Automated issue detection
- Performance optimization suggestions
- Infrastructure improvement recommendations

### Coordination System

**Primary Node Selection**
- Priority-based selection
- Health status consideration
- Automatic failover support

**Coordinator Management**
- Dedicated coordinator role
- Coordination task distribution
- Leadership election

**Failover Planning**
- Automatic failover candidate selection
- Graceful degradation handling
- Recovery procedures

## API Reference

### Cluster Operations

#### Create Cluster
```sql
SELECT create_cluster(
  p_name := 'Production Cluster',
  p_description := 'Main production cluster',
  p_region := 'us-east-1',
  p_config := '{"auto_scaling": true}',
  p_max_nodes := 20,
  p_max_tenants := 1000
);
```

#### Get Cluster Information
```sql
SELECT get_cluster_info('cluster-a1b2c3d4-...');
```

#### Decommission Cluster
```sql
SELECT decommission_cluster('cluster-a1b2c3d4-...', false);
```

### Node Operations

#### Add Node
```sql
SELECT add_cluster_node(
  p_cluster_id := 'cluster-a1b2c3d4-...',
  p_name := 'Worker Node 1',
  p_region := 'us-east-1',
  p_capacity_cpu := 8.0,
  p_capacity_memory_gb := 32.0,
  p_roles := ARRAY['worker', 'processing']
);
```

#### Update Node Status
```sql
SELECT update_node_status(
  p_node_id := 'node-a1b2c3d4-...-1-1i2j3k4l',
  p_status := 'online',
  p_health_status := 'healthy',
  p_metrics := '{"cpu_usage_percent": 65.2}'
);
```

#### Promote to Primary
```sql
SELECT promote_to_primary('node-a1b2c3d4-...-1-1i2j3k4l');
```

### Monitoring Operations

#### Health Summary
```sql
SELECT get_cluster_health_summary('cluster-a1b2c3d4-...');
```

#### Cluster Events
```sql
SELECT get_cluster_events(
  p_cluster_id := 'cluster-a1b2c3d4-...',
  p_severity := 'error',
  p_limit := 50
);
```

#### Record Metrics
```sql
SELECT record_cluster_metrics(
  p_cluster_id := 'cluster-a1b2c3d4-...',
  p_node_id := 'node-a1b2c3d4-...-1-1i2j3k4l',
  p_metrics := '{"cpu_usage": 4.2, "memory_usage": 16.8}'
);
```

## Usage Examples

### Creating a New Cluster

```typescript
import { useSystem } from '../context/SystemContext';

const { createCluster } = useSystem();

const clusterData = {
  name: 'Production Cluster US-East',
  description: 'Primary production cluster in US East region',
  region: 'us-east-1',
  config: {
    autoScaling: true,
    highAvailability: true,
    encryptionEnabled: true
  },
  maxNodes: 20,
  maxTenants: 1000,
  maxStorageGb: 10000
};

const cluster = await createCluster(clusterData);
```

### Adding a Node to Cluster

```typescript
const { addNodeToCluster } = useSystem();

const nodeData = {
  name: 'High-Performance Worker',
  region: 'us-east-1',
  availabilityZone: 'us-east-1a',
  hostname: 'worker-hp-01.example.com',
  capacity: {
    cpu: 16.0,
    memoryGb: 64.0,
    storageGb: 1000.0,
    networkMbps: 2000.0
  },
  roles: ['worker', 'processing'],
  priority: 80
};

const node = await addNodeToCluster(nodeData);
```

### Monitoring Cluster Health

```typescript
const { getClusterHealth, getClusterInfo } = useSystem();

// Get overall cluster health
const healthSummary = await getClusterHealth();

// Get detailed cluster information
const clusterInfo = await getClusterInfo('cluster-a1b2c3d4-...');

console.log('Cluster Health Score:', healthSummary.clusters[0].health_score);
console.log('Online Nodes:', clusterInfo.nodes.filter(n => n.status === 'online').length);
```

## Security Considerations

### Access Control

1. **Row Level Security (RLS)**
   - System admin required for cluster management
   - View permissions for monitoring
   - Tenant isolation enforcement

2. **API Security**
   - Authenticated user verification
   - Role-based access control
   - Audit logging for all operations

3. **Data Protection**
   - Encryption at rest
   - Secure node communication
   - Sensitive data redaction

### Best Practices

1. **Cluster Configuration**
   - Use environment-appropriate templates
   - Validate configurations before applying
   - Regular security audits

2. **Node Management**
   - Regular health monitoring
   - Proactive maintenance scheduling
   - Capacity planning

3. **Monitoring**
   - Set up alert thresholds
   - Regular health assessments
   - Performance baseline tracking

## Performance Optimization

### Database Optimization

1. **Indexing Strategy**
   - Cluster ID indexes for fast lookups
   - Timestamp indexes for time-based queries
   - Status indexes for monitoring queries

2. **Query Optimization**
   - Efficient aggregation functions
   - Batch processing for metrics
   - Connection pooling

### Application Performance

1. **Caching**
   - Cluster information caching
   - Health score caching
   - Metrics aggregation caching

2. **Real-time Updates**
   - WebSocket connections for live updates
   - Event-driven architecture
   - Optimistic UI updates

## Troubleshooting

### Common Issues

1. **Cluster Creation Failures**
   - Check configuration validation
   - Verify resource availability
   - Review permission settings

2. **Node Health Issues**
   - Review resource utilization
   - Check network connectivity
   - Verify configuration settings

3. **Performance Problems**
   - Monitor query performance
   - Check resource contention
   - Review scaling settings

### Debugging Tools

1. **Health Diagnostics**
   ```sql
   SELECT get_cluster_health_summary();
   ```

2. **Event Logging**
   ```sql
   SELECT * FROM cluster_events 
   WHERE cluster_id = 'cluster-id' 
   ORDER BY created_at DESC 
   LIMIT 100;
   ```

3. **Metrics Analysis**
   ```sql
   SELECT * FROM cluster_metrics 
   WHERE cluster_id = 'cluster-id' 
   AND timestamp > NOW() - INTERVAL '1 hour';
   ```

## Migration Guide

### From Single-Cluster to Multi-Cluster

1. **Database Migration**
   - Run cluster management migration
   - Migrate existing data to cluster structure
   - Update application references

2. **Application Updates**
   - Update cluster-aware components
   - Implement cluster selection logic
   - Add cluster management UI

3. **Configuration Migration**
   - Create cluster configuration templates
   - Migrate existing settings
   - Test cluster operations

## Future Enhancements

### Planned Features

1. **Auto-Scaling**
   - Automatic node provisioning
   - Load-based scaling decisions
   - Cost optimization

2. **Multi-Region Support**
   - Geographic distribution
   - Disaster recovery
   - Latency optimization

3. **Advanced Analytics**
   - Predictive health monitoring
   - Capacity planning recommendations
   - Cost optimization insights

### Extensibility

1. **Custom Metrics**
   - Plugin system for custom metrics
   - Third-party monitoring integration
   - Custom alerting rules

2. **Configuration Extensions**
   - Custom configuration schemas
   - Environment-specific templates
   - Integration with external systems

## Support

For questions or issues related to the Cluster Management System:

1. **Documentation**: Refer to this guide and API reference
2. **Code Examples**: Check the test suite for usage patterns
3. **Community**: Join discussions in the development channels
4. **Issues**: Report bugs and feature requests via issue tracker

---

This documentation covers the complete Cluster Management System implementation in eneas-os. For specific implementation details, refer to the source code and test files.
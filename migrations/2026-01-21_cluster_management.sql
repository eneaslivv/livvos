-- Cluster Management Migration
-- Creates tables for cluster identification, management, and coordination

-- Clusters table for cluster metadata and identification
CREATE TABLE IF NOT EXISTS clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id VARCHAR(64) UNIQUE NOT NULL, -- Human-readable cluster ID
    name VARCHAR(255) NOT NULL,
    description TEXT,
    region VARCHAR(64) NOT NULL,
    version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    status VARCHAR(32) NOT NULL DEFAULT 'initializing' 
        CHECK (status IN ('initializing', 'active', 'degraded', 'maintenance', 'offline', 'decommissioning')),
    
    -- Cluster configuration
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Cluster capacity and limits
    max_nodes INTEGER DEFAULT 10,
    max_tenants INTEGER DEFAULT 100,
    max_storage_gb INTEGER DEFAULT 1000,
    
    -- Cluster health metrics
    health_score DECIMAL(3,2) DEFAULT 0.0 CHECK (health_score >= 0.0 AND health_score <= 1.0),
    last_health_check TIMESTAMPTZ DEFAULT now(),
    
    -- Cluster coordination
    primary_node_id UUID, -- Circular ref loaded later if needed, or allow it
    coordinator_token VARCHAR(255) UNIQUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_sync TIMESTAMPTZ DEFAULT now(),
    
    -- Cluster lifecycle
    activated_at TIMESTAMPTZ,
    decommissioned_at TIMESTAMPTZ,
    
    -- Security
    encryption_key_id VARCHAR(64),
    backup_retention_days INTEGER DEFAULT 30,
    
    -- Cluster hierarchy (for multi-cluster setups)
    parent_cluster_id UUID REFERENCES clusters(id),
    cluster_level INTEGER DEFAULT 1 CHECK (cluster_level >= 1 AND cluster_level <= 5),
    
    -- Cluster tags and labels
    tags TEXT[] DEFAULT '{}',
    labels JSONB DEFAULT '{}'
);

-- Cluster nodes table for individual node management
CREATE TABLE IF NOT EXISTS cluster_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    node_id VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    
    -- Node status and health
    status VARCHAR(32) NOT NULL DEFAULT 'provisioning'
        CHECK (status IN ('provisioning', 'online', 'offline', 'maintenance', 'error', 'decommissioning')),
    health_status VARCHAR(32) NOT NULL DEFAULT 'unknown'
        CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
    
    -- Node location and network
    region VARCHAR(64) NOT NULL,
    availability_zone VARCHAR(32),
    private_ip VARCHAR(45),
    public_ip VARCHAR(45),
    hostname VARCHAR(255),
    
    -- Node capacity and resources
    capacity_cpu DECIMAL(5,2) DEFAULT 0.0, -- CPU cores
    capacity_memory_gb DECIMAL(8,2) DEFAULT 0.0, -- Memory in GB
    capacity_storage_gb DECIMAL(10,2) DEFAULT 0.0, -- Storage in GB
    capacity_network_mbps DECIMAL(8,2) DEFAULT 0.0, -- Network bandwidth
    
    -- Node current usage
    used_cpu DECIMAL(5,2) DEFAULT 0.0,
    used_memory_gb DECIMAL(8,2) DEFAULT 0.0,
    used_storage_gb DECIMAL(10,2) DEFAULT 0.0,
    used_network_mbps DECIMAL(8,2) DEFAULT 0.0,
    
    -- Node roles and capabilities
    roles TEXT[] DEFAULT '{}', -- ['web', 'api', 'database', 'worker', etc.]
    capabilities JSONB DEFAULT '{}',
    
    -- Node metrics
    load_average DECIMAL(4,2) DEFAULT 0.0,
    cpu_usage_percent DECIMAL(5,2) DEFAULT 0.0,
    memory_usage_percent DECIMAL(5,2) DEFAULT 0.0,
    disk_usage_percent DECIMAL(5,2) DEFAULT 0.0,
    network_io_mbps DECIMAL(8,2) DEFAULT 0.0,
    
    -- Node coordination
    is_primary BOOLEAN DEFAULT false,
    is_coordinator BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0, -- Higher priority for primary selection
    
    -- Node lifecycle
    last_heartbeat TIMESTAMPTZ DEFAULT now(),
    last_restart TIMESTAMPTZ,
    uptime_seconds BIGINT DEFAULT 0,
    
    -- Node configuration
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Security
    node_token VARCHAR(255) UNIQUE,
    ssh_fingerprint VARCHAR(255),
    tls_certificate_id VARCHAR(64)
);

-- Add foreign key for primary_node_id if not exists (circular dependency)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'clusters_primary_node_id_fkey') THEN
    ALTER TABLE clusters ADD CONSTRAINT clusters_primary_node_id_fkey FOREIGN KEY (primary_node_id) REFERENCES cluster_nodes(id);
  END IF;
END $$;


-- Cluster events table for audit trail and coordination
CREATE TABLE IF NOT EXISTS cluster_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    node_id UUID REFERENCES cluster_nodes(id) ON DELETE SET NULL,
    
    -- Event details
    event_type VARCHAR(64) NOT NULL,
    event_category VARCHAR(32) NOT NULL 
        CHECK (event_category IN ('system', 'health', 'coordination', 'security', 'lifecycle', 'configuration')),
    severity VARCHAR(16) NOT NULL DEFAULT 'info'
        CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    
    -- Event data
    title VARCHAR(255) NOT NULL,
    description TEXT,
    details JSONB DEFAULT '{}',
    
    -- Event source
    source_agent VARCHAR(64),
    source_node VARCHAR(64),
    user_id UUID REFERENCES auth.users(id),
    
    -- Event status
    status VARCHAR(32) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'processing', 'completed', 'failed', 'cancelled')),
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    
    -- Event relationships
    parent_event_id UUID REFERENCES cluster_events(id),
    correlation_id VARCHAR(64), -- For grouping related events
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    
    -- Event metadata
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- Cluster metrics table for performance monitoring
CREATE TABLE IF NOT EXISTS cluster_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    node_id UUID REFERENCES cluster_nodes(id) ON DELETE CASCADE,
    
    -- Metric details
    metric_name VARCHAR(128) NOT NULL,
    metric_category VARCHAR(32) NOT NULL,
    metric_type VARCHAR(32) NOT NULL 
        CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'timer')),
    
    -- Metric values
    value DECIMAL(15,6) NOT NULL,
    unit VARCHAR(32),
    
    -- Metric dimensions
    dimensions JSONB DEFAULT '{}',
    labels JSONB DEFAULT '{}',
    
    -- Metric collection
    collection_method VARCHAR(64) DEFAULT 'agent',
    source_agent VARCHAR(64),
    
    -- Timestamps
    timestamp TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Cluster configuration templates
CREATE TABLE IF NOT EXISTS cluster_config_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_type VARCHAR(64) NOT NULL,
    
    -- Template configuration
    config JSONB NOT NULL,
    default_values JSONB DEFAULT '{}',
    validation_schema JSONB,
    
    -- Template metadata
    version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    author VARCHAR(255),
    tags TEXT[] DEFAULT '{}',
    
    -- Template status
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add cluster_id to relevant tables for multi-cluster support
-- Add to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES clusters(id);

-- Add to system_metrics table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_metrics') THEN
        ALTER TABLE system_metrics ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES clusters(id);
    END IF;
END
$$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_clusters_cluster_id ON clusters(cluster_id);
CREATE INDEX IF NOT EXISTS idx_clusters_status ON clusters(status);
CREATE INDEX IF NOT EXISTS idx_clusters_region ON clusters(region);
CREATE INDEX IF NOT EXISTS idx_clusters_parent ON clusters(parent_cluster_id);

CREATE INDEX IF NOT EXISTS idx_cluster_nodes_cluster_id ON cluster_nodes(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_node_id ON cluster_nodes(node_id);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_status ON cluster_nodes(status);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_region ON cluster_nodes(region);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_roles ON cluster_nodes USING GIN(roles);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_primary ON cluster_nodes(is_primary);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_coordinator ON cluster_nodes(is_coordinator);

CREATE INDEX IF NOT EXISTS idx_cluster_events_cluster_id ON cluster_events(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_events_node_id ON cluster_events(node_id);
CREATE INDEX IF NOT EXISTS idx_cluster_events_type ON cluster_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cluster_events_category ON cluster_events(event_category);
CREATE INDEX IF NOT EXISTS idx_cluster_events_severity ON cluster_events(severity);
CREATE INDEX IF NOT EXISTS idx_cluster_events_created_at ON cluster_events(created_at);
CREATE INDEX IF NOT EXISTS idx_cluster_events_correlation ON cluster_events(correlation_id);

CREATE INDEX IF NOT EXISTS idx_cluster_metrics_cluster_id ON cluster_metrics(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_node_id ON cluster_metrics(node_id);
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_name ON cluster_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_timestamp ON cluster_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_cluster_metrics_category ON cluster_metrics(metric_category);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_clusters_updated_at ON clusters;
CREATE TRIGGER update_clusters_updated_at BEFORE UPDATE ON clusters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cluster_nodes_updated_at ON cluster_nodes;
CREATE TRIGGER update_cluster_nodes_updated_at BEFORE UPDATE ON cluster_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cluster_events_updated_at ON cluster_events;
CREATE TRIGGER update_cluster_events_updated_at BEFORE UPDATE ON cluster_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cluster_config_templates_updated_at ON cluster_config_templates;
CREATE TRIGGER update_cluster_config_templates_updated_at BEFORE UPDATE ON cluster_config_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_config_templates ENABLE ROW LEVEL SECURITY;

-- Clusters RLS policies
DROP POLICY IF EXISTS "System admins can view all clusters" ON clusters;
CREATE POLICY "System admins can view all clusters" ON clusters
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

DROP POLICY IF EXISTS "System admins can insert clusters" ON clusters;
CREATE POLICY "System admins can insert clusters" ON clusters
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

DROP POLICY IF EXISTS "System admins can update clusters" ON clusters;
CREATE POLICY "System admins can update clusters" ON clusters
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

DROP POLICY IF EXISTS "System admins can delete clusters" ON clusters;
CREATE POLICY "System admins can delete clusters" ON clusters
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Cluster nodes RLS policies
DROP POLICY IF EXISTS "System admins can view all cluster nodes" ON cluster_nodes;
CREATE POLICY "System admins can view all cluster nodes" ON cluster_nodes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

DROP POLICY IF EXISTS "System admins can manage cluster nodes" ON cluster_nodes;
CREATE POLICY "System admins can manage cluster nodes" ON cluster_nodes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Cluster events RLS policies
DROP POLICY IF EXISTS "System admins can view all cluster events" ON cluster_events;
CREATE POLICY "System admins can view all cluster events" ON cluster_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

DROP POLICY IF EXISTS "System agents can create cluster events" ON cluster_events;
CREATE POLICY "System agents can create cluster events" ON cluster_events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Cluster metrics RLS policies
DROP POLICY IF EXISTS "System admins can view all cluster metrics" ON cluster_metrics;
CREATE POLICY "System admins can view all cluster metrics" ON cluster_metrics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

DROP POLICY IF EXISTS "System agents can create cluster metrics" ON cluster_metrics;
CREATE POLICY "System agents can create cluster metrics" ON cluster_metrics
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Cluster config templates RLS policies
DROP POLICY IF EXISTS "Anyone can view active cluster config templates" ON cluster_config_templates;
CREATE POLICY "Anyone can view active cluster config templates" ON cluster_config_templates
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "System admins can manage cluster config templates" ON cluster_config_templates;
CREATE POLICY "System admins can manage cluster config templates" ON cluster_config_templates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Insert default cluster configuration template
INSERT INTO cluster_config_templates (
    name,
    description,
    template_type,
    config,
    default_values,
    validation_schema,
    version,
    author,
    is_system,
    tags
) VALUES (
    'Standard Production Cluster',
    'Default configuration for production clusters',
    'production',
    '{
        "network": {
            "load_balancer": true,
            "ssl_termination": true,
            "cdn_integration": false
        },
        "security": {
            "encryption_at_rest": true,
            "encryption_in_transit": true,
            "audit_logging": true,
            "backup_retention_days": 30
        },
        "monitoring": {
            "metrics_collection": true,
            "health_checks": true,
            "alerting": true,
            "log_aggregation": true
        },
        "performance": {
            "auto_scaling": true,
            "caching_enabled": true,
            "connection_pooling": true
        },
        "availability": {
            "high_availability": true,
            "failover_enabled": true,
            "backup_frequency": "daily"
        }
    }',
    '{
        "max_nodes": 10,
        "max_tenants": 100,
        "backup_retention_days": 30,
        "health_check_interval": 30
    }',
    '{
        "type": "object",
        "properties": {
            "max_nodes": {"type": "integer", "minimum": 1, "maximum": 100},
            "max_tenants": {"type": "integer", "minimum": 1, "maximum": 1000},
            "backup_retention_days": {"type": "integer", "minimum": 1, "maximum": 365}
        },
        "required": ["max_nodes", "max_tenants"]
    }',
    '1.0.0',
    'System',
    true,
    '{production, default, standard}'
) ON CONFLICT DO NOTHING;

-- Insert development cluster configuration template
INSERT INTO cluster_config_templates (
    name,
    description,
    template_type,
    config,
    default_values,
    validation_schema,
    version,
    author,
    is_system,
    tags
) VALUES (
    'Development Cluster',
    'Configuration for development and testing clusters',
    'development',
    '{
        "network": {
            "load_balancer": false,
            "ssl_termination": false,
            "cdn_integration": false
        },
        "security": {
            "encryption_at_rest": true,
            "encryption_in_transit": true,
            "audit_logging": false,
            "backup_retention_days": 7
        },
        "monitoring": {
            "metrics_collection": true,
            "health_checks": true,
            "alerting": false,
            "log_aggregation": false
        },
        "performance": {
            "auto_scaling": false,
            "caching_enabled": false,
            "connection_pooling": false
        },
        "availability": {
            "high_availability": false,
            "failover_enabled": false,
            "backup_frequency": "weekly"
        }
    }',
    '{
        "max_nodes": 3,
        "max_tenants": 10,
        "backup_retention_days": 7,
        "health_check_interval": 60
    }',
    '{
        "type": "object",
        "properties": {
            "max_nodes": {"type": "integer", "minimum": 1, "maximum": 10},
            "max_tenants": {"type": "integer", "minimum": 1, "maximum": 50},
            "backup_retention_days": {"type": "integer", "minimum": 1, "maximum": 30}
        },
        "required": ["max_nodes", "max_tenants"]
    }',
    '1.0.0',
    'System',
    true,
    '{development, testing, default}'
) ON CONFLICT DO NOTHING;

-- Create default cluster for single-tenant deployments
INSERT INTO clusters (
    cluster_id,
    name,
    description,
    region,
    version,
    status,
    config,
    metadata,
    max_nodes,
    max_tenants,
    max_storage_gb,
    health_score,
    activated_at,
    tags,
    labels
) VALUES (
    'default-cluster-001',
    'Default Production Cluster',
    'Default cluster for single-tenant deployment',
    'us-east-1',
    '1.0.0',
    'active',
    '{
        "auto_scaling": false,
        "backup_enabled": true,
        "monitoring_enabled": true,
        "security_level": "standard"
    }',
    '{
        "deployment_type": "single-tenant",
        "environment": "production",
        "created_by": "system"
    }',
    10,
    100,
    1000,
    1.0,
    now(),
    '{default, production}',
    '{"environment": "production", "type": "default"}'
) ON CONFLICT (cluster_id) DO NOTHING;

-- Create default primary node for the default cluster
INSERT INTO cluster_nodes (
    cluster_id,
    node_id,
    name,
    status,
    health_status,
    region,
    availability_zone,
    hostname,
    capacity_cpu,
    capacity_memory_gb,
    capacity_storage_gb,
    capacity_network_mbps,
    roles,
    is_primary,
    is_coordinator,
    priority,
    config,
    metadata,
    node_token
) SELECT 
    c.id,
    'default-node-001',
    'Primary Node',
    'online',
    'healthy',
    c.region,
    'us-east-1a',
    'primary-node.eneas-os.local',
    8.0,
    32.0,
    500.0,
    1000.0,
    '{web, api, database, coordinator}',
    true,
    true,
    100,
    '{
        "role": "primary",
        "auto_failover": true,
        "backup_responsible": true
    }',
    '{
        "node_type": "primary",
        "deployment_type": "single-tenant"
    }',
    'default-node-token-' || encode(gen_random_bytes(32), 'hex')
FROM clusters c 
WHERE c.cluster_id = 'default-cluster-001'
AND NOT EXISTS (
    SELECT 1 FROM cluster_nodes cn 
    JOIN clusters c2 ON cn.cluster_id = c2.id 
    WHERE c2.cluster_id = 'default-cluster-001'
) ON CONFLICT (node_id) DO NOTHING;

-- Create function to generate unique cluster IDs
CREATE OR REPLACE FUNCTION generate_cluster_id()
RETURNS TEXT AS $$
DECLARE
    new_cluster_id TEXT;
    id_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate cluster ID with format: cluster-<region>-<timestamp>-<random>
        new_cluster_id := 'cluster-' || 
                         substring(lower(random()::text), 3, 8) || '-' ||
                         to_char(now(), 'YYYY-MM-DD-HH24-MI-SS') || '-' ||
                         substring(lower(encode(gen_random_bytes(4), 'hex')), 1, 8);
        
        -- Check if ID already exists
        SELECT EXISTS(SELECT 1 FROM clusters WHERE cluster_id = new_cluster_id) INTO id_exists;
        
        EXIT WHEN NOT id_exists;
    END LOOP;
    
    RETURN new_cluster_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate unique node IDs
CREATE OR REPLACE FUNCTION generate_node_id(p_cluster_id TEXT)
RETURNS TEXT AS $$
DECLARE
    new_node_id TEXT;
    id_exists BOOLEAN;
    node_counter INTEGER;
BEGIN
    -- Get current node count for this cluster
    SELECT COUNT(*) INTO node_counter 
    FROM cluster_nodes cn 
    JOIN clusters c ON cn.cluster_id = c.id 
    WHERE c.cluster_id = p_cluster_id;
    
    LOOP
        -- Generate node ID with format: node-<cluster>-<number>-<random>
        new_node_id := 'node-' || 
                      substring(p_cluster_id from 8) || '-' ||
                      (node_counter + 1)::text || '-' ||
                      substring(lower(encode(gen_random_bytes(4), 'hex')), 1, 8);
        
        -- Check if ID already exists
        SELECT EXISTS(SELECT 1 FROM cluster_nodes WHERE node_id = new_node_id) INTO id_exists;
        
        EXIT WHEN NOT id_exists;
        node_counter := node_counter + 1;
    END LOOP;
    
    RETURN new_node_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to update cluster health score
CREATE OR REPLACE FUNCTION update_cluster_health_score(p_cluster_id UUID)
RETURNS VOID AS $$
DECLARE
    total_nodes INTEGER;
    healthy_nodes INTEGER;
    new_health_score DECIMAL(3,2);
BEGIN
    -- Count total and healthy nodes
    SELECT COUNT(*), COUNT(*) FILTER (WHERE health_status = 'healthy')
    INTO total_nodes, healthy_nodes
    FROM cluster_nodes
    WHERE cluster_id = p_cluster_id AND status = 'online';
    
    -- Calculate health score (0.0 to 1.0)
    IF total_nodes = 0 THEN
        new_health_score := 0.0;
    ELSE
        new_health_score := (healthy_nodes::DECIMAL / total_nodes::DECIMAL);
    END IF;
    
    -- Update cluster health score
    UPDATE clusters 
    SET health_score = new_health_score,
        last_health_check = now()
    WHERE id = p_cluster_id;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update cluster health when node health changes
CREATE OR REPLACE FUNCTION trigger_cluster_health_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Update cluster health score when node status or health changes
    PERFORM update_cluster_health_score(NEW.cluster_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cluster_health_update_trigger ON cluster_nodes;
CREATE TRIGGER cluster_health_update_trigger
    AFTER INSERT OR UPDATE ON cluster_nodes
    FOR EACH ROW
    EXECUTE FUNCTION trigger_cluster_health_update();

-- Create function to check cluster coordination status
CREATE OR REPLACE FUNCTION check_cluster_coordination(p_cluster_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    primary_node RECORD;
    coordinator_node RECORD;
    total_nodes INTEGER;
    online_nodes INTEGER;
BEGIN
    -- Get primary node
    SELECT * INTO primary_node
    FROM cluster_nodes
    WHERE cluster_id = p_cluster_id AND is_primary = true AND status = 'online';
    
    -- Get coordinator node
    SELECT * INTO coordinator_node
    FROM cluster_nodes
    WHERE cluster_id = p_cluster_id AND is_coordinator = true AND status = 'online';
    
    -- Count nodes
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'online')
    INTO total_nodes, online_nodes
    FROM cluster_nodes
    WHERE cluster_id = p_cluster_id;
    
    -- Build result
    result := jsonb_build_object(
        'cluster_id', p_cluster_id,
        'coordination_status', 
            CASE 
                WHEN primary_node.id IS NOT NULL AND coordinator_node.id IS NOT NULL THEN 'healthy'
                WHEN primary_node.id IS NOT NULL OR coordinator_node.id IS NOT NULL THEN 'degraded'
                ELSE 'critical'
            END,
        'primary_node', 
            CASE WHEN primary_node.id IS NOT NULL THEN 
                jsonb_build_object(
                    'id', primary_node.id,
                    'node_id', primary_node.node_id,
                    'name', primary_node.name,
                    'last_heartbeat', primary_node.last_heartbeat
                )
            ELSE NULL
            END,
        'coordinator_node',
            CASE WHEN coordinator_node.id IS NOT NULL THEN
                jsonb_build_object(
                    'id', coordinator_node.id,
                    'node_id', coordinator_node.node_id,
                    'name', coordinator_node.name,
                    'last_heartbeat', coordinator_node.last_heartbeat
                )
            ELSE NULL
            END,
        'total_nodes', total_nodes,
        'online_nodes', online_nodes,
        'node_health_ratio', 
            CASE WHEN total_nodes > 0 THEN (online_nodes::DECIMAL / total_nodes::DECIMAL) ELSE 0.0 END,
        'last_check', now()
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to promote node to primary
CREATE OR REPLACE FUNCTION promote_node_to_primary(p_node_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    node_record RECORD;
    cluster_record RECORD;
BEGIN
    -- Get node and cluster information
    SELECT cn.*, c.id as cluster_id INTO node_record
    FROM cluster_nodes cn
    JOIN clusters c ON cn.cluster_id = c.id
    WHERE cn.id = p_node_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Demote existing primary node if any
    UPDATE cluster_nodes
    SET is_primary = false
    WHERE cluster_id = node_record.cluster_id AND is_primary = true;
    
    -- Promote new primary node
    UPDATE cluster_nodes
    SET is_primary = true,
        priority = GREATEST(priority, 100),
        updated_at = now()
    WHERE id = p_node_id;
    
    -- Update cluster primary node reference
    UPDATE clusters
    SET primary_node_id = p_node_id,
        updated_at = now()
    WHERE id = node_record.cluster_id;
    
    -- Log the promotion event
    INSERT INTO cluster_events (
        cluster_id,
        node_id,
        event_type,
        event_category,
        severity,
        title,
        description,
        details,
        source_agent
    ) VALUES (
        node_record.cluster_id,
        p_node_id,
        'node_promotion',
        'coordination',
        'info',
        'Node promoted to primary',
        format('Node %s has been promoted to primary role', node_record.name),
        jsonb_build_object(
            'previous_primary', NULL,
            'new_primary', node_record.node_id,
            'promotion_time', now()
        ),
        'system-agent'
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON clusters TO authenticated;
GRANT ALL ON cluster_nodes TO authenticated;
GRANT ALL ON cluster_events TO authenticated;
GRANT ALL ON cluster_metrics TO authenticated;
GRANT SELECT ON cluster_config_templates TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION generate_cluster_id() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_node_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_cluster_health_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_cluster_coordination(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION promote_node_to_primary(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE clusters IS 'Cluster metadata and configuration for multi-cluster deployments';
COMMENT ON TABLE cluster_nodes IS 'Individual cluster nodes with capacity and health monitoring';
COMMENT ON TABLE cluster_events IS 'Audit trail and coordination events for cluster management';
COMMENT ON TABLE cluster_metrics IS 'Performance and health metrics for clusters and nodes';
COMMENT ON TABLE cluster_config_templates IS 'Reusable configuration templates for cluster provisioning';

COMMENT ON COLUMN clusters.cluster_id IS 'Human-readable unique cluster identifier';
COMMENT ON COLUMN clusters.coordinator_token IS 'Token for cluster coordination between nodes';
COMMENT ON COLUMN clusters.health_score IS 'Overall cluster health score (0.0 to 1.0)';
COMMENT ON COLUMN cluster_nodes.node_id IS 'Human-readable unique node identifier within cluster';
COMMENT ON COLUMN cluster_nodes.node_token IS 'Authentication token for node communication';
COMMENT ON COLUMN cluster_nodes.is_primary IS 'Whether this node is the primary node for the cluster';
COMMENT ON COLUMN cluster_nodes.is_coordinator IS 'Whether this node coordinates cluster operations';
COMMENT ON COLUMN cluster_events.correlation_id IS 'ID for grouping related events together';
COMMENT ON COLUMN cluster_metrics.metric_type IS 'Type of metric: counter, gauge, histogram, or timer';
-- Cluster Management RPC Functions
-- Provides API endpoints for cluster operations

-- Create a new cluster
CREATE OR REPLACE FUNCTION create_cluster(
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_region TEXT,
    p_version TEXT DEFAULT '1.0.0',
    p_config JSONB DEFAULT '{}',
    p_metadata JSONB DEFAULT '{}',
    p_max_nodes INTEGER DEFAULT 10,
    p_max_tenants INTEGER DEFAULT 100,
    p_max_storage_gb INTEGER DEFAULT 1000,
    p_tags TEXT[] DEFAULT '{}',
    p_labels JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
    v_cluster_id TEXT;
    v_cluster_uuid UUID;
    v_result JSONB;
BEGIN
    -- Validate input
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Cluster name is required';
    END IF;
    
    IF p_region IS NULL OR trim(p_region) = '' THEN
        RAISE EXCEPTION 'Cluster region is required';
    END IF;
    
    -- Generate unique cluster ID
    v_cluster_id := generate_cluster_id();
    
    -- Create cluster
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
        tags,
        labels,
        activated_at
    ) VALUES (
        v_cluster_id,
        p_name,
        p_description,
        p_region,
        p_version,
        'initializing',
        p_config,
        p_metadata,
        p_max_nodes,
        p_max_tenants,
        p_max_storage_gb,
        p_tags,
        p_labels,
        now()
    ) RETURNING id INTO v_cluster_uuid;
    
    -- Log cluster creation event
    INSERT INTO cluster_events (
        cluster_id,
        event_type,
        event_category,
        severity,
        title,
        description,
        details,
        source_agent,
        user_id
    ) VALUES (
        v_cluster_uuid,
        'cluster_created',
        'lifecycle',
        'info',
        'Cluster created successfully',
        format('Cluster %s has been created in region %s', p_name, p_region),
        jsonb_build_object(
            'cluster_id', v_cluster_id,
            'config', p_config,
            'max_nodes', p_max_nodes,
            'max_tenants', p_max_tenants
        ),
        'system-agent',
        auth.uid()
    );
    
    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'cluster_id', v_cluster_id,
        'cluster_uuid', v_cluster_uuid,
        'name', p_name,
        'region', p_region,
        'status', 'initializing',
        'message', 'Cluster created successfully'
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a node to a cluster
CREATE OR REPLACE FUNCTION add_cluster_node(
    p_cluster_id TEXT,
    p_name TEXT,
    p_region TEXT,
    p_availability_zone TEXT DEFAULT NULL,
    p_hostname TEXT DEFAULT NULL,
    p_private_ip TEXT DEFAULT NULL,
    p_public_ip TEXT DEFAULT NULL,
    p_capacity_cpu DECIMAL DEFAULT 4.0,
    p_capacity_memory_gb DECIMAL DEFAULT 16.0,
    p_capacity_storage_gb DECIMAL DEFAULT 100.0,
    p_capacity_network_mbps DECIMAL DEFAULT 1000.0,
    p_roles TEXT[] DEFAULT '{worker}',
    p_config JSONB DEFAULT '{}',
    p_metadata JSONB DEFAULT '{}',
    p_priority INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_cluster_uuid UUID;
    v_node_id TEXT;
    v_node_uuid UUID;
    v_result JSONB;
    v_coordinator_token TEXT;
BEGIN
    -- Validate input
    IF p_cluster_id IS NULL OR trim(p_cluster_id) = '' THEN
        RAISE EXCEPTION 'Cluster ID is required';
    END IF;
    
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Node name is required';
    END IF;
    
    -- Get cluster UUID
    SELECT id INTO v_cluster_uuid
    FROM clusters
    WHERE cluster_id = p_cluster_id;
    
    IF v_cluster_uuid IS NULL THEN
        RAISE EXCEPTION 'Cluster not found: %', p_cluster_id;
    END IF;
    
    -- Generate unique node ID
    v_node_id := generate_node_id(p_cluster_id);
    
    -- Generate coordinator token
    v_coordinator_token := 'node-token-' || encode(gen_random_bytes(32), 'hex');
    
    -- Create node
    INSERT INTO cluster_nodes (
        cluster_id,
        node_id,
        name,
        status,
        health_status,
        region,
        availability_zone,
        hostname,
        private_ip,
        public_ip,
        capacity_cpu,
        capacity_memory_gb,
        capacity_storage_gb,
        capacity_network_mbps,
        roles,
        config,
        metadata,
        priority,
        node_token
    ) VALUES (
        v_cluster_uuid,
        v_node_id,
        p_name,
        'provisioning',
        'unknown',
        p_region,
        p_availability_zone,
        p_hostname,
        p_private_ip,
        p_public_ip,
        p_capacity_cpu,
        p_capacity_memory_gb,
        p_capacity_storage_gb,
        p_capacity_network_mbps,
        p_roles,
        p_config,
        p_metadata,
        p_priority,
        v_coordinator_token
    ) RETURNING id INTO v_node_uuid;
    
    -- Log node addition event
    INSERT INTO cluster_events (
        cluster_id,
        node_id,
        event_type,
        event_category,
        severity,
        title,
        description,
        details,
        source_agent,
        user_id
    ) VALUES (
        v_cluster_uuid,
        v_node_uuid,
        'node_added',
        'lifecycle',
        'info',
        'Node added to cluster',
        format('Node %s has been added to cluster %s', p_name, p_cluster_id),
        jsonb_build_object(
            'node_id', v_node_id,
            'roles', p_roles,
            'capacity', jsonb_build_object(
                'cpu', p_capacity_cpu,
                'memory_gb', p_capacity_memory_gb,
                'storage_gb', p_capacity_storage_gb,
                'network_mbps', p_capacity_network_mbps
            )
        ),
        'system-agent',
        auth.uid()
    );
    
    -- Update cluster health score
    PERFORM update_cluster_health_score(v_cluster_uuid);
    
    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'node_id', v_node_id,
        'node_uuid', v_node_uuid,
        'cluster_id', p_cluster_id,
        'name', p_name,
        'status', 'provisioning',
        'coordinator_token', v_coordinator_token,
        'message', 'Node added to cluster successfully'
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update node status
CREATE OR REPLACE FUNCTION update_node_status(
    p_node_id TEXT,
    p_status TEXT,
    p_health_status TEXT DEFAULT NULL,
    p_metrics JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_node_uuid UUID;
    v_cluster_uuid UUID;
    v_result JSONB;
    v_old_status TEXT;
    v_old_health_status TEXT;
BEGIN
    -- Validate input
    IF p_node_id IS NULL OR trim(p_node_id) = '' THEN
        RAISE EXCEPTION 'Node ID is required';
    END IF;
    
    -- Get node information
    SELECT id, cluster_id, status, health_status
    INTO v_node_uuid, v_cluster_uuid, v_old_status, v_old_health_status
    FROM cluster_nodes
    WHERE node_id = p_node_id;
    
    IF v_node_uuid IS NULL THEN
        RAISE EXCEPTION 'Node not found: %', p_node_id;
    END IF;
    
    -- Update node status
    UPDATE cluster_nodes
    SET 
        status = p_status,
        health_status = COALESCE(p_health_status, health_status),
        last_heartbeat = now(),
        updated_at = now()
    WHERE id = v_node_uuid;
    
    -- Update metrics if provided
    IF p_metrics IS NOT NULL THEN
        UPDATE cluster_nodes
        SET 
            load_average = COALESCE((p_metrics->>'load_average')::DECIMAL, load_average),
            cpu_usage_percent = COALESCE((p_metrics->>'cpu_usage_percent')::DECIMAL, cpu_usage_percent),
            memory_usage_percent = COALESCE((p_metrics->>'memory_usage_percent')::DECIMAL, memory_usage_percent),
            disk_usage_percent = COALESCE((p_metrics->>'disk_usage_percent')::DECIMAL, disk_usage_percent),
            network_io_mbps = COALESCE((p_metrics->>'network_io_mbps')::DECIMAL, network_io_mbps),
            updated_at = now()
        WHERE id = v_node_uuid;
    END IF;
    
    -- Log status change event
    IF v_old_status != p_status OR v_old_health_status != p_health_status THEN
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
            v_cluster_uuid,
            v_node_uuid,
            'node_status_changed',
            'health',
            'info',
            'Node status updated',
            format('Node %s status changed from %s to %s', p_node_id, v_old_status, p_status),
            jsonb_build_object(
                'old_status', v_old_status,
                'new_status', p_status,
                'old_health_status', v_old_health_status,
                'new_health_status', p_health_status,
                'metrics', p_metrics
            ),
            'node-agent'
        );
    END IF;
    
    -- Update cluster health score
    PERFORM update_cluster_health_score(v_cluster_uuid);
    
    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'node_id', p_node_id,
        'cluster_id', (SELECT cluster_id FROM clusters WHERE id = v_cluster_uuid),
        'status', p_status,
        'health_status', p_health_status,
        'message', 'Node status updated successfully'
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Promote node to primary
CREATE OR REPLACE FUNCTION promote_to_primary(
    p_node_id TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_node_uuid UUID;
    v_cluster_uuid UUID;
    v_result JSONB;
    v_success BOOLEAN;
BEGIN
    -- Validate input
    IF p_node_id IS NULL OR trim(p_node_id) = '' THEN
        RAISE EXCEPTION 'Node ID is required';
    END IF;
    
    -- Get node UUID
    SELECT id, cluster_id INTO v_node_uuid, v_cluster_uuid
    FROM cluster_nodes
    WHERE node_id = p_node_id;
    
    IF v_node_uuid IS NULL THEN
        RAISE EXCEPTION 'Node not found: %', p_node_id;
    END IF;
    
    -- Promote node to primary
    v_success := promote_node_to_primary(v_node_uuid);
    
    IF NOT v_success THEN
        RAISE EXCEPTION 'Failed to promote node to primary';
    END IF;
    
    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'node_id', p_node_id,
        'cluster_id', (SELECT cluster_id FROM clusters WHERE id = v_cluster_uuid),
        'message', 'Node promoted to primary successfully'
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get cluster information
CREATE OR REPLACE FUNCTION get_cluster_info(
    p_cluster_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_cluster_info JSONB;
    v_nodes_info JSONB;
    v_coordination_status JSONB;
BEGIN
    -- If no cluster ID provided, return all clusters
    IF p_cluster_id IS NULL THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', id,
                'cluster_id', cluster_id,
                'name', name,
                'description', description,
                'region', region,
                'version', version,
                'status', status,
                'config', config,
                'metadata', metadata,
                'max_nodes', max_nodes,
                'max_tenants', max_tenants,
                'max_storage_gb', max_storage_gb,
                'health_score', health_score,
                'last_health_check', last_health_check,
                'created_at', created_at,
                'updated_at', updated_at,
                'activated_at', activated_at,
                'tags', tags,
                'labels', labels
            )
        ) INTO v_result
        FROM clusters
        ORDER BY created_at DESC;
        
        IF v_result IS NULL THEN
            v_result := '[]'::jsonb;
        END IF;
        
        RETURN jsonb_build_object('success', true, 'clusters', v_result);
    END IF;
    
    -- Get specific cluster information
    SELECT jsonb_build_object(
        'id', id,
        'cluster_id', cluster_id,
        'name', name,
        'description', description,
        'region', region,
        'version', version,
        'status', status,
        'config', config,
        'metadata', metadata,
        'max_nodes', max_nodes,
        'max_tenants', max_tenants,
        'max_storage_gb', max_storage_gb,
        'health_score', health_score,
        'last_health_check', last_health_check,
        'created_at', created_at,
        'updated_at', updated_at,
        'activated_at', activated_at,
        'tags', tags,
        'labels', labels
    ) INTO v_cluster_info
    FROM clusters
    WHERE cluster_id = p_cluster_id;
    
    IF v_cluster_info IS NULL THEN
        RAISE EXCEPTION 'Cluster not found: %', p_cluster_id;
    END IF;
    
    -- Get cluster nodes
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'node_id', node_id,
            'name', name,
            'status', status,
            'health_status', health_status,
            'region', region,
            'availability_zone', availability_zone,
            'hostname', hostname,
            'private_ip', private_ip,
            'public_ip', public_ip,
            'capacity', jsonb_build_object(
                'cpu', capacity_cpu,
                'memory_gb', capacity_memory_gb,
                'storage_gb', capacity_storage_gb,
                'network_mbps', capacity_network_mbps
            ),
            'usage', jsonb_build_object(
                'cpu', used_cpu,
                'memory_gb', used_memory_gb,
                'storage_gb', used_storage_gb,
                'network_mbps', used_network_mbps
            ),
            'roles', roles,
            'capabilities', capabilities,
            'metrics', jsonb_build_object(
                'load_average', load_average,
                'cpu_usage_percent', cpu_usage_percent,
                'memory_usage_percent', memory_usage_percent,
                'disk_usage_percent', disk_usage_percent,
                'network_io_mbps', network_io_mbps
            ),
            'is_primary', is_primary,
            'is_coordinator', is_coordinator,
            'priority', priority,
            'last_heartbeat', last_heartbeat,
            'last_restart', last_restart,
            'uptime_seconds', uptime_seconds,
            'config', config,
            'metadata', metadata,
            'created_at', created_at,
            'updated_at', updated_at
        )
    ) INTO v_nodes_info
    FROM cluster_nodes
    WHERE cluster_id = (SELECT id FROM clusters WHERE cluster_id = p_cluster_id)
    ORDER BY priority DESC, created_at ASC;
    
    IF v_nodes_info IS NULL THEN
        v_nodes_info := '[]'::jsonb;
    END IF;
    
    -- Get coordination status
    SELECT check_cluster_coordination((SELECT id FROM clusters WHERE cluster_id = p_cluster_id))
    INTO v_coordination_status;
    
    -- Build final result
    v_result := jsonb_build_object(
        'success', true,
        'cluster', v_cluster_info,
        'nodes', v_nodes_info,
        'coordination_status', v_coordination_status,
        'node_count', (SELECT COUNT(*) FROM cluster_nodes WHERE cluster_id = (SELECT id FROM clusters WHERE cluster_id = p_cluster_id)),
        'online_nodes', (SELECT COUNT(*) FROM cluster_nodes WHERE cluster_id = (SELECT id FROM clusters WHERE cluster_id = p_cluster_id) AND status = 'online'),
        'healthy_nodes', (SELECT COUNT(*) FROM cluster_nodes WHERE cluster_id = (SELECT id FROM clusters WHERE cluster_id = p_cluster_id) AND health_status = 'healthy')
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get cluster events
CREATE OR REPLACE FUNCTION get_cluster_events(
    p_cluster_id TEXT,
    p_event_type TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_cluster_uuid UUID;
BEGIN
    -- Get cluster UUID
    SELECT id INTO v_cluster_uuid
    FROM clusters
    WHERE cluster_id = p_cluster_id;
    
    IF v_cluster_uuid IS NULL THEN
        RAISE EXCEPTION 'Cluster not found: %', p_cluster_id;
    END IF;
    
    -- Query events with filters
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'cluster_id', cluster_id,
            'node_id', node_id,
            'event_type', event_type,
            'event_category', event_category,
            'severity', severity,
            'title', title,
            'description', description,
            'details', details,
            'source_agent', source_agent,
            'source_node', source_node,
            'user_id', user_id,
            'status', status,
            'acknowledged_by', acknowledged_by,
            'acknowledged_at', acknowledged_at,
            'parent_event_id', parent_event_id,
            'correlation_id', correlation_id,
            'created_at', created_at,
            'updated_at', updated_at,
            'resolved_at', resolved_at,
            'tags', tags,
            'metadata', metadata
        )
    ) INTO v_result
    FROM cluster_events
    WHERE cluster_id = v_cluster_uuid
        AND (p_event_type IS NULL OR event_type = p_event_type)
        AND (p_severity IS NULL OR severity = p_severity)
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset;
    
    IF v_result IS NULL THEN
        v_result := '[]'::jsonb;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'events', v_result,
        'total_count', (SELECT COUNT(*) FROM cluster_events WHERE cluster_id = v_cluster_uuid)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record cluster metrics
CREATE OR REPLACE FUNCTION record_cluster_metrics(
    p_cluster_id TEXT,
    p_node_id TEXT DEFAULT NULL,
    p_metrics JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_cluster_uuid UUID;
    v_node_uuid UUID DEFAULT NULL;
    v_result JSONB;
    v_metric_record RECORD;
BEGIN
    -- Validate input
    IF p_cluster_id IS NULL OR trim(p_cluster_id) = '' THEN
        RAISE EXCEPTION 'Cluster ID is required';
    END IF;
    
    IF p_metrics IS NULL THEN
        RAISE EXCEPTION 'Metrics data is required';
    END IF;
    
    -- Get cluster UUID
    SELECT id INTO v_cluster_uuid
    FROM clusters
    WHERE cluster_id = p_cluster_id;
    
    IF v_cluster_uuid IS NULL THEN
        RAISE EXCEPTION 'Cluster not found: %', p_cluster_id;
    END IF;
    
    -- Get node UUID if provided
    IF p_node_id IS NOT NULL THEN
        SELECT id INTO v_node_uuid
        FROM cluster_nodes
        WHERE node_id = p_node_id AND cluster_id = v_cluster_uuid;
    END IF;
    
    -- Insert metrics
    FOR v_metric_record IN 
        SELECT * FROM jsonb_each_text(p_metrics)
    LOOP
        INSERT INTO cluster_metrics (
            cluster_id,
            node_id,
            metric_name,
            metric_category,
            metric_type,
            value,
            unit,
            dimensions,
            labels,
            collection_method,
            source_agent
        ) VALUES (
            v_cluster_uuid,
            v_node_uuid,
            v_metric_record.key,
            'system',
            'gauge',
            v_metric_record.value::DECIMAL,
            NULL,
            '{}',
            '{}',
            'agent',
            'node-agent'
        );
    END LOOP;
    
    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'cluster_id', p_cluster_id,
        'node_id', p_node_id,
        'metrics_recorded', (SELECT COUNT(*) FROM jsonb_each_text(p_metrics)),
        'message', 'Metrics recorded successfully'
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decommission cluster
CREATE OR REPLACE FUNCTION decommission_cluster(
    p_cluster_id TEXT,
    p_force BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
    v_cluster_uuid UUID;
    v_result JSONB;
    v_node_count INTEGER;
    v_tenant_count INTEGER;
BEGIN
    -- Validate input
    IF p_cluster_id IS NULL OR trim(p_cluster_id) = '' THEN
        RAISE EXCEPTION 'Cluster ID is required';
    END IF;
    
    -- Get cluster UUID
    SELECT id INTO v_cluster_uuid
    FROM clusters
    WHERE cluster_id = p_cluster_id;
    
    IF v_cluster_uuid IS NULL THEN
        RAISE EXCEPTION 'Cluster not found: %', p_cluster_id;
    END IF;
    
    -- Check if cluster can be decommissioned
    IF NOT p_force THEN
        -- Count nodes
        SELECT COUNT(*) INTO v_node_count
        FROM cluster_nodes
        WHERE cluster_id = v_cluster_uuid AND status != 'decommissioning';
        
        -- Count tenants (if tenants table has cluster_id)
        BEGIN
            SELECT COUNT(*) INTO v_tenant_count
            FROM tenants
            WHERE cluster_id = v_cluster_uuid;
        EXCEPTION
            WHEN UNDEFINED_COLUMN THEN
                v_tenant_count := 0;
        END;
        
        IF v_node_count > 0 THEN
            RAISE EXCEPTION 'Cluster has % active node(s). Decommission nodes first or use force=true', v_node_count;
        END IF;
        
        IF v_tenant_count > 0 THEN
            RAISE EXCEPTION 'Cluster has % tenant(s). Migrate tenants first or use force=true', v_tenant_count;
        END IF;
    END IF;
    
    -- Update cluster status
    UPDATE clusters
    SET 
        status = 'decommissioning',
        decommissioned_at = now(),
        updated_at = now()
    WHERE id = v_cluster_uuid;
    
    -- Decommission all nodes
    UPDATE cluster_nodes
    SET 
        status = 'decommissioning',
        updated_at = now()
    WHERE cluster_id = v_cluster_uuid;
    
    -- Log decommission event
    INSERT INTO cluster_events (
        cluster_id,
        event_type,
        event_category,
        severity,
        title,
        description,
        details,
        source_agent,
        user_id
    ) VALUES (
        v_cluster_uuid,
        'cluster_decommissioned',
        'lifecycle',
        'warning',
        'Cluster decommissioned',
        format('Cluster %s has been decommissioned', p_cluster_id),
        jsonb_build_object(
            'force', p_force,
            'node_count', v_node_count,
            'tenant_count', v_tenant_count
        ),
        'system-agent',
        auth.uid()
    );
    
    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'cluster_id', p_cluster_id,
        'status', 'decommissioning',
        'message', 'Cluster decommissioned successfully'
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get cluster health summary
CREATE OR REPLACE FUNCTION get_cluster_health_summary(
    p_cluster_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_health_data JSONB;
BEGIN
    -- If no cluster ID provided, return summary for all clusters
    IF p_cluster_id IS NULL THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'cluster_id', cluster_id,
                'name', name,
                'status', status,
                'health_score', health_score,
                'last_health_check', last_health_check,
                'node_count', (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id),
                'online_nodes', (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.status = 'online'),
                'healthy_nodes', (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.health_status = 'healthy'),
                'has_primary', (SELECT COUNT(*) > 0 FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.is_primary = true AND cn.status = 'online'),
                'has_coordinator', (SELECT COUNT(*) > 0 FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.is_coordinator = true AND cn.status = 'online')
            )
        ) INTO v_result
        FROM clusters c
        ORDER BY health_score ASC;
        
        IF v_result IS NULL THEN
            v_result := '[]'::jsonb;
        END IF;
        
        RETURN jsonb_build_object('success', true, 'clusters', v_result);
    END IF;
    
    -- Get specific cluster health summary
    SELECT jsonb_build_object(
        'cluster_id', cluster_id,
        'name', name,
        'status', status,
        'health_score', health_score,
        'last_health_check', last_health_check,
        'coordination_status', check_cluster_coordination(id),
        'node_count', (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id),
        'online_nodes', (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.status = 'online'),
        'healthy_nodes', (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.health_status = 'healthy'),
        'degraded_nodes', (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.health_status = 'warning'),
        'critical_nodes', (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.health_status = 'critical'),
        'offline_nodes', (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.status = 'offline'),
        'has_primary', (SELECT COUNT(*) > 0 FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.is_primary = true AND cn.status = 'online'),
        'has_coordinator', (SELECT COUNT(*) > 0 FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.is_coordinator = true AND cn.status = 'online'),
        'recommendations', (
            SELECT jsonb_agg(recommendation)
            FROM unnest(ARRAY[
                CASE WHEN (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.status = 'online') = 0 
                    THEN 'No online nodes found' ELSE NULL END,
                CASE WHEN (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.is_primary = true AND cn.status = 'online') = 0 
                    THEN 'No online primary node found' ELSE NULL END,
                CASE WHEN (SELECT COUNT(*) FROM cluster_nodes cn WHERE cn.cluster_id = c.id AND cn.is_coordinator = true AND cn.status = 'online') = 0 
                    THEN 'No online coordinator node found' ELSE NULL END,
                CASE WHEN health_score < 0.7 
                    THEN format('Cluster health score is low (%.2f)', health_score) ELSE NULL END
            ]) recommendation
            WHERE recommendation IS NOT NULL
        )
    ) INTO v_health_data
    FROM clusters c
    WHERE cluster_id = p_cluster_id;
    
    IF v_health_data IS NULL THEN
        RAISE EXCEPTION 'Cluster not found: %', p_cluster_id;
    END IF;
    
    RETURN jsonb_build_object('success', true, 'health', v_health_data);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on all functions
GRANT EXECUTE ON FUNCTION create_cluster(TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, INTEGER, INTEGER, INTEGER, TEXT[], JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION add_cluster_node(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT[], JSONB, JSONB, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION update_node_status(TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION promote_to_primary(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cluster_info(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cluster_events(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION record_cluster_metrics(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION decommission_cluster(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cluster_health_summary(TEXT) TO authenticated;
-- Skills System Tables for Eneas-OS
-- This migration creates tables for skill execution tracking and management

-- Skills table - stores skill metadata and definitions
CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('database', 'security', 'domain', 'system', 'development')),
    priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    expected_duration TEXT,
    file_path TEXT NOT NULL,
    required_agents TEXT[] NOT NULL,
    required_permissions TEXT[] NOT NULL,
    dependencies TEXT[] DEFAULT '{}',
    objectives TEXT[] NOT NULL,
    prerequisites TEXT[] NOT NULL,
    validation_criteria JSONB NOT NULL DEFAULT '{}',
    error_handling JSONB NOT NULL DEFAULT '{}',
    success_metrics JSONB NOT NULL DEFAULT '{}',
    agent_interfaces JSONB NOT NULL DEFAULT '{}',
    expected_outputs JSONB NOT NULL DEFAULT '{}',
    post_execution JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    version INTEGER DEFAULT 1
);

-- Skill executions table - tracks skill execution instances
CREATE TABLE IF NOT EXISTS skill_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    execution_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error_message TEXT,
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 0,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    triggered_by TEXT NOT NULL CHECK (triggered_by IN ('system', 'user', 'agent')),
    triggered_by_user UUID REFERENCES auth.users(id),
    tenant_id UUID REFERENCES tenants(id),
    logs JSONB DEFAULT '[]',
    validation_results JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Skill execution steps table - detailed tracking of each step
CREATE TABLE IF NOT EXISTS skill_execution_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES skill_executions(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    commands TEXT[] NOT NULL,
    assigned_agent TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    output_data JSONB DEFAULT '{}',
    error_message TEXT,
    logs JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(execution_id, step_number)
);

-- Skill performance metrics table
CREATE TABLE IF NOT EXISTS skill_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    execution_date DATE NOT NULL,
    total_executions INTEGER DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    failed_executions INTEGER DEFAULT 0,
    avg_duration_ms INTEGER,
    min_duration_ms INTEGER,
    max_duration_ms INTEGER,
    success_rate DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE 
            WHEN total_executions > 0 THEN 
                ROUND((successful_executions::DECIMAL / total_executions::DECIMAL) * 100, 2)
            ELSE 0 
        END
    ) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(skill_id, agent_id, execution_date)
);

-- Skill dependencies table
CREATE TABLE IF NOT EXISTS skill_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    depends_on_skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL CHECK (dependency_type IN ('required', 'optional', 'runtime')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(skill_id, depends_on_skill_id)
);

-- Skill schedules table - for automated skill execution
CREATE TABLE IF NOT EXISTS skill_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    schedule_name TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    input_data JSONB DEFAULT '{}',
    last_execution TIMESTAMP WITH TIME ZONE,
    next_execution TIMESTAMP WITH TIME ZONE,
    execution_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) Policies
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_execution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_schedules ENABLE ROW LEVEL SECURITY;

-- Skills RLS Policies
CREATE POLICY "Skills viewable by users with system permission" ON skills
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid() 
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

CREATE POLICY "Skills manageable by users with system permission" ON skills
    FOR ALL USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid() 
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Skill Executions RLS Policies
CREATE POLICY "Skill executions viewable by tenant members" ON skill_executions
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid() 
                AND p.tenant_id = skill_executions.tenant_id
            ) OR
            EXISTS (
                SELECT 1 FROM profiles p
                JOIN user_roles ur ON p.id = ur.user_id
                JOIN roles r ON ur.role_id = r.id
                WHERE p.id = auth.uid() 
                AND r.name IN ('owner', 'admin', 'system')
            )
        )
    );

CREATE POLICY "Skill executions manageable by system admins" ON skill_executions
    FOR ALL USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid() 
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Skill Execution Steps RLS Policies
CREATE POLICY "Skill execution steps viewable by tenant members" ON skill_execution_steps
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM skill_executions se
            WHERE se.id = skill_execution_steps.execution_id
            AND (
                (auth.uid() IS NOT NULL AND EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid() 
                    AND p.tenant_id = se.tenant_id
                )) OR
                (auth.uid() IS NOT NULL AND EXISTS (
                    SELECT 1 FROM profiles p
                    JOIN user_roles ur ON p.id = ur.user_id
                    JOIN roles r ON ur.role_id = r.id
                    WHERE p.id = auth.uid() 
                    AND r.name IN ('owner', 'admin', 'system')
                ))
            )
        )
    );

-- Performance Metrics RLS Policies
CREATE POLICY "Performance metrics viewable by system admins" ON skill_performance_metrics
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid() 
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Dependencies RLS Policies
CREATE POLICY "Dependencies viewable by users with system permission" ON skill_dependencies
    FOR ALL USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid() 
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Schedules RLS Policies
CREATE POLICY "Schedules viewable by tenant members" ON skill_schedules
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid() 
                AND p.tenant_id = skill_schedules.tenant_id
            ) OR
            EXISTS (
                SELECT 1 FROM profiles p
                JOIN user_roles ur ON p.id = ur.user_id
                JOIN roles r ON ur.role_id = r.id
                WHERE p.id = auth.uid() 
                AND r.name IN ('owner', 'admin', 'system')
            )
        )
    );

CREATE POLICY "Schedules manageable by system admins" ON skill_schedules
    FOR ALL USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE p.id = auth.uid() 
            AND r.name IN ('owner', 'admin', 'system')
        )
    );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_skill_executions_skill_id ON skill_executions(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_agent_id ON skill_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_status ON skill_executions(status);
CREATE INDEX IF NOT EXISTS idx_skill_executions_start_time ON skill_executions(start_time);
CREATE INDEX IF NOT EXISTS idx_skill_executions_tenant_id ON skill_executions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_skill_execution_steps_execution_id ON skill_execution_steps(execution_id);
CREATE INDEX IF NOT EXISTS idx_skill_execution_steps_status ON skill_execution_steps(status);

CREATE INDEX IF NOT EXISTS idx_skill_performance_metrics_skill_id ON skill_performance_metrics(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_performance_metrics_execution_date ON skill_performance_metrics(execution_date);

CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_priority ON skills(priority);
CREATE INDEX IF NOT EXISTS idx_skills_active ON skills(is_active);

CREATE INDEX IF NOT EXISTS idx_skill_schedules_skill_id ON skill_schedules(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_schedules_active ON skill_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_skill_schedules_next_execution ON skill_schedules(next_execution);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_skills_timestamp
    BEFORE UPDATE ON skills
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_skill_executions_timestamp
    BEFORE UPDATE ON skill_executions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_skill_execution_steps_timestamp
    BEFORE UPDATE ON skill_execution_steps
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_skill_performance_metrics_timestamp
    BEFORE UPDATE ON skill_performance_metrics
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_skill_schedules_timestamp
    BEFORE UPDATE ON skill_schedules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Function to update performance metrics
CREATE OR REPLACE FUNCTION update_skill_performance_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update performance metrics when execution completes
    IF NEW.status IN ('completed', 'failed') AND OLD.status NOT IN ('completed', 'failed') THEN
        INSERT INTO skill_performance_metrics (
            skill_id, 
            agent_id, 
            execution_date, 
            total_executions, 
            successful_executions, 
            failed_executions,
            avg_duration_ms,
            min_duration_ms,
            max_duration_ms
        ) VALUES (
            NEW.skill_id,
            NEW.agent_id,
            NEW.start_time::date,
            1,
            CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
            CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
            NEW.duration_ms,
            NEW.duration_ms,
            NEW.duration_ms
        )
        ON CONFLICT (skill_id, agent_id, execution_date)
        DO UPDATE SET
            total_executions = skill_performance_metrics.total_executions + 1,
            successful_executions = skill_performance_metrics.successful_executions + 
                CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
            failed_executions = skill_performance_metrics.failed_executions + 
                CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
            avg_duration_ms = (
                (skill_performance_metrics.avg_duration_ms * skill_performance_metrics.total_executions + NEW.duration_ms) / 
                (skill_performance_metrics.total_executions + 1)
            ),
            min_duration_ms = LEAST(skill_performance_metrics.min_duration_ms, NEW.duration_ms),
            max_duration_ms = GREATEST(skill_performance_metrics.max_duration_ms, NEW.duration_ms),
            updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_skill_performance_metrics
    AFTER UPDATE ON skill_executions
    FOR EACH ROW EXECUTE FUNCTION update_skill_performance_metrics();

-- Comments for documentation
COMMENT ON TABLE skills IS 'Stores skill definitions and metadata for autonomous agents';
COMMENT ON TABLE skill_executions IS 'Tracks individual skill execution instances';
COMMENT ON TABLE skill_execution_steps IS 'Detailed tracking of each step within skill execution';
COMMENT ON TABLE skill_performance_metrics IS 'Aggregated performance metrics for skills';
COMMENT ON TABLE skill_dependencies IS 'Defines dependencies between skills';
COMMENT ON TABLE skill_schedules IS 'Automated execution schedules for skills';
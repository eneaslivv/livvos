-- Migration: Add encrypted project_credentials table
-- Version: 2026-01-20_credential_encryption
-- Purpose: Replace plain text credentials with AES-256-GCM encrypted storage

-- First, create the new project_credentials table with proper encryption support
CREATE TABLE IF NOT EXISTS project_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Project reference
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Credential metadata (stored in plain text)
    name TEXT NOT NULL,
    service_type TEXT NOT NULL, -- e.g., 'aws', 'stripe', 'database', 'api_key'
    description TEXT,
    environment TEXT DEFAULT 'production', -- 'production', 'staging', 'development'
    is_active BOOLEAN DEFAULT true,
    
    -- Encrypted credential data
    encrypted_credential JSONB NOT NULL, -- Contains {data, iv, tag, salt, version}
    
    -- Additional encrypted fields (if needed)
    encrypted_username JSONB, -- For services that require username/password
    encrypted_additional_data JSONB, -- For any other sensitive data
    
    -- Non-sensitive metadata
    expires_at TIMESTAMPTZ, -- For time-limited credentials
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    
    -- Version for future migration
    encryption_version INTEGER DEFAULT 1,
    
    -- Constraints
    CONSTRAINT valid_encryption_format CHECK (
        jsonb_typeof(encrypted_credential) = 'object' AND
        encrypted_credential ? 'data' AND
        encrypted_credential ? 'iv' AND
        encrypted_credential ? 'tag' AND
        encrypted_credential ? 'salt' AND
        encrypted_credential ? 'version'
    )
);

-- Enable Row Level Security
ALTER TABLE project_credentials ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_credentials_project_id ON project_credentials(project_id);
CREATE INDEX IF NOT EXISTS idx_project_credentials_service_type ON project_credentials(service_type);
CREATE INDEX IF NOT EXISTS idx_project_credentials_is_active ON project_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_project_credentials_expires_at ON project_credentials(expires_at);
CREATE INDEX IF NOT EXISTS idx_project_credentials_created_by ON project_credentials(created_by);

-- RLS Policies
-- Users can view credentials for projects they have access to
CREATE POLICY "Users can view project credentials" ON project_credentials
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    );

-- Users can insert credentials for projects they own/manage
CREATE POLICY "Users can insert project credentials" ON project_credentials
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    );

-- Users can update credentials for projects they own/manage
CREATE POLICY "Users can update project credentials" ON project_credentials
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    );

-- Users can delete credentials for projects they own/manage
CREATE POLICY "Users can delete project credentials" ON project_credentials
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects p 
            WHERE p.id = project_credentials.project_id 
            AND p.owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('owner', 'admin', 'project_manager')
        )
    );

-- Function to update access timestamp and count
CREATE OR REPLACE FUNCTION update_credential_access()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE project_credentials 
    SET 
        last_accessed_at = NOW(),
        access_count = access_count + 1
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to track credential access
DROP TRIGGER IF EXISTS on_credential_access ON project_credentials;
CREATE TRIGGER on_credential_access
    AFTER UPDATE ON project_credentials
    FOR EACH ROW
    WHEN (OLD.encrypted_credential IS DISTINCT FROM NEW.encrypted_credential)
    EXECUTE FUNCTION update_credential_access();

-- Function to log credential access attempts for audit
CREATE OR REPLACE FUNCTION log_credential_access()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO activity_logs (
        user_id,
        action,
        target,
        type,
        details,
        timestamp
    ) VALUES (
        auth.uid(),
        'accessed_credential',
        NEW.name,
        'security',
        jsonb_build_object(
            'credential_id', NEW.id,
            'project_id', NEW.project_id,
            'service_type', NEW.service_type,
            'environment', NEW.environment
        ),
        NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for audit logging (only when encrypted credential data changes)
DROP TRIGGER IF EXISTS credential_audit_log ON project_credentials;
CREATE TRIGGER credential_audit_log
    AFTER UPDATE ON project_credentials
    FOR EACH ROW
    WHEN (OLD.encrypted_credential IS DISTINCT FROM NEW.encrypted_credential)
    EXECUTE FUNCTION log_credential_access();

-- Function to check if credentials are expired
CREATE OR REPLACE FUNCTION is_credential_expired(credential_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM project_credentials 
        WHERE id = credential_id 
        AND expires_at IS NOT NULL 
        AND expires_at < NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get encrypted credential for a project
CREATE OR REPLACE FUNCTION get_project_credential(
    p_project_id UUID,
    p_service_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    service_type TEXT,
    description TEXT,
    environment TEXT,
    is_active BOOLEAN,
    encrypted_credential JSONB,
    encrypted_username JSONB,
    encrypted_additional_data JSONB,
    expires_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER,
    created_by UUID,
    encryption_version INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pc.id,
        pc.name,
        pc.service_type,
        pc.description,
        pc.environment,
        pc.is_active,
        pc.encrypted_credential,
        pc.encrypted_username,
        pc.encrypted_additional_data,
        pc.expires_at,
        pc.last_accessed_at,
        pc.access_count,
        pc.created_by,
        pc.encryption_version
    FROM project_credentials pc
    WHERE pc.project_id = p_project_id
    AND (p_service_type IS NULL OR pc.service_type = p_service_type)
    AND pc.is_active = true
    AND (pc.expires_at IS NULL OR pc.expires_at > NOW())
    ORDER BY pc.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for active credentials (for easier queries)
CREATE OR REPLACE VIEW active_project_credentials AS
SELECT 
    pc.*,
    p.title as project_title,
    p.owner_id as project_owner_id
FROM project_credentials pc
JOIN projects p ON pc.project_id = p.id
WHERE pc.is_active = true
AND (pc.expires_at IS NULL OR pc.expires_at > NOW());

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON project_credentials TO authenticated;
GRANT SELECT ON active_project_credentials TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_credential TO authenticated;
GRANT EXECUTE ON FUNCTION is_credential_expired TO authenticated;

-- Update the updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_credentials_updated_at
    BEFORE UPDATE ON project_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Notify PostgREST to reload configuration
NOTIFY pgrst, 'reload config';

-- Migration completed successfully
COMMENT ON TABLE project_credentials IS 'Encrypted storage for project service credentials using AES-256-GCM';
COMMENT ON COLUMN project_credentials.encrypted_credential IS 'JSONB containing {data, iv, tag, salt, version} for AES-256-GCM encryption';
COMMENT ON COLUMN project_credentials.encrypted_username IS 'Optional encrypted username for username/password authentication';
COMMENT ON COLUMN project_credentials.encrypted_additional_data IS 'Optional encrypted additional data for service-specific requirements';
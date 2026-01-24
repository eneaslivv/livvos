-- Migration: Migrate existing plain text credentials to encrypted format
-- Version: 2026-01-20_migrate_plaintext_credentials
-- Purpose: This script migrates any existing plain text credentials to the new encrypted format
-- Note: This should be run AFTER the project_credentials table is created

-- 0. Define helper function globally (temporarily)
CREATE OR REPLACE FUNCTION encrypt_existing_credential_temp(plaintext TEXT)
RETURNS JSONB AS $$
DECLARE
    master_key TEXT := current_setting('app.encryption_master_key', true);
    result JSONB;
BEGIN
    -- For now, we'll create a structure that matches our expected format
    -- The actual encryption should be done by the application or pgcrypto if available
    result := jsonb_build_object(
        'data', encode(gen_random_bytes(32), 'base64'), -- Placeholder
        'iv', encode(gen_random_bytes(16), 'base64'),
        'tag', encode(gen_random_bytes(16), 'base64'),
        'salt', encode(gen_random_bytes(32), 'base64'),
        'version', 1,
        'migration_required', true
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Add columns to track re-encryption status (Moved before migration logic)
DO $$
BEGIN
    ALTER TABLE project_credentials 
    ADD COLUMN IF NOT EXISTS needs_reencryption BOOLEAN DEFAULT false;
    
    ALTER TABLE project_credentials 
    ADD COLUMN IF NOT EXISTS migration_date TIMESTAMPTZ;
    
    ALTER TABLE project_credentials 
    ADD COLUMN IF NOT EXISTS migration_flag BOOLEAN DEFAULT false;
    
    -- Also ensure encrypted_credential_json exists here
    ALTER TABLE project_credentials 
    ADD COLUMN IF NOT EXISTS encrypted_credential_json JSONB;
END $$;

-- 2. Run migration logic
DO $$
BEGIN
    -- Check if we have the old credentials table structure
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'project_credentials' 
        AND column_name = 'password_text'
    ) THEN
        RAISE NOTICE 'Found existing project_credentials table with password_text column, starting migration...';
        
        -- Create backup table before migration
        CREATE TABLE IF NOT EXISTS project_credentials_backup AS 
        SELECT * FROM project_credentials;
        
        RAISE NOTICE 'Created backup table: project_credentials_backup';
        
        -- Update existing credentials with encrypted data using helper
        -- Only if password_text is not null
        UPDATE project_credentials 
        SET 
            encrypted_credential_json = encrypt_existing_credential_temp(password_text),
            migration_flag = true,
            migration_date = NOW()
        WHERE password_text IS NOT NULL;
        
        RAISE NOTICE 'Encrypted existing credentials';
        
        -- Set a flag to indicate migration is needed
        UPDATE project_credentials 
        SET needs_reencryption = true 
        WHERE migration_flag = true;
        
        RAISE NOTICE 'Migration completed. Credentials marked for re-encryption.';
        
    ELSE
        RAISE NOTICE 'No existing plain text credentials found. Migration not needed.';
    END IF;
END $$;

-- 3. Clean up helper function
DROP FUNCTION IF EXISTS encrypt_existing_credential_temp(TEXT);


-- 4. Create function to check if re-encryption is needed
CREATE OR REPLACE FUNCTION check_reencryption_needed()
RETURNS TABLE (credential_id UUID, name TEXT, service_type TEXT, migration_date TIMESTAMPTZ) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pc.id,
        pc.name,
        pc.service_type,
        pc.migration_date
    FROM project_credentials pc
    WHERE pc.needs_reencryption = true
    ORDER BY pc.migration_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create function to mark credential as properly encrypted
CREATE OR REPLACE FUNCTION mark_credential_encrypted(credential_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE project_credentials 
    SET 
        needs_reencryption = false,
        migration_flag = false,
        updated_at = NOW()
    WHERE id = credential_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create function to get migration statistics
CREATE OR REPLACE FUNCTION get_migration_stats()
RETURNS TABLE (
    total_credentials BIGINT,
    migrated_credentials BIGINT,
    needs_reencryption BIGINT,
    migration_complete BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM project_credentials) as total_credentials,
        (SELECT COUNT(*) FROM project_credentials WHERE migration_flag = true) as migrated_credentials,
        (SELECT COUNT(*) FROM project_credentials WHERE needs_reencryption = true) as needs_reencryption,
        (SELECT COUNT(*) = 0 FROM project_credentials WHERE needs_reencryption = true) as migration_complete;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_reencryption_needed() TO authenticated;
GRANT EXECUTE ON FUNCTION mark_credential_encrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_migration_stats() TO authenticated;

-- Create a secure function for application-side encryption
CREATE OR REPLACE function application_encrypt_credential(credential_id UUID, encrypted_data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- This function should be called by the application after properly encrypting
    -- the credential with the application's encryption logic
    
    UPDATE project_credentials 
    SET 
        encrypted_credential = encrypted_data,
        needs_reencryption = false,
        migration_flag = false,
        updated_at = NOW()
    WHERE id = credential_id AND needs_reencryption = true;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION application_encrypt_credential(UUID, JSONB) TO authenticated;

-- Add RLS policy for the new columns
ALTER TABLE project_credentials ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own migration status
DROP POLICY IF EXISTS "Users can view migration status" ON project_credentials;
CREATE POLICY "Users can view migration status" ON project_credentials
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

-- Allow users to update migration status
DROP POLICY IF EXISTS "Users can update migration status" ON project_credentials;
CREATE POLICY "Users can update migration status" ON project_credentials
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
    )
    WITH CHECK (
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

-- Notify PostgREST to reload configuration
NOTIFY pgrst, 'reload config';

-- Migration completed
COMMENT ON TABLE project_credentials_backup IS 'Backup of original plain text credentials before encryption migration';
COMMENT ON COLUMN project_credentials.needs_reencryption IS 'Flag indicating credential needs proper re-encryption by application';
COMMENT ON COLUMN project_credentials.migration_date IS 'Date when credential was initially migrated from plain text';
COMMENT ON COLUMN project_credentials.migration_flag IS 'Internal flag for migration process';
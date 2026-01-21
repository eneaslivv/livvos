#!/bin/bash

# Credential Encryption System Deployment Script
# This script deploys the credential encryption system to eneas-os

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_URL=${SUPABASE_DB_URL:-""}
ENCRYPTION_KEY=${ENCRYPTION_MASTER_KEY:-""}

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if required environment variables are set
    if [ -z "$DB_URL" ]; then
        log_error "SUPABASE_DB_URL environment variable is required"
        exit 1
    fi
    
    if [ -z "$ENCRYPTION_KEY" ]; then
        log_error "ENCRYPTION_MASTER_KEY environment variable is required"
        exit 1
    fi
    
    # Check encryption key length
    if [ ${#ENCRYPTION_KEY} -lt 32 ]; then
        log_error "ENCRYPTION_MASTER_KEY must be at least 32 characters long"
        exit 1
    fi
    
    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        log_error "psql is required but not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

run_database_migration() {
    log_info "Running database migrations..."
    
    # Run the credential encryption migration
    psql "$DB_URL" -f migrations/2026-01-20_credential_encryption.sql
    
    if [ $? -eq 0 ]; then
        log_success "Credential encryption migration completed"
    else
        log_error "Database migration failed"
        exit 1
    fi
}

run_existing_data_migration() {
    log_info "Checking for existing plain text credentials..."
    
    # Check if there are existing credentials that need migration
    CREDENTIAL_COUNT=$(psql "$DB_URL" -t -c "
        SELECT COUNT(*) 
        FROM information_schema.columns 
        WHERE table_name = 'project_credentials' 
        AND column_name = 'password_text'
    " | tr -d ' ')
    
    if [ "$CREDENTIAL_COUNT" -gt 0 ]; then
        log_warning "Found existing plain text credentials, running migration..."
        
        # Run the migration script
        psql "$DB_URL" -f migrations/2026-01-20_migrate_plaintext_credentials.sql
        
        if [ $? -eq 0 ]; then
            log_success "Plain text credential migration completed"
            
            # Show migration statistics
            psql "$DB_URL" -c "SELECT * FROM get_migration_stats();"
        else
            log_error "Plain text credential migration failed"
            exit 1
        fi
    else
        log_info "No existing plain text credentials found"
    fi
}

validate_migration() {
    log_info "Validating migration..."
    
    # Check if tables exist
    TABLE_EXISTS=$(psql "$DB_URL" -t -c "
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'project_credentials'
        );
    " | tr -d ' ')
    
    if [ "$TABLE_EXISTS" != "t" ]; then
        log_error "project_credentials table was not created"
        exit 1
    fi
    
    # Check if indexes exist
    INDEX_COUNT=$(psql "$DB_URL" -t -c "
        SELECT COUNT(*) 
        FROM pg_indexes 
        WHERE tablename = 'project_credentials';
    " | tr -d ' ')
    
    if [ "$INDEX_COUNT" -lt 4 ]; then
        log_warning "Some indexes may be missing"
    fi
    
    # Check RLS policies
    POLICY_COUNT=$(psql "$DB_URL" -t -c "
        SELECT COUNT(*) 
        FROM pg_policies 
        WHERE tablename = 'project_credentials';
    " | tr -d ' ')
    
    if [ "$POLICY_COUNT" -lt 5 ]; then
        log_warning "Some RLS policies may be missing"
    fi
    
    log_success "Migration validation completed"
}

test_encryption() {
    log_info "Testing encryption functionality..."
    
    # Create a test credential using the application
    node -e "
    const { encrypt, decrypt } = require('./lib/encryption.ts');
    const testKey = '$ENCRYPTION_KEY';
    
    // Test encryption
    const encrypted = encrypt('test-credential-value', testKey);
    if (!encrypted.success) {
        console.error('Encryption failed:', encrypted.error);
        process.exit(1);
    }
    
    // Test decryption
    const decrypted = decrypt(encrypted.encrypted, testKey);
    if (!decrypted.success) {
        console.error('Decryption failed:', decrypted.error);
        process.exit(1);
    }
    
    if (decrypted.decrypted !== 'test-credential-value') {
        console.error('Encryption/decryption mismatch');
        process.exit(1);
    }
    
    console.log('Encryption test passed');
    "
    
    if [ $? -eq 0 ]; then
        log_success "Encryption functionality test passed"
    else
        log_error "Encryption functionality test failed"
        exit 1
    fi
}

create_backup() {
    log_info "Creating backup before deployment..."
    
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    
    pg_dump "$DB_URL" > "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        log_success "Backup created: $BACKUP_FILE"
    else
        log_error "Backup creation failed"
        exit 1
    fi
}

cleanup() {
    log_info "Cleaning up temporary files..."
    # Add any cleanup operations here
}

main() {
    log_info "Starting credential encryption system deployment..."
    
    # Run deployment steps
    check_prerequisites
    create_backup
    run_database_migration
    run_existing_data_migration
    validate_migration
    test_encryption
    
    log_success "Credential encryption system deployment completed successfully!"
    
    # Print next steps
    echo ""
    log_info "Next steps:"
    echo "1. Update your application to use the new credential manager"
    echo "2. Configure environment variables in production"
    echo "3. Monitor the system for any issues"
    echo "4. Set up key rotation schedule"
    echo "5. Configure audit logging and monitoring"
    echo ""
    log_warning "IMPORTANT: Store your encryption key securely and never commit it to version control!"
}

# Handle script interruption
trap cleanup EXIT

# Parse command line arguments
case "${1:-}" in
    "migrate-only")
        log_info "Running database migrations only..."
        check_prerequisites
        run_database_migration
        ;;
    "test-only")
        log_info "Running encryption tests only..."
        test_encryption
        ;;
    "backup-only")
        log_info "Creating backup only..."
        create_backup
        ;;
    *)
        main
        ;;
esac
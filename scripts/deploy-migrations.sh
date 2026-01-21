# =============================================
# MIGRATION DEPLOYMENT SYSTEM
# =============================================
# Comprehensive database migration deployment script for eneas-os
# Supports multiple environments, rollback, validation, and monitoring
# =============================================

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# =============================================
# CONFIGURATION
# =============================================

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_ROOT/migrations"
LOGS_DIR="$PROJECT_ROOT/logs/migrations"
BACKUP_DIR="$PROJECT_ROOT/backups/migrations"

# Create necessary directories
mkdir -p "$LOGS_DIR" "$BACKUP_DIR"

# Environment configuration
ENVIRONMENT="${ENVIRONMENT:-dev}"
DATABASE_URL="${DATABASE_URL:-}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"

# Migration configuration
DRY_RUN="${DRY_RUN:-false}"
FORCE_RUN="${FORCE_RUN:-false}"
SKIP_BACKUP="${SKIP_BACKUP:-false}"
PARALLEL_JOBS="${PARALLEL_JOBS:-4}"
TIMEOUT="${TIMEOUT:-300}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================
# LOGGING FUNCTIONS
# =============================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local log_file="$LOGS_DIR/migration_$(date '+%Y%m%d').log"
    
    echo -e "${level}[$timestamp] $message" | tee -a "$log_file"
}

info() {
    log "${BLUE}[INFO]${NC}" "$@"
}

warn() {
    log "${YELLOW}[WARN]${NC}" "$@"
}

error() {
    log "${RED}[ERROR]${NC}" "$@"
}

success() {
    log "${GREEN}[SUCCESS]${NC}" "$@"
}

# =============================================
# VALIDATION FUNCTIONS
# =============================================

validate_environment() {
    info "Validating environment configuration..."
    
    # Check required environment variables
    case "$ENVIRONMENT" in
        dev|development)
            info "Running in development mode"
            ;;
        staging|stage)
            warn "Running in staging mode - extra safety checks enabled"
            ;;
        prod|production)
            error "Production deployment requires additional confirmation"
            if [[ "$FORCE_RUN" != "true" ]]; then
                echo "To deploy to production, set FORCE_RUN=true"
                exit 1
            fi
            ;;
        *)
            error "Invalid environment: $ENVIRONMENT. Use: dev, staging, or prod"
            exit 1
            ;;
    esac
    
    # Validate database connection
    if [[ -z "$DATABASE_URL" && -z "$SUPABASE_URL" ]]; then
        error "Database connection not configured. Set DATABASE_URL or SUPABASE_URL"
        exit 1
    fi
    
    # Check migration files exist
    if [[ ! -d "$MIGRATIONS_DIR" ]]; then
        error "Migrations directory not found: $MIGRATIONS_DIR"
        exit 1
    fi
    
    success "Environment validation passed"
}

validate_migration_file() {
    local file="$1"
    local filename=$(basename "$file")
    
    # Check file extension
    if [[ "$filename" != *.sql ]]; then
        error "Migration file must be .sql: $filename"
        return 1
    fi
    
    # Check file format (YYYY-MM-DD_description.sql)
    if [[ ! "$filename" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_.*\.sql$ ]]; then
        error "Migration file must follow format YYYY-MM-DD_description.sql: $filename"
        return 1
    fi
    
    # Check file is readable
    if [[ ! -r "$file" ]]; then
        error "Migration file is not readable: $filename"
        return 1
    fi
    
    # Basic SQL syntax check (simple but catches common errors)
    if ! grep -q ";" "$file"; then
        warn "Migration file appears to have no SQL statements: $filename"
    fi
    
    return 0
}

# =============================================
# DATABASE FUNCTIONS
# =============================================

get_db_connection() {
    if [[ -n "$DATABASE_URL" ]]; then
        echo "$DATABASE_URL"
    elif [[ -n "$SUPABASE_URL" && -n "$SUPABASE_SERVICE_KEY" ]]; then
        echo "postgresql://postgres:${SUPABASE_SERVICE_KEY}@${SUPABASE_URL#*://}"
    else
        error "No database connection available"
        exit 1
    fi
}

execute_sql() {
    local sql="$1"
    local description="${2:-SQL command}"
    local conn=$(get_db_connection)
    
    info "Executing: $description"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        info "DRY RUN: Would execute SQL: ${sql:0:100}..."
        return 0
    fi
    
    # Execute with timeout and error handling
    timeout "$TIMEOUT" psql "$conn" -v ON_ERROR_STOP=1 -c "$sql" 2>&1 || {
        error "SQL execution failed: $description"
        return 1
    }
    
    success "SQL executed successfully: $description"
}

check_schema_migrations_table() {
    info "Checking schema_migrations table..."
    
    local sql="
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            checksum VARCHAR(64) NOT NULL,
            executed_at TIMESTAMPTZ DEFAULT NOW(),
            execution_time_ms INTEGER,
            success BOOLEAN DEFAULT true,
            error_message TEXT
        );
        
        CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at 
        ON schema_migrations(executed_at);
    "
    
    execute_sql "$sql" "Create schema_migrations table"
}

get_executed_migrations() {
    local conn=$(get_db_connection)
    local sql="SELECT version, checksum FROM schema_migrations ORDER BY version;"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        info "DRY RUN: Would fetch executed migrations"
        return 0
    fi
    
    psql "$conn" -t -c "$sql" 2>/dev/null | while read -r version checksum; do
        echo "${version// /} ${checksum// /}"
    done
}

calculate_checksum() {
    local file="$1"
    sha256sum "$file" | cut -d' ' -f1
}

record_migration_execution() {
    local version="$1"
    local checksum="$2"
    local success="$3"
    local error_msg="$4"
    local execution_time="$5"
    
    local sql="
        INSERT INTO schema_migrations 
        (version, checksum, success, error_message, execution_time_ms)
        VALUES ('$version', '$checksum', $success, 
                ${error_msg:+'$error_msg'}, $execution_time)
        ON CONFLICT (version) DO UPDATE SET
            checksum = EXCLUDED.checksum,
            executed_at = NOW(),
            success = EXCLUDED.success,
            error_message = EXCLUDED.error_message,
            execution_time_ms = EXCLUDED.execution_time_ms;
    "
    
    execute_sql "$sql" "Record migration: $version"
}

# =============================================
# MIGRATION ORDER CALCULATION
# =============================================

get_migration_execution_order() {
    info "Calculating migration execution order..."
    
    # Define migration order based on dependencies
    # This is a curated order based on analysis of migration dependencies
    local migrations=(
        # Core Infrastructure (must run first)
        "2025-12-28_enable_rls.sql"
        "2025-12-28_create_documents_tables_final.sql"
        "2025-12-28_create_clients_tables_final.sql"
        "2025-12-28_create_calendar_tables_final.sql"
        "2025-12-28_add_project_json_columns.sql"
        
        # RBAC and Security
        "2025-12-29_rbac_system.sql"
        "2025-12-29_seed_granular_permissions.sql"
        "2025-12-29_data_rls.sql"
        
        # Team and Notifications
        "2025-12-28_team_sharing.sql"
        "2025-12-29_invitations_trigger.sql"
        "2025-12-29_rpc_exec_sql.sql"
        "2025-12-29_fix_calendar_schema.sql"
        
        # 2026 Migration Phase 1: Core Systems
        "2026-01-16_notifications_system.sql"
        "2026-01-16_whitelabel_tenant.sql"
        
        # 2026 Migration Phase 2: CRM Fixes
        "2026-01-18_fix_crm_schema.sql"
        "2026-01-18_fix_missing_tables.sql"
        "2026-01-18_force_fix_crm.sql"
        
        # 2026 Migration Phase 3: Activity Logging
        "2026-01-19_create_activity_logs.sql"
        
        # 2026 Migration Phase 4: Security & Encryption
        "2026-01-20_credential_encryption.sql"
        "2026-01-20_migrate_plaintext_credentials.sql"
        "2026-01-20_comprehensive_rls_policies.sql"
        
        # 2026 Migration Phase 5: Financial Tracking
        "2026-01-20_create_finances_table.sql"
    )
    
    local execution_order=()
    
    # Check which migrations exist and need to be executed
    for migration in "${migrations[@]}"; do
        local file="$MIGRATIONS_DIR/$migration"
        
        if [[ -f "$file" ]]; then
            execution_order+=("$migration")
        else
            warn "Migration file not found: $migration"
        fi
    done
    
    # Filter out already executed migrations
    if [[ "$DRY_RUN" != "true" ]]; then
        local temp_order=()
        local executed_migrations=$(get_executed_migrations)
        
        for migration in "${execution_order[@]}"; do
            local version="${migration%.sql}"
            local file="$MIGRATIONS_DIR/$migration"
            local checksum=$(calculate_checksum "$file")
            local executed=false
            
            while IFS= read -r line; do
                if [[ -n "$line" ]]; then
                    local executed_version=$(echo "$line" | cut -d' ' -f1)
                    local executed_checksum=$(echo "$line" | cut -d' ' -f2)
                    
                    if [[ "$executed_version" == "$version" && "$executed_checksum" == "$checksum" ]]; then
                        executed=true
                        break
                    fi
                fi
            done <<< "$executed_migrations"
            
            if [[ "$executed" == "false" ]]; then
                temp_order+=("$migration")
            else
                info "Migration already executed: $migration"
            fi
        done
        
        execution_order=("${temp_order[@]}")
    fi
    
    info "Calculated execution order for ${#execution_order[@]} migrations"
    for i in "${!execution_order[@]}"; do
        echo "  $((i+1)). ${execution_order[i]}"
    done
    
    # Output the migrations as a list for consumption by other functions
    printf '%s\n' "${execution_order[@]}"
}

# =============================================
# BACKUP FUNCTIONS
# =============================================

create_database_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        warn "Skipping database backup (SKIP_BACKUP=true)"
        return 0
    fi
    
    info "Creating database backup..."
    local backup_file="$BACKUP_DIR/backup_before_migration_$(date '+%Y%m%d_%H%M%S').sql"
    local conn=$(get_db_connection)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        info "DRY RUN: Would create backup: $backup_file"
        return 0
    fi
    
    # Create backup
    if pg_dump "$conn" > "$backup_file" 2>&1; then
        success "Database backup created: $backup_file"
        
        # Compress backup
        gzip "$backup_file"
        success "Database backup compressed: ${backup_file}.gz"
        
        # Clean old backups (keep last 10)
        find "$BACKUP_DIR" -name "backup_before_migration_*.sql.gz" -type f | \
        sort -r | tail -n +11 | xargs -r rm -v
        
        return 0
    else
        error "Failed to create database backup"
        return 1
    fi
}

# =============================================
# MIGRATION EXECUTION
# =============================================

execute_migration() {
    local migration_file="$1"
    local version="${migration_file%.sql}"
    local file_path="$MIGRATIONS_DIR/$migration_file"
    
    info "Executing migration: $migration_file"
    
    # Validate migration file
    if ! validate_migration_file "$file_path"; then
        error "Migration validation failed: $migration_file"
        return 1
    fi
    
    # Calculate checksum
    local checksum=$(calculate_checksum "$file_path")
    
    # Record start time
    local start_time=$(date +%s%3N)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        info "DRY RUN: Would execute migration: $migration_file"
        record_migration_execution "$version" "$checksum" "true" "" "0"
        return 0
    fi
    
    # Execute migration
    local migration_sql
    migration_sql=$(cat "$file_path")
    
    if execute_sql "$migration_sql" "Migration: $migration_file"; then
        # Calculate execution time
        local end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))
        
        # Record successful execution
        record_migration_execution "$version" "$checksum" "true" "" "$execution_time"
        
        success "Migration executed successfully: $migration_file (${execution_time}ms)"
        return 0
    else
        # Calculate execution time
        local end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))
        
        # Record failed execution
        local error_msg="Migration execution failed"
        record_migration_execution "$version" "$checksum" "false" "$error_msg" "$execution_time"
        
        error "Migration failed: $migration_file"
        return 1
    fi
}

execute_migrations() {
    info "Starting migration execution..."
    
    # Get execution order
    local migrations=()
    while IFS= read -r line; do
        if [[ -n "$line" ]]; then
            migrations+=("$line")
        fi
    done <<< "$(get_migration_execution_order)"
    
    if [[ ${#migrations[@]} -eq 0 ]]; then
        info "No migrations to execute"
        return 0
    fi
    
    warn "Executing ${#migrations[@]} migrations in order:"
    for i in "${!migrations[@]}"; do
        echo "  $((i+1)). ${migrations[i]}"
    done
    
    # Ask for confirmation in non-interactive mode
    if [[ "$FORCE_RUN" != "true" && "$ENVIRONMENT" != "dev" ]]; then
        echo
        read -p "Continue? (y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Migration execution cancelled"
            exit 0
        fi
    fi
    
    # Create backup
    if ! create_database_backup; then
        if [[ "$FORCE_RUN" != "true" ]]; then
            error "Backup creation failed. Use FORCE_RUN=true to continue anyway."
            exit 1
        else
            warn "Backup failed but continuing (FORCE_RUN=true)"
        fi
    fi
    
    # Execute migrations
    local failed_migrations=()
    
    for migration in "${migrations[@]}"; do
        echo
        info "Processing migration: $migration"
        
        if execute_migration "$migration"; then
            success "Migration completed: $migration"
        else
            error "Migration failed: $migration"
            failed_migrations+=("$migration")
            
            if [[ "$FORCE_RUN" != "true" ]]; then
                error "Migration failed. Use FORCE_RUN=true to continue on errors."
                break
            else
                warn "Continuing despite failure (FORCE_RUN=true)"
            fi
        fi
    done
    
    # Report results
    echo
    if [[ ${#failed_migrations[@]} -eq 0 ]]; then
        success "All migrations executed successfully!"
        return 0
    else
        error "Some migrations failed:"
        for migration in "${failed_migrations[@]}"; do
            echo "  - $migration"
        done
        return 1
    fi
}

# =============================================
# VALIDATION & HEALTH CHECKS
# =============================================

validate_migration_success() {
    info "Validating migration success..."
    
    local validation_sql="
        -- Check that all critical tables exist
        SELECT 
            'tables_exist' as check_name,
            COUNT(*) as expected_count,
            COUNT(*) as actual_count,
            CASE WHEN COUNT(*) = 25 THEN 'PASS' ELSE 'FAIL' END as status
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'projects', 'tasks', 'milestones', 'activities',
            'leads', 'clients', 'client_messages', 'client_tasks', 'client_history',
            'documents', 'calendar_events', 'calendar_tasks', 'event_attendees', 'calendar_reminders',
            'finances', 'project_credentials',
            'profiles', 'user_roles', 'roles', 'permissions', 'role_permissions',
            'notifications', 'messages', 'quick_hits',
            'tenants', 'tenant_config', 'web_analytics', 'schema_migrations'
        );
        
        -- Check RLS is enabled
        SELECT 
            'rls_enabled' as check_name,
            COUNT(*) as expected_count,
            SUM(CASE WHEN rowsecurity = true THEN 1 ELSE 0 END) as actual_count,
            CASE WHEN COUNT(*) = SUM(CASE WHEN rowsecurity = true THEN 1 ELSE 0 END) 
                 THEN 'PASS' ELSE 'FAIL' END as status
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN (
            'projects', 'tasks', 'leads', 'clients', 'documents', 
            'finances', 'profiles', 'notifications'
        );
        
        -- Check schema_migrations is populated
        SELECT 
            'migrations_tracked' as check_name,
            1 as expected_count,
            CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END as actual_count,
            CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as status
        FROM schema_migrations;
    "
    
    local conn=$(get_db_connection)
    local validation_output
    
    if [[ "$DRY_RUN" == "true" ]]; then
        info "DRY RUN: Would run validation checks"
        return 0
    fi
    
    validation_output=$(psql "$conn" -t -c "$validation_sql" 2>&1)
    
    local failed_checks=0
    while IFS= read -r line; do
        if [[ -n "$line" ]]; then
            local check_name=$(echo "$line" | cut -d'|' -f1 | xargs)
            local expected=$(echo "$line" | cut -d'|' -f2 | xargs)
            local actual=$(echo "$line" | cut -d'|' -f3 | xargs)
            local status=$(echo "$line" | cut -d'|' -f4 | xargs)
            
            if [[ "$status" == "PASS" ]]; then
                success "Validation check passed: $check_name"
            else
                error "Validation check failed: $check_name (expected: $expected, actual: $actual)"
                ((failed_checks++))
            fi
        fi
    done <<< "$validation_output"
    
    if [[ $failed_checks -eq 0 ]]; then
        success "All validation checks passed!"
        return 0
    else
        error "$failed_checks validation checks failed"
        return 1
    fi
}

# =============================================
# ROLLBACK FUNCTIONS
# =============================================

rollback_last_migration() {
    error "Rollback functionality not yet implemented"
    error "Please restore from backup manually:"
    echo "  gunzip -c $BACKUP_DIR/backup_before_migration_*.sql.gz | psql \$DATABASE_URL"
    return 1
}

# =============================================
# HELP & USAGE
# =============================================

show_help() {
    cat << EOF
Eneas-OS Migration Deployment System

USAGE:
    $0 [OPTIONS]

ENVIRONMENTS:
    dev         Development environment (default)
    staging     Staging environment with safety checks
    prod        Production environment (requires FORCE_RUN=true)

OPTIONS:
    -h, --help              Show this help message
    -e, --env ENVIRONMENT   Set environment (dev|staging|prod)
    -d, --dry-run           Show what would be executed without running
    -f, --force             Continue even if errors occur
    -b, --skip-backup       Skip database backup
    -j, --jobs NUM          Number of parallel jobs (default: 4)
    -t, --timeout SECONDS   Command timeout (default: 300)
    -r, --rollback          Rollback last migration (not implemented)
    -v, --validate          Run validation checks only

ENVIRONMENT VARIABLES:
    DATABASE_URL            Full PostgreSQL connection URL
    SUPABASE_URL            Supabase project URL
    SUPABASE_SERVICE_KEY    Supabase service role key
    ENVIRONMENT             Target environment (dev|staging|prod)
    DRY_RUN                 Enable dry run mode (true/false)
    FORCE_RUN               Force execution despite errors (true/false)
    SKIP_BACKUP             Skip backup creation (true/false)

EXAMPLES:
    # Development deployment with dry run
    $0 --env dev --dry-run

    # Staging deployment with backup
    $0 --env staging

    # Production deployment (requires force flag)
    $0 --env prod --force

    # Skip backup and run with timeout
    $0 --env staging --skip-backup --timeout 600

    # Run validation checks only
    $0 --validate

EOF
}

# =============================================
# MAIN EXECUTION
# =============================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -e|--env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            -f|--force)
                FORCE_RUN="true"
                shift
                ;;
            -b|--skip-backup)
                SKIP_BACKUP="true"
                shift
                ;;
            -j|--jobs)
                PARALLEL_JOBS="$2"
                shift 2
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -r|--rollback)
                rollback_last_migration
                exit $?
                ;;
            -v|--validate)
                validate_environment
                validate_migration_success
                exit $?
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Print banner
    echo
    echo "============================================"
    echo "ENEAS-OS MIGRATION DEPLOYMENT SYSTEM"
    echo "============================================"
    echo "Environment: $ENVIRONMENT"
    echo "Dry Run: $DRY_RUN"
    echo "Force Run: $FORCE_RUN"
    echo "Skip Backup: $SKIP_BACKUP"
    echo "============================================"
    echo
    
    # Execute deployment pipeline
    if validate_environment; then
        check_schema_migrations_table
        
        if execute_migrations; then
            validate_migration_success
            success "Migration deployment completed successfully!"
        else
            error "Migration deployment failed!"
            exit 1
        fi
    else
        error "Environment validation failed!"
        exit 1
    fi
}

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
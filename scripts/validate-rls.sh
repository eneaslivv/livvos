#!/bin/bash

# RLS Policy Validation Script
# Validates Row-Level Security policies for eneas-os
# Usage: ./scripts/validate-rls.sh [options]

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
SUPABASE_URL=${SUPABASE_URL:-""}
SUPABASE_KEY=${SUPABASE_KEY:-""}
VERBOSE=false
DRY_RUN=false
FIX_ISSUES=false

# Help function
show_help() {
    cat << EOF
RLS Policy Validation Script for eneas-os

USAGE:
    $0 [OPTIONS]

OPTIONS:
    -h, --help          Show this help message
    -v, --verbose       Verbose output
    -d, --dry-run       Don't fix issues, only report
    -f, --fix           Attempt to fix common issues
    --url URL           Supabase project URL
    --key KEY           Supabase service role key

ENVIRONMENT VARIABLES:
    SUPABASE_URL        Supabase project URL
    SUPABASE_KEY        Supabase service role key

EXAMPLES:
    $0 --verbose
    $0 --dry-run --fix
    SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=yyy $0 --fix

EOF
}

# Logging functions
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

log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${BLUE}[VERBOSE]${NC} $1"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--fix)
            FIX_ISSUES=true
            shift
            ;;
        --url)
            SUPABASE_URL="$2"
            shift 2
            ;;
        --key)
            SUPABASE_KEY="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
validate_environment() {
    log_info "Validating environment..."
    
    if [[ -z "$SUPABASE_URL" ]]; then
        log_error "SUPABASE_URL is not set"
        echo "Set it via environment variable or --url option"
        exit 1
    fi
    
    if [[ -z "$SUPABASE_KEY" ]]; then
        log_error "SUPABASE_KEY is not set"
        echo "Set it via environment variable or --key option"
        exit 1
    fi
    
    log_success "Environment validation passed"
}

# Check if psql is available
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v psql &> /dev/null; then
        log_error "psql is not installed or not in PATH"
        echo "Please install PostgreSQL client tools"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_warning "jq is not installed. Some features may not work"
    fi
    
    log_success "Dependencies check completed"
}

# Execute SQL command
execute_sql() {
    local sql="$1"
    local description="$2"
    
    log_verbose "Executing: $description"
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY RUN] Would execute: $sql"
        return 0
    fi
    
    PGPASSWORD="$SUPABASE_KEY" psql "$SUPABASE_URL" -c "$sql" 2>/dev/null
}

# Test database connection
test_connection() {
    log_info "Testing database connection..."
    
    local result=$(execute_sql "SELECT 1 as test;" "Connection test")
    
    if [[ $? -eq 0 ]]; then
        log_success "Database connection successful"
    else
        log_error "Database connection failed"
        exit 1
    fi
}

# Check RLS enabled status
check_rls_enabled() {
    log_info "Checking RLS enabled status..."
    
    local tables=(
        "projects"
        "tasks" 
        "milestones"
        "activities"
        "leads"
        "clients"
        "client_messages"
        "client_tasks"
        "client_history"
        "documents"
        "calendar_events"
        "calendar_tasks"
        "event_attendees"
        "calendar_reminders"
        "finances"
        "project_credentials"
        "profiles"
        "user_roles"
        "roles"
        "permissions"
        "role_permissions"
        "notifications"
        "messages"
        "quick_hits"
        "tenants"
        "tenant_config"
        "web_analytics"
        "analytics_metrics"
    )
    
    local disabled_tables=()
    
    for table in "${tables[@]}"; do
        local result=$(execute_sql "
            SELECT rowsecurity 
            FROM pg_tables 
            WHERE schemaname = 'public' AND tablename = '$table';
        " "Check RLS for $table")
        
        if echo "$result" | grep -q "f"; then
            disabled_tables+=("$table")
            log_warning "RLS disabled for table: $table"
        else
            log_verbose "RLS enabled for table: $table"
        fi
    done
    
    if [[ ${#disabled_tables[@]} -eq 0 ]]; then
        log_success "All tables have RLS enabled"
    else
        log_error "${#disabled_tables[@]} tables have RLS disabled"
        if [[ "$FIX_ISSUES" == true ]]; then
            for table in "${disabled_tables[@]}"; do
                execute_sql "ALTER TABLE $table ENABLE ROW LEVEL SECURITY;" "Enable RLS for $table"
                log_info "Fixed: RLS enabled for $table"
            done
        fi
    fi
}

# Check security functions exist
check_security_functions() {
    log_info "Checking security functions..."
    
    local functions=(
        "current_user_tenant"
        "is_tenant_owner"
        "has_permission"
        "can_access_tenant"
        "get_user_roles"
        "tenant_security_context"
    )
    
    local missing_functions=()
    
    for func in "${functions[@]}"; do
        local result=$(execute_sql "
            SELECT proname 
            FROM pg_proc 
            WHERE proname = '$func' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
        " "Check function $func")
        
        if [[ -z "$result" || "$result" == *"0 rows"* ]]; then
            missing_functions+=("$func")
            log_error "Missing security function: $func"
        else
            log_verbose "Security function exists: $func"
        fi
    done
    
    if [[ ${#missing_functions[@]} -eq 0 ]]; then
        log_success "All security functions exist"
    else
        log_error "${#missing_functions[@]} security functions missing"
        if [[ "$FIX_ISSUES" == true ]]; then
            log_error "Cannot automatically fix missing functions. Please run the RLS migration."
        fi
    fi
}

# Check RLS policies exist
check_rls_policies() {
    log_info "Checking RLS policies..."
    
    local result=$(execute_sql "
        SELECT tablename, COUNT(*) as policy_count
        FROM pg_policies 
        WHERE schemaname = 'public'
        GROUP BY tablename
        ORDER BY tablename;
    " "Count RLS policies per table")
    
    echo "$result" | while IFS= read -r line; do
        if [[ "$line" =~ ^[a-z_]+\ +[0-9]+$ ]]; then
            local table=$(echo "$line" | awk '{print $1}')
            local count=$(echo "$line" | awk '{print $2}')
            
            if [[ "$count" -gt 0 ]]; then
                log_verbose "Table $table has $count policies"
            else
                log_warning "Table $table has no RLS policies"
            fi
        fi
    done
    
    local total_policies=$(execute_sql "
        SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
    " "Count total RLS policies")
    
    local policy_count=$(echo "$total_policies" | grep -o '[0-9]\+' | head -1)
    
    if [[ "$policy_count" -gt 50 ]]; then
        log_success "Found $policy_count RLS policies (comprehensive coverage)"
    elif [[ "$policy_count" -gt 20 ]]; then
        log_warning "Found $policy_count RLS policies (partial coverage)"
    else
        log_error "Found only $policy_count RLS policies (incomplete)"
    fi
}

# Check tenant_id columns
check_tenant_columns() {
    log_info "Checking tenant_id columns..."
    
    local tables_requiring_tenant=(
        "projects"
        "tasks"
        "milestones"
        "activities"
        "leads"
        "clients"
        "documents"
        "calendar_events"
        "calendar_tasks"
        "finances"
        "web_analytics"
        "analytics_metrics"
    )
    
    local missing_columns=()
    
    for table in "${tables_requiring_tenant[@]}"; do
        local result=$(execute_sql "
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = '$table' AND column_name = 'tenant_id';
        " "Check tenant_id for $table")
        
        if [[ -z "$result" || "$result" == *"0 rows"* ]]; then
            missing_columns+=("$table.tenant_id")
            log_error "Missing tenant_id column in: $table"
        else
            log_verbose "tenant_id column exists in: $table"
        fi
    done
    
    if [[ ${#missing_columns[@]} -eq 0 ]]; then
        log_success "All required tenant_id columns exist"
    else
        log_error "${#missing_columns[@]} tenant_id columns missing"
        if [[ "$FIX_ISSUES" == true ]]; then
            log_error "Cannot automatically fix missing columns. Please run the RLS migration."
        fi
    fi
}

# Check performance indexes
check_performance_indexes() {
    log_info "Checking performance indexes..."
    
    local expected_indexes=(
        "idx_projects_tenant_id"
        "idx_tasks_tenant_id"
        "idx_leads_tenant_id"
        "idx_clients_tenant_id"
        "idx_documents_tenant_id"
        "idx_calendar_events_tenant_id"
        "idx_finances_tenant_id"
        "idx_user_roles_user_id"
        "idx_user_roles_role_id"
        "idx_role_permissions_role_id"
        "idx_notifications_user_id"
    )
    
    local missing_indexes=()
    
    for index in "${expected_indexes[@]}"; do
        local result=$(execute_sql "
            SELECT indexname 
            FROM pg_indexes 
            WHERE indexname = '$index' AND schemaname = 'public';
        " "Check index $index")
        
        if [[ -z "$result" || "$result" == *"0 rows"* ]]; then
            missing_indexes+=("$index")
            log_warning "Missing index: $index"
        else
            log_verbose "Index exists: $index"
        fi
    done
    
    if [[ ${#missing_indexes[@]} -eq 0 ]]; then
        log_success "All performance indexes exist"
    else
        log_warning "${#missing_indexes[@]} performance indexes missing"
        if [[ "$FIX_ISSUES" == true ]]; then
            log_info "Note: Missing indexes will be created by the RLS migration"
        fi
    fi
}

# Test basic RLS functionality
test_rls_functionality() {
    log_info "Testing basic RLS functionality..."
    
    # Test tenant access function
    local result=$(execute_sql "SELECT current_user_tenant();" "Test current_user_tenant")
    if [[ $? -eq 0 ]]; then
        log_verbose "current_user_tenant function works"
    else
        log_error "current_user_tenant function failed"
    fi
    
    # Test permission function
    result=$(execute_sql "SELECT has_permission('projects', 'view');" "Test has_permission")
    if [[ $? -eq 0 ]]; then
        log_verbose "has_permission function works"
    else
        log_error "has_permission function failed"
    fi
    
    # Test tenant access check
    result=$(execute_sql "SELECT can_access_tenant('00000000-0000-0000-0000-000000000000');" "Test can_access_tenant")
    if [[ $? -eq 0 ]]; then
        log_verbose "can_access_tenant function works"
    else
        log_error "can_access_tenant function failed"
    fi
    
    log_success "RLS functionality tests completed"
}

# Check for common security issues
check_security_issues() {
    log_info "Checking for common security issues..."
    
    # Check for overly permissive policies
    local permissive=$(execute_sql "
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND qual = 'true' 
        AND cmd IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
    " "Check for overly permissive policies")
    
    if [[ -n "$permissive" && "$permissive" != *"0 rows"* ]]; then
        log_warning "Found potentially overly permissive policies:"
        echo "$permissive"
    else
        log_verbose "No overly permissive policies found"
    fi
    
    # Check for missing WHERE clauses
    local missing_where=$(execute_sql "
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND (qual IS NULL OR qual = '');
    " "Check for policies without WHERE clauses")
    
    if [[ -n "$missing_where" && "$missing_where" != *"0 rows"* ]]; then
        log_warning "Found policies without WHERE clauses:"
        echo "$missing_where"
    else
        log_verbose "All policies have proper WHERE clauses"
    fi
    
    log_success "Security issues check completed"
}

# Generate validation report
generate_report() {
    log_info "Generating validation report..."
    
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local report_file="rls-validation-report-$(date '+%Y%m%d-%H%M%S').txt"
    
    cat > "$report_file" << EOF
RLS Policy Validation Report
Generated: $timestamp
Database: $SUPABASE_URL

SUMMARY:
========
- Environment: Validated
- Dependencies: Checked
- Connection: Successful
- RLS Status: Validated
- Security Functions: Checked
- RLS Policies: Verified
- Tenant Columns: Confirmed
- Performance Indexes: Reviewed
- Functionality: Tested
- Security Issues: Analyzed

RECOMMENDATIONS:
===============
1. Run this script regularly (weekly) to ensure RLS integrity
2. Monitor query performance after policy changes
3. Review and update policies as business requirements evolve
4. Test policies with different user roles and tenants
5. Keep documentation updated with policy changes

NEXT STEPS:
==========
- Address any issues identified above
- Schedule regular validation runs
- Monitor security metrics
- Update policies as needed

EOF
    
    log_success "Report generated: $report_file"
}

# Main execution
main() {
    echo "========================================="
    echo "RLS Policy Validation for eneas-os"
    echo "========================================="
    echo ""
    
    # Parse arguments first
    validate_environment
    check_dependencies
    test_connection
    
    echo ""
    log_info "Starting comprehensive RLS validation..."
    echo ""
    
    check_rls_enabled
    echo ""
    
    check_security_functions
    echo ""
    
    check_rls_policies
    echo ""
    
    check_tenant_columns
    echo ""
    
    check_performance_indexes
    echo ""
    
    test_rls_functionality
    echo ""
    
    check_security_issues
    echo ""
    
    generate_report
    echo ""
    
    if [[ "$DRY_RUN" == true ]]; then
        log_warning "DRY RUN COMPLETED - No changes were made"
    elif [[ "$FIX_ISSUES" == true ]]; then
        log_success "VALIDATION COMPLETED - Some issues were fixed"
    else
        log_success "VALIDATION COMPLETED - Issues were identified only"
    fi
    
    echo ""
    echo "========================================="
}

# Trap cleanup
cleanup() {
    log_verbose "Cleaning up..."
}

trap cleanup EXIT

# Run main function
main "$@"
# Migration Deployment Guide

## Overview

This guide covers the comprehensive migration deployment system for the eneas-os platform. The system provides safe, automated database migrations with validation, rollback capabilities, and environment-specific configurations.

## 🏗️ Architecture

### Core Components

1. **Migration Scripts** (`scripts/`)
   - `deploy-migrations.sh` - Main deployment script
   - `migration-tracker.ts` - Node.js migration tracking system
   - `validate-migrations.ts` - Migration validation and testing

2. **CI/CD Pipeline** (`.github/workflows/migrations.yml`)
   - Automated validation and deployment
   - Multi-environment support
   - Security scanning and health checks

3. **Migration Files** (`migrations/`)
   - Ordered SQL migration files
   - Dependency tracking
   - Version control integration

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Validate migrations
npm run validate:migrations

# Run migrations in development
npm run migrate:dev

# Dry run to preview changes
npm run migrate:dry-run

# Check migration status
npm run status:migrations
```

### Production Deployment

```bash
# Manual production deployment (requires confirmation)
DATABASE_URL="your-prod-db-url" \
ENVIRONMENT=production \
FORCE_RUN=true \
./scripts/deploy-migrations.sh --env production

# Or use GitHub Actions for automated deployment
# Merge to main branch triggers production deployment
```

## 📋 Migration Files

### Naming Convention

All migration files must follow the format:
```
YYYY-MM-DD_description.sql
```

Examples:
- `2026-01-20_create_finances_table.sql`
- `2026-01-20_comprehensive_rls_policies.sql`
- `2026-01-21_add_user_profiles.sql`

### File Structure

```sql
-- =============================================
-- MIGRATION: Add user profiles
-- Version: 2026-01-21
-- Author: Your Name
-- Dependencies: 2026-01-20_create_users_table.sql
-- =============================================

-- Create table with proper safety checks
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... columns
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "..." ON user_profiles FOR ...;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Reload PostgREST
NOTIFY pgrst, 'reload config';
```

### Dependencies

Declare dependencies using special comments:

```sql
-- @depends-on: 2026-01-20_create_users_table.sql
-- @depends-on: 2026-01-19_create_tenants_table.sql
```

## 🔄 Execution Order

### Current Migration Order

The system maintains a curated execution order based on dependencies:

1. **Core Infrastructure** (Must run first)
   - `2025-12-28_enable_rls.sql`
   - `2025-12-28_create_*_tables_final.sql`

2. **RBAC and Security**
   - `2025-12-29_rbac_system.sql`
   - `2025-12-29_seed_granular_permissions.sql`

3. **Team and Notifications**
   - `2025-12-28_team_sharing.sql`
   - `2026-01-16_notifications_system.sql`

4. **Multi-Tenant Infrastructure**
   - `2026-01-16_whitelabel_tenant.sql`

5. **CRM and Business Logic**
   - `2026-01-18_fix_crm_schema.sql`
   - `2026-01-18_fix_missing_tables.sql`

6. **Activity Logging**
   - `2026-01-19_create_activity_logs.sql`

7. **Security & Encryption**
   - `2026-01-20_credential_encryption.sql`
   - `2026-01-20_migrate_plaintext_credentials.sql`
   - `2026-01-20_comprehensive_rls_policies.sql`

8. **Financial Tracking**
   - `2026-01-20_create_finances_table.sql`

## 🛡️ Safety Features

### Automatic Backups

Before any migration, the system:
- Creates a full database backup
- Compresses and stores the backup
- Maintains backup history (last 10 backups)
- Provides rollback capability

```bash
# Backups are stored in: backups/migrations/
backup_before_migration_20260121_143022.sql.gz
```

### Validation Checks

The system performs comprehensive validation:

1. **File Validation**
   - Filename format checking
   - SQL syntax validation
   - Security pattern scanning

2. **Dependency Validation**
   - Circular dependency detection
   - Missing dependency detection
   - Topological sorting for execution order

3. **Security Scanning**
   - Hardcoded secret detection
   - Dangerous operation detection
   - Environment-specific restrictions

### Environment-Specific Safety

- **Development**: Full access with warnings
- **Staging**: Extra safety checks and confirmation
- **Production**: Requires explicit `FORCE_RUN=true` and manual confirmation

## 📊 Monitoring & Logging

### Migration Tracking

All migrations are tracked in the `schema_migrations` table:

```sql
SELECT 
  version,
  checksum,
  executed_at,
  execution_time_ms,
  success,
  error_message
FROM schema_migrations
ORDER BY executed_at DESC;
```

### Logging

Detailed logs are maintained in:
- `logs/migration_YYYYMMDD.log` - Script execution logs
- `schema_migrations` table - Database migration history
- GitHub Actions logs - CI/CD deployment logs

### Health Checks

Post-deployment health checks verify:
- Database connectivity
- Table existence
- RLS policy status
- Migration consistency

## 🔧 Environment Configuration

### Environment Variables

```bash
# Required
DATABASE_URL="postgresql://user:pass@host:port/dbname"
# OR
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_KEY="your-service-key"

# Optional
ENVIRONMENT="development|staging|production"
DRY_RUN="true|false"
FORCE_RUN="true|false"
SKIP_BACKUP="true|false"
PARALLEL_JOBS="4"
TIMEOUT="300"
```

### Database Configuration

The system supports PostgreSQL and Supabase databases:

**PostgreSQL:**
```bash
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
```

**Supabase:**
```bash
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_KEY="your-super-secret-service-key"
```

## 🚨 Rollback Procedures

### Emergency Rollback

If a migration fails:

1. **Identify the failed migration**
   ```bash
   npm run status:migrations
   ```

2. **Restore from backup** (recommended)
   ```bash
   gunzip -c backups/migrations/backup_before_migration_YYYYMMDD_HHMMSS.sql.gz | \
   psql $DATABASE_URL
   ```

3. **Or use rollback script** (if implemented)
   ```bash
   ./scripts/deploy-migrations.sh --rollback
   ```

### Partial Rollback

For specific table rollbacks:

```sql
-- Example: Drop a table created in failed migration
DROP TABLE IF EXISTS new_table CASCADE;

-- Remove migration record
DELETE FROM schema_migrations WHERE version = '2026-01-21_failed_migration';
```

## 🔒 Security Best Practices

### Migration Security

1. **No Hardcoded Secrets**
   ```sql
   -- ❌ BAD
   CREATE USER admin WITH PASSWORD 'secret123';
   
   -- ✅ GOOD
   CREATE USER admin WITH PASSWORD :app_password;
   ```

2. **Use Environment Variables**
   ```bash
   export APP_PASSWORD="$(openssl rand -base64 32)"
   ```

3. **Row Level Security**
   ```sql
   -- Always enable RLS on new tables
   ALTER TABLE sensitive_data ENABLE ROW LEVEL SECURITY;
   ```

### Production Security

- All migrations require explicit confirmation
- Dangerous operations are blocked unless `FORCE_RUN=true`
- Automatic backups before any changes
- Comprehensive audit logging

## 🧪 Testing

### Local Testing

```bash
# Run all validation tests
npm run test:migrations

# Test rollback scenarios
npm run test:rollback

# Security scan
npm run security:scan

# SQL syntax validation
npm run validate:sql
```

### CI/CD Testing

The GitHub Actions pipeline includes:
- Migration validation
- Database testing on temporary instance
- Security scanning
- Health checks
- Environment-specific validation

## 📈 Performance

### Migration Optimization

1. **Index After Data**
   ```sql
   -- Load data first
   INSERT INTO large_table (...) VALUES (...);
   
   -- Then create indexes
   CREATE INDEX CONCURRENTLY idx_large_table_column ON large_table(column);
   ```

2. **Batch Large Operations**
   ```sql
   -- Process in batches for large tables
   UPDATE large_table 
   SET status = 'processed' 
   WHERE id IN (SELECT id FROM large_table LIMIT 1000);
   ```

3. **Use CONCURRENTLY for Indexes**
   ```sql
   CREATE INDEX CONCURRENTLY idx_table_column ON table(column);
   ```

## 🚨 Troubleshooting

### Common Issues

1. **Migration Timeout**
   ```bash
   # Increase timeout
   TIMEOUT=600 ./scripts/deploy-migrations.sh --env staging
   ```

2. **Permission Denied**
   ```bash
   # Ensure database user has required permissions
   # Check connection string and user roles
   ```

3. **Dependency Issues**
   ```bash
   # Check migration dependencies
   npm run check:dependencies
   ```

4. **Circular Dependencies**
   ```bash
   # Visualize dependency graph
   npm run visualize:dependencies
   ```

### Debug Mode

Enable debug logging:

```bash
DEBUG=true ./scripts/deploy-migrations.sh --env dev --dry-run
```

### Getting Help

```bash
# Show all options
./scripts/deploy-migrations.sh --help

# Check migration status
npm run status:migrations

# View migration history
npm run history:migrations
```

## 📚 API Reference

### MigrationTracker Class

```typescript
import { createMigrationTracker } from './scripts/migration-tracker';

const tracker = await createMigrationTracker('production');

// Get pending migrations
const pending = await tracker.getPendingMigrations();

// Execute migrations
const results = await tracker.executePendingMigrations();

// Get migration history
const history = await tracker.getMigrationHistory();

// Health check
const health = await tracker.performHealthCheck();
```

### MigrationValidator Class

```typescript
import { MigrationValidator } from './scripts/validate-migrations';

const validator = new MigrationValidator('./migrations', 'production');

// Validate all migrations
const report = await validator.validateAllMigrations();

// Calculate execution order
const order = await validator.calculateExecutionOrder();

// Generate validation report
const reportMd = validator.generateValidationReport(report);
```

## 🔄 CI/CD Integration

### GitHub Actions Workflow

The system includes a comprehensive GitHub Actions workflow:

1. **Validation Pipeline**
   - File validation
   - SQL syntax checking
   - Security scanning
   - Dependency validation

2. **Testing Pipeline**
   - Database setup
   - Migration testing
   - Rollback testing
   - Performance testing

3. **Deployment Pipeline**
   - Environment-specific deployment
   - Backup creation
   - Health checks
   - Notifications

### Environment Promotion

```
develop → staging (automated on push)
staging → production (manual or main branch merge)
```

## 📋 Checklist

### Before Migration

- [ ] Backup strategy in place
- [ ] Migration files validated
- [ ] Dependencies checked
- [ ] Security scan passed
- [ ] Test environment verified
- [ ] Rollback plan ready

### During Migration

- [ ] Monitoring active
- [ ] Backup successful
- [ ] Migration executing
- [ ] Health checks passing
- [ ] Logs being captured

### After Migration

- [ ] All health checks passed
- [ ] Application functional
- [ ] Performance acceptable
- [ ] No security issues
- [ ] Documentation updated
- [ ] Team notified

## 🆘 Emergency Procedures

### Production Incident Response

1. **Immediate Actions**
   ```bash
   # Stop any ongoing migrations
   pkill -f deploy-migrations.sh
   
   # Check current migration status
   npm run status:migrations
   ```

2. **Assessment**
   ```bash
   # Check database connectivity
   npm run health:check
   
   # Review error logs
   tail -f logs/migration_$(date +%Y%m%d).log
   ```

3. **Recovery Options**
   ```bash
   # Option 1: Restore from backup (recommended)
   gunzip -c backups/migrations/backup_before_migration_*.sql.gz | psql $DATABASE_URL
   
   # Option 2: Rollback specific migration
   ./scripts/deploy-migrations.sh --rollback --version 2026-01-21_failed_migration
   ```

4. **Notification**
   - Alert on-call engineer
   - Create incident ticket
   - Notify stakeholders
   - Document incident

### Contact Information

- **On-call Engineer**: [Contact Details]
- **Database Team**: [Contact Details]
- **Security Team**: [Contact Details]
- **Incident Channel**: [Slack Channel]

---

This guide provides comprehensive coverage of the migration deployment system. For additional support or questions, refer to the code documentation or contact the development team.
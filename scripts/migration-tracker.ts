import { createClient } from '@supabase/supabase-js';
import { Database } from './types';
import crypto from 'crypto';

// =============================================
// MIGRATION TRACKER TYPES
// =============================================

export interface MigrationRecord {
  version: string;
  checksum: string;
  executed_at: string;
  execution_time_ms: number;
  success: boolean;
  error_message?: string;
  environment?: string;
}

export interface MigrationFile {
  version: string;
  filename: string;
  filepath: string;
  checksum: string;
  content: string;
  dependencies: string[];
}

export interface MigrationResult {
  version: string;
  success: boolean;
  execution_time: number;
  error?: string;
}

export interface MigrationSummary {
  total: number;
  executed: number;
  pending: number;
  failed: number;
  skipped: number;
  execution_time_total: number;
}

// =============================================
// MIGRATION TRACKER CLASS
// =============================================

export class MigrationTracker {
  private supabase;
  private migrationsDir: string;
  private environment: string;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    migrationsDir: string = './migrations',
    environment: string = 'development'
  ) {
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
    this.migrationsDir = migrationsDir;
    this.environment = environment;
  }

  // =============================================
  // INITIALIZATION
  // =============================================

  async initialize(): Promise<void> {
    console.log('🔧 Initializing migration tracker...');
    
    // Create schema_migrations table if it doesn't exist
    const { error } = await this.supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          executed_at TIMESTAMPTZ DEFAULT NOW(),
          execution_time_ms INTEGER,
          success BOOLEAN DEFAULT true,
          error_message TEXT,
          environment TEXT DEFAULT 'development'
        );
        
        CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at 
        ON schema_migrations(executed_at);
        
        CREATE INDEX IF NOT EXISTS idx_schema_migrations_environment 
        ON schema_migrations(environment);
        
        CREATE INDEX IF NOT EXISTS idx_schema_migrations_success 
        ON schema_migrations(success);
      `
    });

    if (error) {
      throw new Error(`Failed to initialize migration tracker: ${error.message}`);
    }

    console.log('✅ Migration tracker initialized successfully');
  }

  // =============================================
  // MIGRATION DISCOVERY
  // =============================================

  async discoverMigrations(): Promise<MigrationFile[]> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const files = await fs.readdir(this.migrationsDir);
      const migrationFiles: MigrationFile[] = [];

      for (const file of files) {
        if (file.endsWith('.sql') && file.match(/^\d{4}-\d{2}-\d{2}_.*\.sql$/)) {
          const filepath = path.join(this.migrationsDir, file);
          const content = await fs.readFile(filepath, 'utf-8');
          const version = file.replace('.sql', '');
          const checksum = crypto.createHash('sha256').update(content).digest('hex');
          const dependencies = this.extractDependencies(content);

          migrationFiles.push({
            version,
            filename: file,
            filepath,
            checksum,
            content,
            dependencies
          });
        }
      }

      // Sort by version (date prefix)
      return migrationFiles.sort((a, b) => a.version.localeCompare(b.version));
    } catch (error) {
      throw new Error(`Failed to discover migrations: ${error}`);
    }
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    
    // Look for dependency comments
    const dependencyRegex = /--\s*@depends-on:\s*(.+)/g;
    let match;
    
    while ((match = dependencyRegex.exec(content)) !== null) {
      const dep = match[1].trim();
      if (dep) {
        dependencies.push(dep);
      }
    }
    
    return dependencies;
  }

  // =============================================
  // MIGRATION EXECUTION TRACKING
  // =============================================

  async getExecutedMigrations(): Promise<MigrationRecord[]> {
    const { data, error } = await this.supabase
      .from('schema_migrations')
      .select('*')
      .order('executed_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch executed migrations: ${error.message}`);
    }

    return data || [];
  }

  async getPendingMigrations(): Promise<MigrationFile[]> {
    const executedMigrations = await this.getExecutedMigrations();
    const executedVersions = new Set(executedMigrations.map(m => m.version));
    const allMigrations = await this.discoverMigrations();

    return allMigrations.filter(migration => {
      const isExecuted = executedVersions.has(migration.version);
      const executedRecord = executedMigrations.find(m => m.version === migration.version);
      const checksumMatches = !executedRecord || executedRecord.checksum === migration.checksum;
      
      return !isExecuted || !checksumMatches;
    });
  }

  async recordMigrationStart(version: string): Promise<void> {
    console.log(`📝 Recording migration start: ${version}`);
    
    const { error } = await this.supabase
      .from('schema_migrations')
      .insert({
        version,
        checksum: '',
        executed_at: new Date().toISOString(),
        execution_time_ms: 0,
        success: false,
        error_message: 'Migration in progress...',
        environment: this.environment
      });

    if (error) {
      throw new Error(`Failed to record migration start: ${error.message}`);
    }
  }

  async recordMigrationSuccess(
    version: string,
    checksum: string,
    executionTime: number
  ): Promise<void> {
    console.log(`✅ Recording migration success: ${version} (${executionTime}ms)`);
    
    const { error } = await this.supabase
      .from('schema_migrations')
      .upsert({
        version,
        checksum,
        executed_at: new Date().toISOString(),
        execution_time_ms: executionTime,
        success: true,
        error_message: null,
        environment: this.environment
      });

    if (error) {
      throw new Error(`Failed to record migration success: ${error.message}`);
    }
  }

  async recordMigrationFailure(
    version: string,
    checksum: string,
    error: string,
    executionTime: number
  ): Promise<void> {
    console.log(`❌ Recording migration failure: ${version} - ${error}`);
    
    const { error: dbError } = await this.supabase
      .from('schema_migrations')
      .upsert({
        version,
        checksum,
        executed_at: new Date().toISOString(),
        execution_time_ms: executionTime,
        success: false,
        error_message: error,
        environment: this.environment
      });

    if (dbError) {
      throw new Error(`Failed to record migration failure: ${dbError.message}`);
    }
  }

  // =============================================
  // MIGRATION VALIDATION
  // =============================================

  async validateMigration(migration: MigrationFile): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Check file format
    if (!migration.filename.match(/^\d{4}-\d{2}-\d{2}_.*\.sql$/)) {
      errors.push(`Invalid filename format: ${migration.filename}`);
    }

    // Check SQL syntax (basic validation)
    if (!migration.content.trim()) {
      errors.push('Migration file is empty');
    }

    // Check for required SQL statements
    if (!migration.content.includes(';')) {
      errors.push('Migration contains no SQL statements');
    }

    // Check for dangerous operations in production
    if (this.environment === 'production') {
      const dangerousPatterns = [
        /DROP\s+DATABASE/i,
        /TRUNCATE\s+(?!schema_migrations)/i,
        /DELETE\s+FROM\s+(?!schema_migrations)/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(migration.content)) {
          errors.push(`Dangerous operation detected: ${pattern.source}`);
        }
      }
    }

    // Check dependencies
    const executedMigrations = await this.getExecutedMigrations();
    const executedVersions = new Set(executedMigrations.map(m => m.version));
    
    for (const dep of migration.dependencies) {
      if (!executedVersions.has(dep)) {
        errors.push(`Missing dependency: ${dep}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // =============================================
  // MIGRATION EXECUTION
  // =============================================

  async executeMigration(migration: MigrationFile): Promise<MigrationResult> {
    const startTime = Date.now();
    const version = migration.version;
    
    try {
      // Record migration start
      await this.recordMigrationStart(version);
      
      // Validate migration
      const validation = await this.validateMigration(migration);
      if (!validation.valid) {
        throw new Error(`Migration validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Execute migration SQL
      console.log(`🚀 Executing migration: ${migration.filename}`);
      
      const { error } = await this.supabase.rpc('exec_sql', {
        sql: migration.content
      });
      
      if (error) {
        throw new Error(`SQL execution failed: ${error.message}`);
      }
      
      // Record success
      const executionTime = Date.now() - startTime;
      await this.recordMigrationSuccess(version, migration.checksum, executionTime);
      
      return {
        version,
        success: true,
        execution_time: executionTime
      };
      
    } catch (error) {
      // Record failure
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      await this.recordMigrationFailure(
        version, 
        migration.checksum, 
        errorMessage, 
        executionTime
      );
      
      return {
        version,
        success: false,
        execution_time: executionTime,
        error: errorMessage
      };
    }
  }

  async executePendingMigrations(): Promise<{
    results: MigrationResult[];
    summary: MigrationSummary;
  }> {
    const pendingMigrations = await this.getPendingMigrations();
    const results: MigrationResult[] = [];
    
    console.log(`📋 Found ${pendingMigrations.length} pending migrations`);
    
    for (const migration of pendingMigrations) {
      const result = await this.executeMigration(migration);
      results.push(result);
      
      // Stop on first failure unless force flag is set
      if (!result.success && !process.env.FORCE_RUN) {
        console.log(`❌ Stopping migration execution due to failure: ${result.version}`);
        break;
      }
    }
    
    const summary = this.calculateSummary(results);
    
    return { results, summary };
  }

  // =============================================
  // ANALYTICS & REPORTING
  // =============================================

  private calculateSummary(results: MigrationResult[]): MigrationSummary {
    const summary: MigrationSummary = {
      total: results.length,
      executed: results.filter(r => r.success).length,
      pending: results.filter(r => !r.success && !r.error).length,
      failed: results.filter(r => !r.success).length,
      skipped: 0,
      execution_time_total: results.reduce((sum, r) => sum + r.execution_time, 0)
    };
    
    return summary;
  }

  async getMigrationHistory(limit: number = 50): Promise<MigrationRecord[]> {
    const { data, error } = await this.supabase
      .from('schema_migrations')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch migration history: ${error.message}`);
    }

    return data || [];
  }

  async getMigrationStats(): Promise<{
    total_migrations: number;
    successful_migrations: number;
    failed_migrations: number;
    average_execution_time: number;
    last_execution: string | null;
    environment_stats: Record<string, number>;
  }> {
    const { data, error } = await this.supabase
      .from('schema_migrations')
      .select('*');

    if (error) {
      throw new Error(`Failed to fetch migration stats: ${error.message}`);
    }

    const migrations = data || [];
    const successful = migrations.filter(m => m.success);
    const failed = migrations.filter(m => !m.success);
    
    const envStats: Record<string, number> = {};
    migrations.forEach(m => {
      envStats[m.environment] = (envStats[m.environment] || 0) + 1;
    });
    
    const avgExecutionTime = successful.length > 0 
      ? successful.reduce((sum, m) => sum + m.execution_time_ms, 0) / successful.length
      : 0;
    
    const lastExecution = migrations.length > 0
      ? migrations[migrations.length - 1].executed_at
      : null;

    return {
      total_migrations: migrations.length,
      successful_migrations: successful.length,
      failed_migrations: failed.length,
      average_execution_time: Math.round(avgExecutionTime),
      last_execution: lastExecution,
      environment_stats: envStats
    };
  }

  // =============================================
  // HEALTH CHECKS
  // =============================================

  async performHealthCheck(): Promise<{
    healthy: boolean;
    checks: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warn';
      message: string;
    }>;
  }> {
    const checks = [];
    
    // Check schema_migrations table exists
    try {
      const { data, error } = await this.supabase
        .from('schema_migrations')
        .select('count')
        .limit(1);
      
      if (error) {
        checks.push({
          name: 'schema_migrations_table',
          status: 'fail',
          message: `Schema migrations table error: ${error.message}`
        });
      } else {
        checks.push({
          name: 'schema_migrations_table',
          status: 'pass',
          message: 'Schema migrations table accessible'
        });
      }
    } catch (error) {
      checks.push({
        name: 'schema_migrations_table',
        status: 'fail',
        message: `Cannot access schema migrations table: ${error}`
      });
    }
    
    // Check for failed migrations
    try {
      const { data, error } = await this.supabase
        .from('schema_migrations')
        .select('version')
        .eq('success', false)
        .limit(1);
      
      if (error) {
        checks.push({
          name: 'failed_migrations_check',
          status: 'fail',
          message: `Failed to check for failed migrations: ${error.message}`
        });
      } else if (data && data.length > 0) {
        checks.push({
          name: 'failed_migrations_check',
          status: 'warn',
          message: `Found ${data.length} failed migrations`
        });
      } else {
        checks.push({
          name: 'failed_migrations_check',
          status: 'pass',
          message: 'No failed migrations found'
        });
      }
    } catch (error) {
      checks.push({
        name: 'failed_migrations_check',
        status: 'fail',
        message: `Error checking failed migrations: ${error}`
      });
    }
    
    // Check database connectivity
    try {
      const { error } = await this.supabase
        .from('schema_migrations')
        .select('version')
        .limit(1);
      
      if (error) {
        checks.push({
          name: 'database_connectivity',
          status: 'fail',
          message: `Database connectivity issue: ${error.message}`
        });
      } else {
        checks.push({
          name: 'database_connectivity',
          status: 'pass',
          message: 'Database connectivity OK'
        });
      }
    } catch (error) {
      checks.push({
        name: 'database_connectivity',
        status: 'fail',
        message: `Database connectivity error: ${error}`
      });
    }
    
    const failedChecks = checks.filter(c => c.status === 'fail');
    const healthy = failedChecks.length === 0;
    
    return { healthy, checks };
  }

  // =============================================
  // CLEANUP & MAINTENANCE
  // =============================================

  async cleanupOldRecords(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const { data, error } = await this.supabase
      .from('schema_migrations')
      .delete()
      .lt('executed_at', cutoffDate.toISOString())
      .select('version');
    
    if (error) {
      throw new Error(`Failed to cleanup old records: ${error.message}`);
    }
    
    return data?.length || 0;
  }

  async exportMigrationHistory(format: 'json' | 'csv' = 'json'): Promise<string> {
    const migrations = await this.getMigrationHistory(1000);
    
    if (format === 'csv') {
      const headers = [
        'version', 'checksum', 'executed_at', 'execution_time_ms',
        'success', 'error_message', 'environment'
      ];
      
      const rows = migrations.map(m => [
        m.version,
        m.checksum,
        m.executed_at,
        m.execution_time_ms.toString(),
        m.success.toString(),
        m.error_message || '',
        m.environment
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    return JSON.stringify(migrations, null, 2);
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

export async function createMigrationTracker(
  environment: string = process.env.NODE_ENV || 'development'
): Promise<MigrationTracker> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const migrationsDir = process.env.MIGRATIONS_DIR || './migrations';
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY');
  }
  
  const tracker = new MigrationTracker(
    supabaseUrl,
    supabaseKey,
    migrationsDir,
    environment
  );
  
  await tracker.initialize();
  return tracker;
}

export default MigrationTracker;
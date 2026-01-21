import { MigrationTracker, createMigrationTracker } from './migration-tracker';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// =============================================
// VALIDATION TYPES
// =============================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  migrationFile: string;
}

export interface DependencyNode {
  version: string;
  filename: string;
  dependencies: string[];
  dependents: string[];
  circular: boolean;
}

export interface ValidationReport {
  totalMigrations: number;
  validMigrations: number;
  invalidMigrations: number;
  circularDependencies: string[];
  missingDependencies: string[];
  securityIssues: string[];
  results: ValidationResult[];
}

// =============================================
// MIGRATION VALIDATOR CLASS
// =============================================

export class MigrationValidator {
  private migrationsDir: string;
  private environment: string;

  constructor(
    migrationsDir: string = './migrations',
    environment: string = 'development'
  ) {
    this.migrationsDir = migrationsDir;
    this.environment = environment;
  }

  // =============================================
  // FILE VALIDATION
  // =============================================

  async validateMigrationFile(filename: string): Promise<ValidationResult> {
    const filepath = path.join(this.migrationsDir, filename);
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      migrationFile: filename
    };

    try {
      // Check file exists
      const stat = await fs.stat(filepath);
      if (!stat.isFile()) {
        result.errors.push('Migration file does not exist');
        result.valid = false;
        return result;
      }

      // Check file format
      if (!filename.match(/^\d{4}-\d{2}-\d{2}_.*\.sql$/)) {
        result.errors.push(
          `Invalid filename format. Expected: YYYY-MM-DD_description.sql, Got: ${filename}`
        );
        result.valid = false;
      }

      // Read and validate content
      const content = await fs.readFile(filepath, 'utf-8');

      // Check empty file
      if (!content.trim()) {
        result.errors.push('Migration file is empty');
        result.valid = false;
        return result;
      }

      // Check for SQL statements
      if (!content.includes(';')) {
        result.warnings.push('No semicolons found - migration may contain no SQL statements');
      }

      // Validate SQL syntax (basic checks)
      await this.validateSQLSyntax(content, result);

      // Security checks
      await this.performSecurityChecks(content, filename, result);

      // Check for required elements
      this.checkRequiredElements(content, filename, result);

      // Check dependencies
      this.validateDependenciesInFile(content, filename, result);

    } catch (error) {
      result.errors.push(`Failed to validate file: ${error}`);
      result.valid = false;
    }

    return result;
  }

  private async validateSQLSyntax(
    content: string,
    result: ValidationResult
  ): Promise<void> {
    // Basic SQL syntax validation
    const sqlChecks = [
      {
        pattern: /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i,
        message: 'Use CREATE TABLE IF NOT EXISTS for idempotency'
      },
      {
        pattern: /DROP\s+TABLE/i,
        message: 'DROP TABLE detected - ensure this is intentional'
      },
      {
        pattern: /TRUNCATE/i,
        message: 'TRUNCATE detected - ensure this is intentional'
      },
      {
        pattern: /DELETE\s+FROM/i,
        message: 'DELETE FROM detected - ensure this is intentional'
      }
    ];

    for (const check of sqlChecks) {
      if (check.pattern.test(content)) {
        result.warnings.push(check.message);
      }
    }

    // Check for common syntax errors
    const syntaxErrors = [
      {
        pattern: /CREATE\s+TABLE.*\(\s*\)/,
        message: 'Empty CREATE TABLE statement found'
      },
      {
        pattern: /ALTER\s+TABLE.*ADD\s+COLUMN.*ADD\s+COLUMN/,
        message: 'Multiple ADD COLUMN in same ALTER TABLE - use separate statements'
      },
      {
        pattern: /INSERT\s+INTO.*VALUES\s*\(\s*\)/,
        message: 'Empty INSERT VALUES statement found'
      }
    ];

    for (const error of syntaxErrors) {
      if (error.pattern.test(content)) {
        result.errors.push(error.message);
        result.valid = false;
      }
    }
  }

  private async performSecurityChecks(
    content: string,
    filename: string,
    result: ValidationResult
  ): Promise<void> {
    // Security patterns to check for
    const securityChecks = [
      {
        pattern: /password\s*=\s*['"][^'"]*['"]/i,
        message: 'Hardcoded password detected',
        severity: 'error'
      },
      {
        pattern: /api_key\s*=\s*['"][^'"]*['"]/i,
        message: 'Hardcoded API key detected',
        severity: 'error'
      },
      {
        pattern: /secret\s*=\s*['"][^'"]*['"]/i,
        message: 'Hardcoded secret detected',
        severity: 'error'
      },
      {
        pattern: /DROP\s+DATABASE/i,
        message: 'DROP DATABASE detected - extremely dangerous',
        severity: 'error'
      },
      {
        pattern: /DROP\s+SCHEMA/i,
        message: 'DROP SCHEMA detected - dangerous operation',
        severity: 'error'
      },
      {
        pattern: /GRANT\s+ALL\s+PRIVILEGES/i,
        message: 'GRANT ALL PRIVILEGES detected - review permissions carefully',
        severity: 'warning'
      },
      {
        pattern: /CREATE\s+USER.*\s+WITH\s+PASSWORD/i,
        message: 'Creating user with password - ensure this is intentional',
        severity: 'warning'
      }
    ];

    for (const check of securityChecks) {
      if (check.pattern.test(content)) {
        if (check.severity === 'error') {
          result.errors.push(`Security issue: ${check.message}`);
          result.valid = false;
        } else {
          result.warnings.push(`Security warning: ${check.message}`);
        }
      }
    }

    // Check for environment-specific security issues
    if (this.environment === 'production') {
      const productionChecks = [
        {
          pattern: /TRUNCATE\s+(?!schema_migrations)/i,
          message: 'TRUNCATE in production - extremely dangerous'
        },
        {
          pattern: /DELETE\s+FROM\s+(?!schema_migrations)/i,
          message: 'DELETE FROM in production - review carefully'
        }
      ];

      for (const check of productionChecks) {
        if (check.pattern.test(content)) {
          result.errors.push(`Production security issue: ${check.message}`);
          result.valid = false;
        }
      }
    }
  }

  private checkRequiredElements(
    content: string,
    filename: string,
    result: ValidationResult
  ): void {
    // Check for RLS (Row Level Security) in new tables
    if (content.includes('CREATE TABLE') && !content.includes('ENABLE ROW LEVEL SECURITY')) {
      result.warnings.push(
        'CREATE TABLE found but no ENABLE ROW LEVEL SECURITY - review security requirements'
      );
    }

    // Check for indexes on foreign key columns
    if (content.includes('REFERENCES') && !content.includes('CREATE INDEX')) {
      result.warnings.push(
        'Foreign key constraints found but no indexes - consider adding for performance'
      );
    }

    // Check for migration comments
    if (!content.includes('--') && !content.includes('COMMENT ON')) {
      result.warnings.push(
        'No comments found in migration - add documentation for clarity'
      );
    }

    // Check for proper error handling
    if (content.includes('TRIGGER') && !content.includes('EXCEPTION')) {
      result.warnings.push(
        'Trigger found but no exception handling - consider adding TRY/CATCH blocks'
      );
    }
  }

  private validateDependenciesInFile(
    content: string,
    filename: string,
    result: ValidationResult
  ): void {
    // Extract dependency comments
    const dependencyRegex = /--\s*@depends-on:\s*(.+)/g;
    const dependencies: string[] = [];
    let match;

    while ((match = dependencyRegex.exec(content)) !== null) {
      const dep = match[1].trim();
      if (dep) {
        dependencies.push(dep);
      }
    }

    // Validate dependency format
    for (const dep of dependencies) {
      if (!dep.match(/^\d{4}-\d{2}-\d{2}_.*$/)) {
        result.errors.push(
          `Invalid dependency format: ${dep}. Expected: YYYY-MM-DD_description`
        );
        result.valid = false;
      }
    }
  }

  // =============================================
  // DEPENDENCY VALIDATION
  // =============================================

  async validateAllDependencies(): Promise<{
    valid: boolean;
    circularDependencies: string[];
    missingDependencies: string[];
    dependencyGraph: DependencyNode[];
  }> {
    const migrationFiles = await this.discoverMigrationFiles();
    const dependencyGraph: DependencyNode[] = [];
    const allVersions = new Set(migrationFiles.map(f => f.version));

    // Build dependency graph
    for (const file of migrationFiles) {
      const content = await fs.readFile(file.path, 'utf-8');
      const dependencies = this.extractDependencies(content);
      
      dependencyGraph.push({
        version: file.version,
        filename: file.filename,
        dependencies,
        dependents: [],
        circular: false
      });
    }

    // Build dependents list
    for (const node of dependencyGraph) {
      for (const dep of node.dependencies) {
        const depNode = dependencyGraph.find(n => n.version === dep);
        if (depNode) {
          depNode.dependents.push(node.version);
        }
      }
    }

    // Check for circular dependencies
    const circularDependencies = this.detectCircularDependencies(dependencyGraph);
    
    // Check for missing dependencies
    const missingDependencies: string[] = [];
    for (const node of dependencyGraph) {
      for (const dep of node.dependencies) {
        if (!allVersions.has(dep)) {
          missingDependencies.push(`${node.version} depends on missing ${dep}`);
        }
      }
    }

    return {
      valid: circularDependencies.length === 0 && missingDependencies.length === 0,
      circularDependencies,
      missingDependencies,
      dependencyGraph
    };
  }

  private detectCircularDependencies(graph: DependencyNode[]): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const circular: string[] = [];

    const dfs = (node: DependencyNode, path: string[]): void => {
      if (recursionStack.has(node.version)) {
        // Found circular dependency
        const cycleStart = path.indexOf(node.version);
        const cycle = path.slice(cycleStart).concat(node.version);
        circular.push(cycle.join(' -> '));
        node.circular = true;
        return;
      }

      if (visited.has(node.version)) {
        return;
      }

      visited.add(node.version);
      recursionStack.add(node.version);

      for (const depVersion of node.dependencies) {
        const depNode = graph.find(n => n.version === depVersion);
        if (depNode) {
          dfs(depNode, [...path, node.version]);
        }
      }

      recursionStack.delete(node.version);
    };

    for (const node of graph) {
      if (!visited.has(node.version)) {
        dfs(node, []);
      }
    }

    return circular;
  }

  // =============================================
  // UTILITY METHODS
  // =============================================

  private async discoverMigrationFiles(): Promise<Array<{
    version: string;
    filename: string;
    path: string;
  }>> {
    const files = await fs.readdir(this.migrationsDir);
    const migrationFiles = [];

    for (const file of files) {
      if (file.match(/^\d{4}-\d{2}-\d{2}_.*\.sql$/)) {
        const version = file.replace('.sql', '');
        const filepath = path.join(this.migrationsDir, file);
        migrationFiles.push({ version, filename: file, path: filepath });
      }
    }

    return migrationFiles.sort((a, b) => a.version.localeCompare(b.version));
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
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
  // COMPREHENSIVE VALIDATION
  // =============================================

  async validateAllMigrations(): Promise<ValidationReport> {
    const migrationFiles = await this.discoverMigrationFiles();
    const results: ValidationResult[] = [];
    const securityIssues: string[] = [];

    console.log(`🔍 Validating ${migrationFiles.length} migration files...`);

    // Validate each migration file
    for (const file of migrationFiles) {
      const result = await this.validateMigrationFile(file.filename);
      results.push(result);

      // Collect security issues
      if (!result.valid && result.errors.some(e => e.includes('Security'))) {
        securityIssues.push(`${file.filename}: ${result.errors.filter(e => e.includes('Security')).join(', ')}`);
      }
    }

    // Validate dependencies
    const depValidation = await this.validateAllDependencies();

    const report: ValidationReport = {
      totalMigrations: migrationFiles.length,
      validMigrations: results.filter(r => r.valid).length,
      invalidMigrations: results.filter(r => !r.valid).length,
      circularDependencies: depValidation.circularDependencies,
      missingDependencies: depValidation.missingDependencies,
      securityIssues,
      results
    };

    return report;
  }

  // =============================================
  // REPORTING
  // =============================================

  generateValidationReport(report: ValidationReport): string {
    const lines = [
      '# Migration Validation Report',
      '',
      `## Summary`,
      `- Total Migrations: ${report.totalMigrations}`,
      `- Valid Migrations: ${report.validMigrations}`,
      `- Invalid Migrations: ${report.invalidMigrations}`,
      `- Security Issues: ${report.securityIssues.length}`,
      '',
    ];

    if (report.circularDependencies.length > 0) {
      lines.push('## 🚨 Circular Dependencies');
      for (const circular of report.circularDependencies) {
        lines.push(`- ${circular}`);
      }
      lines.push('');
    }

    if (report.missingDependencies.length > 0) {
      lines.push('## ❌ Missing Dependencies');
      for (const missing of report.missingDependencies) {
        lines.push(`- ${missing}`);
      }
      lines.push('');
    }

    if (report.securityIssues.length > 0) {
      lines.push('## 🔒 Security Issues');
      for (const issue of report.securityIssues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    }

    lines.push('## Migration Details');
    for (const result of report.results) {
      const status = result.valid ? '✅' : '❌';
      lines.push(`### ${status} ${result.migrationFile}`);
      
      if (result.errors.length > 0) {
        lines.push('**Errors:**');
        for (const error of result.errors) {
          lines.push(`- ${error}`);
        }
      }
      
      if (result.warnings.length > 0) {
        lines.push('**Warnings:**');
        for (const warning of result.warnings) {
          lines.push(`- ${warning}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // =============================================
  // EXECUTION ORDER CALCULATION
  // =============================================

  async calculateExecutionOrder(): Promise<string[]> {
    const depValidation = await this.validateAllDependencies();
    
    if (!depValidation.valid) {
      throw new Error('Cannot calculate execution order due to dependency issues');
    }

    const graph = depValidation.dependencyGraph;
    const visited = new Set<string>();
    const executionOrder: string[] = [];

    const topologicalSort = (node: DependencyNode): void => {
      if (visited.has(node.version)) {
        return;
      }

      // Visit dependencies first
      for (const depVersion of node.dependencies) {
        const depNode = graph.find(n => n.version === depVersion);
        if (depNode) {
          topologicalSort(depNode);
        }
      }

      visited.add(node.version);
      executionOrder.push(node.version);
    };

    // Process all nodes
    for (const node of graph) {
      if (!visited.has(node.version)) {
        topologicalSort(node);
      }
    }

    return executionOrder;
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

export async function validateMigrations(
  migrationsDir: string = './migrations',
  environment: string = 'development'
): Promise<ValidationReport> {
  const validator = new MigrationValidator(migrationsDir, environment);
  return await validator.validateAllMigrations();
}

export async function generateExecutionOrder(
  migrationsDir: string = './migrations'
): Promise<string[]> {
  const validator = new MigrationValidator(migrationsDir);
  return await validator.calculateExecutionOrder();
}

export async function checkMigrationHealth(
  tracker: MigrationTracker,
  migrationsDir: string = './migrations'
): Promise<{
  healthy: boolean;
  issues: string[];
  recommendations: string[];
}> {
  const validator = new MigrationValidator(migrationsDir);
  const validation = await validator.validateAllMigrations();
  const healthCheck = await tracker.performHealthCheck();
  
  const issues = [
    ...validation.results.filter(r => !r.valid).map(r => `${r.migrationFile}: ${r.errors.join(', ')}`),
    ...validation.circularDependencies.map(dep => `Circular dependency: ${dep}`),
    ...validation.missingDependencies.map(dep => `Missing dependency: ${dep}`),
    ...healthCheck.checks.filter(c => c.status === 'fail').map(c => `${c.name}: ${c.message}`)
  ];

  const recommendations = [
    ...validation.results.filter(r => r.warnings.length > 0).flatMap(r => 
      r.warnings.map(w => `${r.migrationFile}: ${w}`)
    ),
    ...healthCheck.checks.filter(c => c.status === 'warn').map(c => `${c.name}: ${c.message}`)
  ];

  return {
    healthy: issues.length === 0 && healthCheck.healthy,
    issues,
    recommendations
  };
}

export default MigrationValidator;
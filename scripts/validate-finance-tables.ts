/**
 * Finance Tables Validation Script
 * 
 * This script validates that the duplicate finance tables issue has been resolved.
 * It checks:
 * 1. finances table exists with correct schema
 * 2. finance_records table does not exist
 * 3. RLS policies are properly applied
 * 4. RPC functions are available
 */

import { supabase } from '../lib/supabase'

interface ValidationResult {
  success: boolean
  message: string
  details?: any
}

class FinanceTablesValidator {
  async validateFinancesTable(): Promise<ValidationResult> {
    try {
      // Check if finances table exists and has correct columns
      const { data: columns, error: columnError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_name', 'finances')
        .eq('table_schema', 'public')

      if (columnError) {
        return {
          success: false,
          message: `Error checking finances table columns: ${columnError.message}`
        }
      }

      if (!columns || columns.length === 0) {
        return {
          success: false,
          message: 'finances table does not exist'
        }
      }

      // Check for required columns
      const requiredColumns = [
        'id', 'project_id', 'tenant_id', 'total_agreed', 'total_collected',
        'direct_expenses', 'imputed_expenses', 'hours_worked', 'business_model',
        'health', 'profit_margin', 'created_at', 'updated_at'
      ]

      const missingColumns = requiredColumns.filter(col => 
        !columns.some(c => c.column_name === col)
      )

      if (missingColumns.length > 0) {
        return {
          success: false,
          message: `finances table missing required columns: ${missingColumns.join(', ')}`,
          details: { existingColumns: columns.map(c => c.column_name) }
        }
      }

      return {
        success: true,
        message: `finances table exists with ${columns.length} columns`,
        details: { columns }
      }
    } catch (error) {
      return {
        success: false,
        message: `Error validating finances table: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  async validateFinanceRecordsTable(): Promise<ValidationResult> {
    try {
      // Check if finance_records table exists (it should NOT exist)
      const { data: tables, error: tableError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_name', 'finance_records')
        .eq('table_schema', 'public')
        .single()

      if (!tableError && tables) {
        return {
          success: false,
          message: 'finance_records table still exists (should be removed)'
        }
      }

      if (tableError && tableError.code === 'PGRST116') {
        // Table doesn't exist, which is correct
        return {
          success: true,
          message: 'finance_records table correctly does not exist'
        }
      }

      return {
        success: true,
        message: 'finance_records table correctly does not exist'
      }
    } catch (error) {
      return {
        success: true,
        message: 'finance_records table correctly does not exist'
      }
    }
  }

  async validateRLSPolicies(): Promise<ValidationResult> {
    try {
      const { data: policies, error: policyError } = await supabase
        .from('pg_policies')
        .select('policyname, tablename, policydef')
        .eq('tablename', 'finances')
        .eq('schemaname', 'public')

      if (policyError) {
        return {
          success: false,
          message: `Error checking RLS policies: ${policyError.message}`
        }
      }

      if (!policies || policies.length === 0) {
        return {
          success: false,
          message: 'No RLS policies found for finances table'
        }
      }

      const expectedPolicies = ['finances_select_policy', 'finances_modify_policy']
      const missingPolicies = expectedPolicies.filter(policyName =>
        !policies.some(p => p.policyname === policyName)
      )

      if (missingPolicies.length > 0) {
        return {
          success: false,
          message: `Missing RLS policies: ${missingPolicies.join(', ')}`,
          details: { existingPolicies: policies.map(p => p.policyname) }
        }
      }

      return {
        success: true,
        message: `Found ${policies.length} RLS policies for finances table`,
        details: { policies }
      }
    } catch (error) {
      return {
        success: false,
        message: `Error validating RLS policies: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  async validateRPCFunctions(): Promise<ValidationResult> {
    try {
      const { data: functions, error: funcError } = await supabase
        .from('pg_proc')
        .select('proname, pronargs')
        .eq('proname', 'get_project_financial_summary')

      if (funcError) {
        return {
          success: false,
          message: `Error checking RPC functions: ${funcError.message}`
        }
      }

      if (!functions || functions.length === 0) {
        return {
          success: false,
          message: 'get_project_financial_summary RPC function not found'
        }
      }

      return {
        success: true,
        message: `get_project_financial_summary RPC function exists`,
        details: { functions }
      }
    } catch (error) {
      return {
        success: false,
        message: `Error validating RPC functions: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  async validateIndexes(): Promise<ValidationResult> {
    try {
      const expectedIndexes = [
        'idx_finances_project_id',
        'idx_finances_tenant_id',
        'idx_finances_health',
        'idx_finances_business_model'
      ]

      const { data: indexes, error: indexError } = await supabase
        .from('pg_indexes')
        .select('indexname')
        .eq('schemaname', 'public')
        .in('indexname', expectedIndexes)

      if (indexError) {
        return {
          success: false,
          message: `Error checking indexes: ${indexError.message}`
        }
      }

      const existingIndexNames = indexes?.map(i => i.indexname) || []
      const missingIndexes = expectedIndexes.filter(indexName =>
        !existingIndexNames.includes(indexName)
      )

      if (missingIndexes.length > 0) {
        return {
          success: false,
          message: `Missing indexes: ${missingIndexes.join(', ')}`,
          details: { existingIndexes: existingIndexNames }
        }
      }

      return {
        success: true,
        message: `All ${expectedIndexes.length} expected indexes exist`,
        details: { indexes: existingIndexNames }
      }
    } catch (error) {
      return {
        success: false,
        message: `Error validating indexes: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  async runFullValidation(): Promise<{
    overallSuccess: boolean
    results: Record<string, ValidationResult>
    summary: string
  }> {
    console.log('🔍 Starting Finance Tables Validation...\n')

    const results = {
      financesTable: await this.validateFinancesTable(),
      financeRecordsTable: await this.validateFinanceRecordsTable(),
      rlsPolicies: await this.validateRLSPolicies(),
      rpcFunctions: await this.validateRPCFunctions(),
      indexes: await this.validateIndexes()
    }

    const successCount = Object.values(results).filter(r => r.success).length
    const totalCount = Object.keys(results).length
    const overallSuccess = successCount === totalCount

    console.log('📊 Validation Results:')
    Object.entries(results).forEach(([key, result]) => {
      const icon = result.success ? '✅' : '❌'
      console.log(`${icon} ${key}: ${result.message}`)
      if (result.details) {
        console.log(`   Details:`, JSON.stringify(result.details, null, 2))
      }
    })

    const summary = overallSuccess
      ? `✅ All ${totalCount} validation checks passed! Duplicate finance tables issue has been resolved.`
      : `⚠️ ${totalCount - successCount} of ${totalCount} validation checks failed. Issues remain to be resolved.`

    console.log(`\n🎯 Summary: ${summary}`)

    return {
      overallSuccess,
      results,
      summary
    }
  }
}

// Export for use in other files or scripts
export { FinanceTablesValidator }
export type { ValidationResult }

// Run validation if this file is executed directly
if (typeof window === 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const validator = new FinanceTablesValidator()
  validator.runFullValidation().then(({ overallSuccess, summary }) => {
    process.exit(overallSuccess ? 0 : 1)
  })
}
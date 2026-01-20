// Test de conexión a Supabase
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testConnection() {
  console.log('🧪 Testing Supabase connection...')
  
  try {
    // Test 1: Connection
    console.log('📡 Testing basic connection...')
    const { data: health, error: healthError } = await supabase.rpc('pg_stat_statements_reset')
    if (healthError) {
      console.log('⚠️  Health check failed (expected if extension not enabled)')
    } else {
      console.log('✅ Connection healthy')
    }
    
    // Test 2: List existing tables
    console.log('📋 Checking existing tables...')
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
    
    if (tablesError) {
      console.error('❌ Error listing tables:', tablesError)
    } else {
      console.log('📊 Existing tables:', tables?.map(t => t.table_name) || 'None')
    }
    
    // Test 3: Try to query our tables (they might not exist yet)
    console.log('🔍 Testing table queries...')
    
    const tablesToTest = ['projects', 'ideas', 'leads', 'activity_logs']
    for (const table of tablesToTest) {
      try {
        const { data, error } = await supabase.from(table).select('*').limit(1)
        if (error) {
          console.log(`⚠️  Table '${table}' not accessible:`, error.message)
        } else {
          console.log(`✅ Table '${table}' accessible, rows:`, data?.length || 0)
        }
      } catch (err) {
        console.log(`⚠️  Could not query '${table}':`, err.message)
      }
    }
    
    // Test 4: Real-time subscription
    console.log('📡 Testing real-time subscription...')
    const channel = supabase
      .channel('test-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        console.log('🔄 Real-time update received:', payload)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active')
        }
      })
    
    // Test 5: Insert test data (if tables exist)
    console.log('💾 Testing data insertion...')
    try {
      const { data: insertData, error: insertError } = await supabase
        .from('projects')
        .insert({
          title: 'Test Project',
          description: 'This is a test project',
          progress: 0,
          status: 'Active',
          client: 'Test Client'
        })
        .select()
      
      if (insertError) {
        console.log('⚠️  Insert failed (tables might not exist):', insertError.message)
      } else {
        console.log('✅ Test data inserted:', insertData)
        
        // Clean up test data
        if (insertData && insertData[0]) {
          await supabase.from('projects').delete().eq('id', insertData[0].id)
          console.log('🧹 Test data cleaned up')
        }
      }
    } catch (err) {
      console.log('⚠️  Insert test failed:', err.message)
    }
    
    console.log('🎉 Connection test complete!')
    
    // Cleanup
    setTimeout(() => {
      supabase.removeChannel(channel)
      console.log('🧹 Cleanup complete')
    }, 5000)
    
  } catch (error) {
    console.error('❌ Connection test failed:', error)
  }
}

testConnection()
// Error logger para debugging de navegación
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function debugNavigation() {
  console.log('🔍 Debug de navegación y errores...')
  
  // Test 1: Verificar conexión a cada tabla
  console.log('\n1. Verificando conexión a tablas:')
  const tables = ['projects', 'ideas', 'leads', 'activity_logs', 'web_analytics']
  
  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact' })
        .limit(1)
      
      if (error) {
        console.log(`   ❌ ${table}: ${error.message}`)
      } else {
        console.log(`   ✅ ${table}: ${count || 0} registros`)
      }
    } catch (err) {
      console.log(`   ❌ Error crítico en ${table}:`, err.message)
    }
  }
  
  // Test 2: Verificar estructura de datos
  console.log('\n2. Verificando estructura de datos:')
  
  // Projects
  const { data: projects } = await supabase.from('projects').select('*').limit(1)
  if (projects && projects[0]) {
    console.log('   📊 Projects columns:', Object.keys(projects[0]).join(', '))
  }
  
  // Ideas  
  const { data: ideas } = await supabase.from('ideas').select('*').limit(1)
  if (ideas && ideas[0]) {
    console.log('   💡 Ideas columns:', Object.keys(ideas[0]).join(', '))
  }
  
  // Leads
  const { data: leads } = await supabase.from('leads').select('*').limit(1)
  if (leads && leads[0]) {
    console.log('   🎯 Leads columns:', Object.keys(leads[0]).join(', '))
  }
  
  // Test 3: Verificar suscripciones en tiempo real
  console.log('\n3. Probando suscripciones:')
  
  let subscriptionErrors = []
  
  const channels = tables.map(table => {
    return supabase
      .channel(`${table}-test`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        console.log(`   🔄 Cambio en ${table}:`, payload.eventType)
      })
      .subscribe((status, err) => {
        if (err) {
          console.log(`   ❌ Error en ${table}:`, err.message)
          subscriptionErrors.push({ table, error: err.message })
        } else if (status === 'SUBSCRIBED') {
          console.log(`   ✅ Suscripción activa en ${table}`)
        }
      })
  })
  
  // Test 4: Simular navegación rápida
  console.log('\n4. Simulando navegación rápida...')
  
  const pages = ['projects', 'ideas', 'leads', 'activity_logs']
  
  for (const page of pages) {
    try {
      const start = Date.now()
      const { data, error } = await supabase.from(page).select('*').limit(5)
      const duration = Date.now() - start
      
      if (error) {
        console.log(`   ❌ ${page}: ${error.message}`)
      } else {
        console.log(`   ✅ ${page}: ${data?.length || 0} registros en ${duration}ms`)
      }
    } catch (err) {
      console.log(`   ❌ Error crítico en ${page}:`, err.message)
    }
  }
  
  // Test 5: Verificar tipos de datos
  console.log('\n5. Verificando tipos de datos problemáticos:')
  
  // Verificar campos JSONB
  const { data: leadsData } = await supabase.from('leads').select('ai_analysis').limit(1)
  if (leadsData && leadsData[0]) {
    console.log('   📋 ai_analysis type:', typeof leadsData[0].ai_analysis)
    console.log('   📋 ai_analysis value:', JSON.stringify(leadsData[0].ai_analysis)?.substring(0, 50))
  }
  
  const { data: analyticsData } = await supabase.from('web_analytics').select('top_pages, daily_visits').limit(1)
  if (analyticsData && analyticsData[0]) {
    console.log('   📊 JSONB fields type:', typeof analyticsData[0].top_pages, typeof analyticsData[0].daily_visits)
  }
  
  console.log('\n🔍 Debug completado!')
  console.log('📋 Resumen de errores encontrados:', subscriptionErrors.length)
  
  // Cleanup
  setTimeout(() => {
    channels.forEach(ch => supabase.removeChannel(ch))
    console.log('🧹 Limpieza completada')
  }, 5000)
}

debugNavigation()
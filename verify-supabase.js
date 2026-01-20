// Verificación de que las tablas se crearon correctamente
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function verifySetup() {
  console.log('🔍 Verificando configuración de Supabase...')
  
  try {
    // Verificar cada tabla
    const tables = ['projects', 'ideas', 'leads', 'activity_logs', 'web_analytics']
    
    for (const table of tables) {
      try {
        const { data, error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact' })
          .limit(5)
        
        if (error) {
          console.log(`❌ Tabla ${table}: ${error.message}`)
        } else {
          console.log(`✅ Tabla ${table}: ${count || 0} registros encontrados`)
          if (data && data.length > 0) {
            console.log(`   📊 Muestra:`, JSON.stringify(data[0], null, 2).substring(0, 100) + '...')
          }
        }
      } catch (err) {
        console.log(`⚠️  Error verificando ${table}:`, err.message)
      }
    }
    
    // Probar inserción de datos de prueba
    console.log('\n🧪 Probando inserción de datos...')
    
    // Insertar proyecto de prueba
    const { data: newProject, error: projectError } = await supabase
      .from('projects')
      .insert({
        title: 'Test Project - ' + new Date().toLocaleTimeString(),
        description: 'Proyecto de prueba desde verificación',
        progress: 25,
        status: 'Active',
        client: 'Test Client'
      })
      .select()
    
    if (projectError) {
      console.log('❌ Error insertando proyecto:', projectError.message)
    } else {
      console.log('✅ Proyecto insertado:', newProject[0].id)
      
      // Limpiar
      await supabase.from('projects').delete().eq('id', newProject[0].id)
      console.log('🧹 Proyecto de prueba eliminado')
    }
    
    // Probar suscripción en tiempo real
    console.log('\n📡 Probando suscripción en tiempo real...')
    
    const channel = supabase
      .channel('test-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        console.log('🔄 Cambio detectado:', payload.eventType, 'en projects')
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Suscripción activa')
        }
      })
    
    console.log('\n🎉 Verificación completa!')
    console.log('🌐 Tu app está conectada a Supabase y lista para usar')
    console.log('📍 URL: http://localhost:3000')
    
    // Cleanup
    setTimeout(() => {
      supabase.removeChannel(channel)
    }, 3000)
    
  } catch (error) {
    console.error('❌ Error en verificación:', error)
  }
}

verifySetup()
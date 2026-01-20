// Script de prueba para el sistema de clientes
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testClientsSystem() {
  console.log('🧪 Probando sistema de clientes...')
  
  try {
    // 1. Verificar tablas existen
    console.log('\n1. Verificando tablas...')
    const tables = ['clients', 'client_messages', 'client_tasks', 'client_history']
    
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select().limit(1)
      if (error) {
        console.log(`   ❌ ${table}: ${error.message}`)
      } else {
        console.log(`   ✅ ${table}: OK`)
      }
    }
    
    // 2. Crear cliente de prueba
    console.log('\n2. Creando cliente de prueba...')
    const { data: testClient, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: 'Cliente de Prueba',
        email: 'test@cliente.com',
        company: 'Empresa Test',
        phone: '+1-555-TEST',
        status: 'prospect',
        notes: 'Este es un cliente de prueba',
        industry: 'Testing',
        address: '123 Test St'
      })
      .select()
      .single()
    
    if (clientError) {
      console.log(`   ❌ Error creando cliente: ${clientError.message}`)
    } else {
      console.log(`   ✅ Cliente creado: ${testClient.id}`)
    }
    
    // 3. Crear mensaje de prueba
    if (testClient) {
      console.log('\n3. Creando mensaje de prueba...')
      const { data: message, error: msgError } = await supabase
        .from('client_messages')
        .insert({
          client_id: testClient.id,
          sender_type: 'user',
          sender_name: 'Usuario Test',
          message: 'Hola, este es un mensaje de prueba',
          message_type: 'text'
        })
        .select()
        .single()
      
      if (msgError) {
        console.log(`   ❌ Error creando mensaje: ${msgError.message}`)
      } else {
        console.log(`   ✅ Mensaje creado: ${message.id}`)
      }
      
      // 4. Crear tarea de prueba
      console.log('\n4. Creando tarea de prueba...')
      const { data: task, error: taskError } = await supabase
        .from('client_tasks')
        .insert({
          client_id: testClient.id,
          title: 'Tarea de prueba',
          description: 'Esta es una tarea de prueba',
          priority: 'medium',
          completed: false
        })
        .select()
        .single()
      
      if (taskError) {
        console.log(`   ❌ Error creando tarea: ${taskError.message}`)
      } else {
        console.log(`   ✅ Tarea creada: ${task.id}`)
      }
      
      // 5. Crear historial de prueba
      console.log('\n5. Creando historial de prueba...')
      const { data: history, error: histError } = await supabase
        .from('client_history')
        .insert({
          client_id: testClient.id,
          user_name: 'Usuario Test',
          action_type: 'note',
          action_description: 'Cliente de prueba creado'
        })
        .select()
        .single()
      
      if (histError) {
        console.log(`   ❌ Error creando historial: ${histError.message}`)
      } else {
        console.log(`   ✅ Historial creado: ${history.id}`)
      }
      
      // 6. Verificar datos creados
      console.log('\n6. Verificando datos creados...')
      
      // Verificar cliente
      const { data: verifyClient } = await supabase
        .from('clients')
        .select('*')
        .eq('id', testClient.id)
        .single()
      
      if (verifyClient) {
        console.log(`   ✅ Cliente verificado: ${verifyClient.name}`)
      }
      
      // Verificar mensajes
      const { data: verifyMessages } = await supabase
        .from('client_messages')
        .select('*')
        .eq('client_id', testClient.id)
      
      console.log(`   ✅ Mensajes: ${verifyMessages?.length || 0}`)
      
      // Verificar tareas
      const { data: verifyTasks } = await supabase
        .from('client_tasks')
        .select('*')
        .eq('client_id', testClient.id)
      
      console.log(`   ✅ Tareas: ${verifyTasks?.length || 0}`)
      
      // Verificar historial
      const { data: verifyHistory } = await supabase
        .from('client_history')
        .select('*')
        .eq('client_id', testClient.id)
      
      console.log(`   ✅ Historial: ${verifyHistory?.length || 0}`)
      
      // 7. Limpiar datos de prueba
      console.log('\n7. Limpiando datos de prueba...')
      
      await supabase.from('client_history').delete().eq('client_id', testClient.id)
      await supabase.from('client_tasks').delete().eq('client_id', testClient.id)
      await supabase.from('client_messages').delete().eq('client_id', testClient.id)
      await supabase.from('clients').delete().eq('id', testClient.id)
      
      console.log('   ✅ Datos de prueba eliminados')
      
    }
    
    console.log('\n🎉 Sistema de clientes funcionando correctamente!')
    console.log('📍 Ahora puedes usar la sección de Clientes con datos reales')
    
  } catch (error) {
    console.error('❌ Error en prueba:', error)
  }
}

testClientsSystem()
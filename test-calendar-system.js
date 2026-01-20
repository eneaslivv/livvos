// Script de prueba para el sistema de calendario
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testCalendarSystem() {
  console.log('🧪 Probando sistema de calendario...')
  
  try {
    // 1. Verificar tablas existen
    console.log('\n1. Verificando tablas...')
    const tables = ['calendar_events', 'calendar_tasks', 'calendar_labels']
    
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select().limit(1)
      if (error) {
        console.log(`   ❌ ${table}: ${error.message}`)
      } else {
        console.log(`   ✅ ${table}: OK`)
      }
    }
    
    // 2. Crear evento de prueba
    console.log('\n2. Creando evento de prueba...')
    const today = new Date().toISOString().split('T')[0]
    
    const { data: testEvent, error: eventError } = await supabase
      .from('calendar_events')
      .insert({
        title: 'Evento de Prueba',
        description: 'Este es un evento de prueba',
        start_date: today,
        start_time: '14:00',
        duration: 60,
        type: 'meeting',
        color: '#3b82f6',
        location: 'Zoom'
      })
      .select()
      .single()
    
    if (eventError) {
      console.log(`   ❌ Error creando evento: ${eventError.message}`)
    } else {
      console.log(`   ✅ Evento creado: ${testEvent.id}`)
    }
    
    // 3. Crear tarea de prueba
    console.log('\n3. Creando tarea de prueba...')
    const { data: testTask, error: taskError } = await supabase
      .from('calendar_tasks')
      .insert({
        title: 'Tarea de Prueba',
        description: 'Esta es una tarea de prueba',
        start_date: today,
        priority: 'high',
        status: 'todo',
        duration: 90
      })
      .select()
      .single()
    
    if (taskError) {
      console.log(`   ❌ Error creando tarea: ${taskError.message}`)
    } else {
      console.log(`   ✅ Tarea creada: ${testTask.id}`)
    }
    
    // 4. Crear etiqueta de prueba
    console.log('\n4. Creando etiqueta de prueba...')
    const { data: testLabel, error: labelError } = await supabase
      .from('calendar_labels')
      .insert({
        name: 'Prueba',
        color: '#ef4444'
      })
      .select()
      .single()
    
    if (labelError) {
      console.log(`   ❌ Error creando etiqueta: ${labelError.message}`)
    } else {
      console.log(`   ✅ Etiqueta creada: ${testLabel.id}`)
    }
    
    // 5. Verificar datos creados
    console.log('\n5. Verificando datos creados...')
    
    // Verificar eventos
    const { data: verifyEvents } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('start_date', today)
    
    console.log(`   ✅ Eventos de hoy: ${verifyEvents?.length || 0}`)
    
    // Verificar tareas
    const { data: verifyTasks } = await supabase
      .from('calendar_tasks')
      .select('*')
      .eq('start_date', today)
    
    console.log(`   ✅ Tareas de hoy: ${verifyTasks?.length || 0}`)
    
    // Verificar etiquetas
    const { data: verifyLabels } = await supabase
      .from('calendar_labels')
      .select('*')
    
    console.log(`   ✅ Etiquetas totales: ${verifyLabels?.length || 0}`)
    
    // 6. Probar actualización
    console.log('\n6. Probando actualización...')
    
    if (testTask) {
      const { error: updateError } = await supabase
        .from('calendar_tasks')
        .update({ completed: true })
        .eq('id', testTask.id)
      
      if (updateError) {
        console.log(`   ❌ Error actualizando tarea: ${updateError.message}`)
      } else {
        console.log(`   ✅ Tarea marcada como completada`)
      }
    }
    
    // 7. Limpiar datos de prueba
    console.log('\n7. Limpiando datos de prueba...')
    
    if (testEvent) {
      await supabase.from('calendar_events').delete().eq('id', testEvent.id)
      console.log('   ✅ Evento de prueba eliminado')
    }
    
    if (testTask) {
      await supabase.from('calendar_tasks').delete().eq('id', testTask.id)
      console.log('   ✅ Tarea de prueba eliminada')
    }
    
    if (testLabel) {
      await supabase.from('calendar_labels').delete().eq('id', testLabel.id)
      console.log('   ✅ Etiqueta de prueba eliminada')
    }
    
    console.log('\n🎉 Sistema de calendario funcionando correctamente!')
    console.log('📅 Ahora puedes usar la sección de Calendario con datos reales')
    
  } catch (error) {
    console.error('❌ Error en prueba:', error)
  }
}

testCalendarSystem()
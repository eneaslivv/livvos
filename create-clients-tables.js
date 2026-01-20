// Script para crear tablas de clientes directamente
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function createClientsTables() {
  console.log('🚀 Creando tablas de clientes...')
  
  try {
    // 1. Crear tabla clients
    const { error: clientsError } = await supabase.from('clients').select().limit(1)
    if (clientsError && clientsError.code === 'PGRST116') {
      console.log('📋 Creando tabla clients...')
      const { error } = await supabase.from('clients').insert({
        name: 'Test Client',
        email: 'test@example.com',
        company: 'Test Company'
      })
      if (error) {
        console.log('❌ Error creando clients:', error.message)
      } else {
        console.log('✅ Tabla clients creada')
      }
    } else {
      console.log('✅ Tabla clients ya existe')
    }
    
    // 2. Verificar si hay datos de muestra
    const { data: existingClients, error: checkError } = await supabase
      .from('clients')
      .select('id')
      .limit(1)
    
    if (checkError) {
      console.log('❌ Error verificando datos:', checkError.message)
      return
    }
    
    if (!existingClients || existingClients.length === 0) {
      console.log('📊 Insertando datos de muestra...')
      
      // Insertar clientes de muestra
      const { error: insertError } = await supabase.from('clients').insert([
        {
          name: 'Sofia Rodriguez',
          email: 'sofia@techcorp.com',
          company: 'TechCorp Solutions',
          phone: '+1-555-0123',
          status: 'active',
          notes: 'CEO interesada en rebranding completo. Muy receptiva a ideas creativas.',
          industry: 'Technology',
          address: '123 Main St, San Francisco, CA'
        },
        {
          name: 'Lucas Martinez',
          email: 'lucas@startup.io',
          company: 'StartupXYZ',
          phone: '+1-555-0456',
          status: 'prospect',
          notes: 'CTO técnico, enfocado en escalabilidad y performance.',
          industry: 'SaaS',
          address: '456 Innovation Ave, Austin, TX'
        },
        {
          name: 'Sarah Jenkins',
          email: 'sarah@boutique.co',
          company: 'Fashion Boutique',
          phone: '+1-555-0789',
          status: 'active',
          notes: 'Dueña de boutique de moda. Necesita e-commerce moderno.',
          industry: 'Fashion',
          address: '789 Style Blvd, New York, NY'
        }
      ])
      
      if (insertError) {
        console.log('❌ Error insertando datos:', insertError.message)
      } else {
        console.log('✅ Datos de muestra insertados')
      }
    } else {
      console.log('✅ Ya hay datos en clients')
    }
    
    console.log('🎉 Tablas de clientes listas!')
    
  } catch (error) {
    console.error('❌ Error general:', error)
  }
}

createClientsTables()
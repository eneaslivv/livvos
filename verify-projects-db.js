import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function verifyProjectsTable() {
  console.log('🔍 Verificando tabla projects...')
  
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .limit(1)
  
  if (error) {
    console.error('❌ Error accediendo a projects:', error.message)
    if (error.code === '42P01') {
      console.log('ℹ️ La tabla projects no existe. Debes crearla.')
    }
  } else {
    console.log('✅ Tabla projects accesible.')
    console.log('📊 Columnas detectadas (basado en respuesta):', data && data.length > 0 ? Object.keys(data[0]) : 'Sin datos para inferir columnas')
  }
}

verifyProjectsTable()

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function clearTable(name) {
  const { error } = await supabase.from(name).delete().not('id','is',null)
  if (error) {
    console.error(`Error limpiando ${name}:`, error.message)
  } else {
    console.log(`✔ ${name} limpio`)
  }
}

async function run() {
  console.log('Limpiando datos en Supabase...')
  await clearTable('activity_logs')
  await clearTable('web_analytics')
  await clearTable('leads')
  await clearTable('ideas')
  await clearTable('projects')
  console.log('Listo. Tablas vacías.')
}

run()

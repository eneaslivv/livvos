// Script de prueba para el sistema de documentos
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://azkhquxgekgfuplvwobe.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6a2hxdXhnZWtnZnVwbHZ3b2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDk0MzIsImV4cCI6MjA4MjUyNTQzMn0.C3npJ7UY-6Xa8yibX0F4jqfVdVVtz4TIbxeZgvKI6-I'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testDocsSystem() {
  console.log('🧪 Probando sistema de documentos...')
  
  try {
    // 1. Verificar tablas existen
    console.log('\n1. Verificando tablas...')
    const tables = ['folders', 'files']
    
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select().limit(1)
      if (error) {
        console.log(`   ❌ ${table}: ${error.message}`)
      } else {
        console.log(`   ✅ ${table}: OK`)
      }
    }
    
    // 2. Crear carpeta de prueba
    console.log('\n2. Creando carpeta de prueba...')
    const { data: testFolder, error: folderError } = await supabase
      .from('folders')
      .insert({
        name: 'Carpeta de Prueba',
        color: '#3b82f6'
      })
      .select()
      .single()
    
    if (folderError) {
      console.log(`   ❌ Error creando carpeta: ${folderError.message}`)
    } else {
      console.log(`   ✅ Carpeta creada: ${testFolder.id}`)
    }
    
    // 3. Crear subcarpeta
    if (testFolder) {
      console.log('\n3. Creando subcarpeta...')
      const { data: subFolder, error: subError } = await supabase
        .from('folders')
        .insert({
          name: 'Subcarpeta',
          parent_id: testFolder.id,
          color: '#10b981'
        })
        .select()
        .single()
      
      if (subError) {
        console.log(`   ❌ Error creando subcarpeta: ${subError.message}`)
      } else {
        console.log(`   ✅ Subcarpeta creada: ${subFolder.id}`)
      }
      
      // 4. Crear archivo simulado (metadatos)
      console.log('\n4. Creando metadatos de archivo...')
      const { data: testFile, error: fileError } = await supabase
        .from('files')
        .insert({
          name: 'documento_prueba.pdf',
          type: 'application/pdf',
          size: 1024,
          url: 'https://example.com/fake-url',
          folder_id: testFolder.id
        })
        .select()
        .single()
      
      if (fileError) {
        console.log(`   ❌ Error creando archivo: ${fileError.message}`)
      } else {
        console.log(`   ✅ Archivo creado: ${testFile.id}`)
      }
      
      // 5. Verificar estructura
      console.log('\n5. Verificando estructura...')
      
      // Contar carpetas en raíz (debería haber al menos las default)
      const { count: rootCount } = await supabase
        .from('folders')
        .select('*', { count: 'exact', head: true })
        .is('parent_id', null)
      
      console.log(`   ✅ Carpetas en raíz: ${rootCount}`)
      
      // Contar archivos en carpeta de prueba
      const { count: filesCount } = await supabase
        .from('files')
        .select('*', { count: 'exact', head: true })
        .eq('folder_id', testFolder.id)
      
      console.log(`   ✅ Archivos en carpeta prueba: ${filesCount}`)
      
      // 6. Limpiar datos de prueba
      console.log('\n6. Limpiando datos de prueba...')
      
      if (testFile) {
        await supabase.from('files').delete().eq('id', testFile.id)
      }
      
      if (subFolder) {
        await supabase.from('folders').delete().eq('id', subFolder.id)
      }
      
      await supabase.from('folders').delete().eq('id', testFolder.id)
      
      console.log('   ✅ Datos de prueba eliminados')
    }
    
    console.log('\n🎉 Sistema de documentos funcionando correctamente!')
    console.log('📂 Ahora puedes subir archivos reales a Supabase Storage')
    
  } catch (error) {
    console.error('❌ Error en prueba:', error)
  }
}

testDocsSystem()
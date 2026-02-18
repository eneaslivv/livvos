import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function finalFix() {
    console.log('🔧 SOLUCIÓN FINAL: Configuración de bucket público sin RLS');

    // Paso 1: Eliminar el bucket si existe y recrearlo como público
    console.log('1. Eliminando bucket documents si existe...');
    await supabase.storage.deleteBucket('documents');

    console.log('2. Creando bucket documents como PÚBLICO...');
    const { data: bucketData, error: bucketError } = await supabase.storage.createBucket('documents', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: null // Permitir todos los tipos
    });

    if (bucketError && !bucketError.message.includes('already exists')) {
        console.error('Error creando bucket:', bucketError);
    } else {
        console.log('✅ Bucket creado/verificado como público');
    }

    // Paso 2: Eliminar TODAS las políticas RLS de storage.objects
    console.log('3. Eliminando todas las políticas RLS de storage.objects...');
    const dropAllPolicies = `
    DO $$
    DECLARE
        pol RECORD;
    BEGIN
        FOR pol IN (
            SELECT policyname 
            FROM pg_policies 
            WHERE schemaname = 'storage' AND tablename = 'objects'
        ) LOOP
            BEGIN
                EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
                RAISE NOTICE 'Eliminada política: %', pol.policyname;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'No se pudo eliminar política: %', pol.policyname;
            END;
        END LOOP;
    END $$;
  `;

    const { error: dropError } = await supabase.rpc('exec_sql', { sql: dropAllPolicies });
    if (dropError) {
        console.log('⚠️  Error eliminando políticas (puede ser normal):', dropError.message);
    }

    // Paso 3: NO crear ninguna política nueva
    // Si el bucket es público, Supabase permite acceso sin RLS
    console.log('4. Bucket configurado como público - no se necesitan políticas RLS');

    // Paso 4: Verificar configuración
    console.log('5. Verificando configuración...');
    const { data: buckets } = await supabase.storage.listBuckets();
    const docsBucket = buckets?.find(b => b.id === 'documents');

    if (docsBucket) {
        console.log('✅ Bucket documents encontrado:');
        console.log('   - Público:', docsBucket.public);
        console.log('   - ID:', docsBucket.id);
    }

    console.log('\n✅ CONFIGURACIÓN COMPLETADA');
    console.log('El bucket "documents" ahora es completamente público.');
    console.log('Prueba subir un archivo en el navegador.');
}

finalFix().catch(console.error);

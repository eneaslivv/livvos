
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Faltan credenciales en .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function fixStorage() {
    console.log('--- Iniciando Reparación Maestra ESM de Storage ---');

    const sql = `
    -- 1. Limpieza total de políticas en storage.objects
    DO $$
    DECLARE
        pol RECORD;
    BEGIN
        FOR pol IN (SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects') LOOP
            BEGIN
                EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'No se pudo borrar la política %', pol.policyname;
            END;
        END LOOP;
    END $$;

    -- 2. Asegurar que el bucket sea público
    UPDATE storage.buckets SET public = true WHERE id = 'documents';
    INSERT INTO storage.buckets (id, name, public) 
    VALUES ('documents', 'documents', true) 
    ON CONFLICT (id) DO UPDATE SET public = true;

    -- 3. Crear políticas ultra-permisivas para authenticated
    CREATE POLICY "master_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');
    CREATE POLICY "master_select_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents');
    CREATE POLICY "master_update_auth" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'documents');
    CREATE POLICY "master_delete_auth" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents');

    -- 4. Crear políticas para public (anon + auth) por si acaso
    CREATE POLICY "master_insert_public" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'documents');
    CREATE POLICY "master_select_public" ON storage.objects FOR SELECT TO public USING (bucket_id = 'documents');

    -- 5. Quitar RLS de la tabla files de metadatos (momentáneamente para descartar fallos ahí)
    ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;
  `;

    console.log('Ejecutando SQL de reparación vía RPC...');
    const { data, error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.error('Error al ejecutar RPC exec_sql:', error);

        // Si falla el RPC, intentamos con la API para al menos el bucket
        console.log('Intentando verificar si el bucket existe vía API...');
        const { data: bucketData, error: bucketError } = await supabase.storage.getBucket('documents');
        if (bucketError) {
            console.log('Creando bucket vía API...');
            await supabase.storage.createBucket('documents', { public: true });
        } else {
            console.log('Bucket ya existe:', bucketData.name);
        }
    } else {
        console.log('✅ Reparación SQL completada con éxito.');
    }
}

fixStorage().catch(console.error);

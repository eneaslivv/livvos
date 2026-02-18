import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function nuclearOption() {
    console.log('🚨 OPCIÓN NUCLEAR: Deshabilitando RLS completamente en storage.objects');

    // Intentar deshabilitar RLS completamente (requiere superusuario, pero vale la pena intentar)
    const disableRLS = `
    -- Intentar deshabilitar RLS (puede fallar por permisos)
    ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
  `;

    const { error: disableError } = await supabase.rpc('exec_sql', { sql: disableRLS });

    if (disableError) {
        console.log('⚠️  No se pudo deshabilitar RLS (esperado si no eres superusuario)');
        console.log('Intentando crear una política RESTRICTIVE que permita todo...');

        // Si no podemos deshabilitar RLS, creamos una política RESTRICTIVE que permite todo
        // Las políticas RESTRICTIVE son más fuertes que las PERMISSIVE
        const nuclearPolicy = `
      DROP POLICY IF EXISTS "nuclear_allow_all" ON storage.objects;
      
      CREATE POLICY "nuclear_allow_all"
      ON storage.objects
      AS RESTRICTIVE
      FOR ALL
      TO public
      USING (true)
      WITH CHECK (true);
    `;

        const { error: policyError } = await supabase.rpc('exec_sql', { sql: nuclearPolicy });

        if (policyError) {
            console.error('❌ Error creando política nuclear:', policyError);
        } else {
            console.log('✅ Política RESTRICTIVE nuclear creada');
        }
    } else {
        console.log('✅ RLS deshabilitado exitosamente');
    }
}

nuclearOption().catch(console.error);

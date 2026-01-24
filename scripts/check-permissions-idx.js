
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkIndex() {
    const sql = `
        SELECT
            indexname,
            indexdef
        FROM
            pg_indexes
        WHERE
            schemaname = 'public'
            AND tablename = 'permissions';
    `;
    const { data: cols, error: err } = await supabase.from('permissions').select('*').limit(1);

    // Use the debug table trick to get real SQL results
    const sql2 = `
        DO $$
        BEGIN
            CREATE TABLE IF NOT EXISTS debug_indexes (name TEXT, def TEXT);
            TRUNCATE debug_indexes;
            INSERT INTO debug_indexes (name, def)
            SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'permissions';
        END
        $$;
    `;
    await supabase.rpc('exec_sql', { sql: sql2 });
    const { data } = await supabase.from('debug_indexes').select('*');
    console.log('Indexes on permissions:', data);
}

checkIndex();


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

async function checkColumns() {
    const sql = `
        DO $$
        BEGIN
            CREATE TABLE IF NOT EXISTS debug_schema_cols (table_name TEXT, column_name TEXT);
            TRUNCATE debug_schema_cols;
            INSERT INTO debug_schema_cols (table_name, column_name)
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_name IN ('profiles', 'tenants') AND table_schema = 'public';
        END
        $$;
    `;
    await supabase.rpc('exec_sql', { sql });
    const { data } = await supabase.from('debug_schema_cols').select('*');
    console.log('Schema:', data);
}

checkColumns();

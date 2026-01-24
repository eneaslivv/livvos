
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

async function inspectPermissions() {
    const { data, error } = await supabase.rpc('exec_sql', {
        sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'permissions';`
    });
    // exec_sql is void, so I need to use the debug table approach or just try a standard select
    const { data: cols, error: err } = await supabase.from('permissions').select('*').limit(1);
    if (err) {
        console.error('Error selecting from permissions:', err);
    } else if (cols && cols.length > 0) {
        console.log('Columns in permissions:', Object.keys(cols[0]));
    } else {
        console.log('No rows in permissions, trying to get columns via information_schema...');
        // Fallback to debug table
        const sql = `
            DO $$
            BEGIN
                CREATE TABLE IF NOT EXISTS debug_cols (col TEXT);
                TRUNCATE debug_cols;
                INSERT INTO debug_cols (col)
                SELECT column_name FROM information_schema.columns WHERE table_name = 'permissions';
            END
            $$;
        `;
        await supabase.rpc('exec_sql', { sql });
        const { data: debugData } = await supabase.from('debug_cols').select('*');
        console.log('Columns from debug table:', debugData);
    }
}

inspectPermissions();

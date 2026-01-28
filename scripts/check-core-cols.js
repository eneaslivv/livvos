
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

async function checkCols() {
    const tables = ['projects', 'tasks', 'documents'];
    for (const t of tables) {
        // exec_sql to get columns via information_schema
        const sql = `
            DO $$
            BEGIN
                CREATE TABLE IF NOT EXISTS debug_cols_${t} (col TEXT);
                TRUNCATE debug_cols_${t};
                INSERT INTO debug_cols_${t} (col)
                SELECT column_name FROM information_schema.columns WHERE table_name = '${t}';
            END
            $$;
        `;
        await supabase.rpc('exec_sql', { sql });
        const { data } = await supabase.from(`debug_cols_${t}`).select('col');
        const hasTenant = data.some(r => r.col === 'tenant_id');
        console.log(`Table ${t} has tenant_id: ${hasTenant}`);
        if (!hasTenant) console.log(`Columns for ${t}:`, data.map(r => r.col));
    }
}

checkCols();

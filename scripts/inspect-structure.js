
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

async function checkStructure() {
    const listTables = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public';
    `;

    // Use the debug table technique again as it's reliable for exec_sql
    const sql = `
        DO $$
        BEGIN
            CREATE TABLE IF NOT EXISTS debug_tables (name TEXT);
            TRUNCATE debug_tables;
            INSERT INTO debug_tables (name)
            SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

            CREATE TABLE IF NOT EXISTS debug_act_cols (table_name TEXT, col TEXT);
            TRUNCATE debug_act_cols;
            INSERT INTO debug_act_cols (table_name, col)
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_name IN ('activities', 'activity_logs') AND table_schema = 'public';
        END
        $$;
    `;

    await supabase.rpc('exec_sql', { sql });

    const { data: tables } = await supabase.from('debug_tables').select('*');
    console.log('Tables:', tables.map(t => t.name));

    const { data: cols } = await supabase.from('debug_act_cols').select('*');
    console.log('Activity Columns:', cols);
}

checkStructure();

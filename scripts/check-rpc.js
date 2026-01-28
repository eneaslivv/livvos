
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

async function checkRpc() {
    // We can't call is_admin() directly with service role usually as it checks auth.uid()
    // But we can check if it exists in schema
    const sql = `
        SELECT routine_name, routine_definition 
        FROM information_schema.routines 
        WHERE routine_name = 'is_admin';
    `;

    // Use debug table
    const debugSql = `
        DO $$
        BEGIN
            CREATE TABLE IF NOT EXISTS debug_rpc (name TEXT);
            TRUNCATE debug_rpc;
            INSERT INTO debug_rpc (name)
            SELECT routine_name FROM information_schema.routines WHERE routine_name = 'is_admin';
        END
        $$;
    `;

    await supabase.rpc('exec_sql', { sql: debugSql });
    const { data } = await supabase.from('debug_rpc').select('*');
    console.log('RPC is_admin exists:', data);
}

checkRpc();

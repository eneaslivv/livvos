
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

async function checkTriggers() {
    const sql = `
        SELECT event_object_table, trigger_name, action_statement 
        FROM information_schema.triggers 
        WHERE event_object_table = 'profiles';
    `;

    // Debug table approach
    const debugSql = `
        DO $$
        BEGIN
            CREATE TABLE IF NOT EXISTS debug_triggers (table_name TEXT, trigger_name TEXT, statement TEXT);
            TRUNCATE debug_triggers;
            INSERT INTO debug_triggers (table_name, trigger_name, statement)
            SELECT event_object_table, trigger_name, action_statement 
            FROM information_schema.triggers 
            WHERE event_object_table = 'profiles' 
               OR event_object_table = 'projects';
        END
        $$;
    `;

    await supabase.rpc('exec_sql', { sql: debugSql });
    const { data } = await supabase.from('debug_triggers').select('*');
    console.log('Triggers:', data);
}

checkTriggers();

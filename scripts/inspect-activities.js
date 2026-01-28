
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

async function checkActivities() {
    // Check columns
    const sql = `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'activities';
    `;

    // Check RLS policies
    const sql2 = `
        SELECT policyname, cmd, qual, with_check 
        FROM pg_policies 
        WHERE tablename = 'activities';
    `;

    // Execute via helper table since exec_sql is void
    const sqlRun = `
        DO $$
        BEGIN
            CREATE TABLE IF NOT EXISTS debug_activities_cols (col TEXT, type TEXT);
            TRUNCATE debug_activities_cols;
            INSERT INTO debug_activities_cols (col, type)
            SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'activities';

            CREATE TABLE IF NOT EXISTS debug_activities_rls (name TEXT, cmd TEXT, qual TEXT, check_qual TEXT);
            TRUNCATE debug_activities_rls;
            INSERT INTO debug_activities_rls (name, cmd, qual, check_qual)
            SELECT policyname, cmd, roles::text, qual::text FROM pg_policies WHERE tablename = 'activities';
        END
        $$;
    `;

    const { error } = await supabase.rpc('exec_sql', { sql: sqlRun });
    if (error) console.error('RPC Error:', error);

    const { data: cols } = await supabase.from('debug_activities_cols').select('*');
    console.log('Activity Table Columns:', cols);

    const { data: rls } = await supabase.from('debug_activities_rls').select('*');
    console.log('Activity RLS Policies:', rls);
}

checkActivities();

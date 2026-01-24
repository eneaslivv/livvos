
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

async function checkAuthUsers() {
    // Create a temporary table to get results since exec_sql returns void
    const sql = `
        DO $$
        DECLARE
            v_user_id UUID;
            v_profile_id UUID;
        BEGIN
            CREATE TABLE IF NOT EXISTS debug_auth_check (
                email TEXT,
                auth_id UUID,
                profile_id UUID,
                profiles_name TEXT,
                profiles_tenant UUID
            );
            TRUNCATE debug_auth_check;

            SELECT id INTO v_user_id FROM auth.users WHERE email = 'hola@livv.systems';
            SELECT id INTO v_profile_id FROM public.profiles WHERE email = 'hola@livv.systems';

            INSERT INTO debug_auth_check (email, auth_id, profile_id, profiles_name, profiles_tenant)
            SELECT 
                'hola@livv.systems',
                v_user_id,
                v_profile_id,
                (SELECT name FROM public.profiles WHERE id = v_profile_id),
                (SELECT tenant_id FROM public.profiles WHERE id = v_profile_id);
        END
        $$;
    `;

    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
        console.error('RPC Error:', error);
        return;
    }

    const { data, error: fetchError } = await supabase.from('debug_auth_check').select('*');
    if (fetchError) {
        console.error('Fetch Error:', fetchError);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

checkAuthUsers();

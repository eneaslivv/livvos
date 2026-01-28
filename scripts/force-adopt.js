
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

async function forceAdopt() {
    // 1. Get IDs safely via JS SDK
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, tenant_id')
        .eq('email', 'hola@livv.systems')
        .single();

    if (!profile) {
        console.error('Profile not found via JS check!');
        return;
    }

    console.log('Using Profile:', profile);
    const { id: USER_ID, tenant_id: TENANT_ID } = profile;

    // 2. Prepare SQL with hardcoded IDs to avoid PL/PGSQL variable issues
    const updates = [
        `UPDATE public.projects SET tenant_id = '${TENANT_ID}', owner_id = '${USER_ID}' WHERE tenant_id IS NULL OR owner_id IS NULL;`,
        `UPDATE public.tasks SET tenant_id = '${TENANT_ID}' WHERE tenant_id IS NULL;`,
        `UPDATE public.documents SET tenant_id = '${TENANT_ID}', owner_id = '${USER_ID}' WHERE tenant_id IS NULL;`,
        `UPDATE public.leads SET tenant_id = '${TENANT_ID}', owner_id = '${USER_ID}' WHERE tenant_id IS NULL;`,
        `UPDATE public.clients SET tenant_id = '${TENANT_ID}', owner_id = '${USER_ID}' WHERE tenant_id IS NULL;`,
        `UPDATE public.activity_logs SET tenant_id = '${TENANT_ID}' WHERE tenant_id IS NULL;`
    ];

    for (const sql of updates) {
        const { error } = await supabase.rpc('exec_sql', { sql });
        if (error) {
            console.error('Update Failed:', error.message);
            // If column missing, try adding it
            if (error.message.includes('column "tenant_id" does not exist')) {
                console.log('Attempting to add column...');
                // We don't know which table failed easily without parsing, but we can assume.
            }
        } else {
            console.log('Update Success');
        }
    }

    // We also need to fix empty buckets? No, created via API.
}

forceAdopt();

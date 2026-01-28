
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

async function verifyData() {
    console.log("--- DATA VERIFICATION ---");
    // 1. Get Tenant
    const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('email', 'hola@livv.systems')
        .single();

    if (!profile) { console.error("Profile missing"); return; }
    const TENANT_ID = profile.tenant_id;
    console.log("Tenant:", TENANT_ID);

    // 2. Check Projects in Tenant
    const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('tenant_id', TENANT_ID);

    if (error) console.error("Error projects:", error);
    else {
        console.log(`Projects in Tenant: ${projects.length}`);
        projects.forEach(p => console.log(`- [${p.status}] ${p.name} (Owner: ${p.owner_id})`));
    }

    // 3. Check Tasks
    const { data: tasks } = await supabase.from('tasks').select('*').eq('tenant_id', TENANT_ID);
    console.log(`Tasks in Tenant: ${tasks ? tasks.length : 0}`);

    // 4. Check Activity Logs
    const { data: acts } = await supabase.from('activity_logs').select('*').eq('tenant_id', TENANT_ID);
    console.log(`Activity Logs: ${acts ? acts.length : 0}`);
}

verifyData();


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

async function checkBuckets() {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) console.error("Error listing buckets:", error);
    else console.log("Buckets:", buckets.map(b => b.name));

    // Also check if data was fixed
    const { data: projects } = await supabase.from('projects').select('tenant_id').is('tenant_id', null);
    console.log("Orphaned Projects:", projects ? projects.length : 0);
}

checkBuckets();

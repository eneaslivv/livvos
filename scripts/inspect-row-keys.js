
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

async function checkRows() {
    const { data: p } = await supabase.from('profiles').select('*').limit(1);
    console.log('Profile Keys:', p && p.length ? Object.keys(p[0]) : 'No profiles found');

    const { data: t } = await supabase.from('tenants').select('*').limit(1);
    console.log('Tenant Keys:', t && t.length ? Object.keys(t[0]) : 'No tenants found');
}

checkRows();

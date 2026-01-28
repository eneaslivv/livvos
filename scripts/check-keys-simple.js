
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

async function checkKeys() {
    const tables = ['projects', 'tasks', 'documents'];
    for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*').limit(1);
        if (error) console.error(`Error ${t}:`, error.message);
        else {
            if (data && data.length > 0) {
                console.log(`${t} keys:`, Object.keys(data[0]));
            } else {
                console.log(`${t}: No rows found (cannot verify keys via select)`);
            }
        }
    }
}

checkKeys();

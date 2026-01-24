
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyFix() {
    const sqlPath = path.resolve(__dirname, 'schema-fix.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying SQL fix...');
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.error('Error applying SQL fix:', error);
    } else {
        console.log('SQL fix applied successfully!');
    }
}

applyFix();

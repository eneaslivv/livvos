
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

async function applyAuthFix() {
    const sqlPath = path.resolve(__dirname, 'fix-auth-rls.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying RLS Auth Fix...');
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.error('Error applying RLS fix:', error);
    } else {
        console.log('RLS Permissions updated successfully!');
    }
}

applyAuthFix();

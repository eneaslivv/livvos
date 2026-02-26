import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function run() {
    const filePath = path.join(__dirname, '../migrations/2026-02-25_user_vision.sql');
    if (!fs.existsSync(filePath)) {
        console.error('Migration file not found:', filePath);
        process.exit(1);
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log('Applying migration via exec_sql RPC...');
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
        console.error('Error applying migration:', error);
        process.exit(1);
    }
    console.log('✅ Migration applied successfully');
}

run();


import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function debug() {
    console.log("--- Checking Storage Buckets ---");
    const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
    if (storageError) console.error("Storage Error:", storageError.message);
    else console.log("Buckets:", buckets.map(b => b.name));

    console.log("\n--- Checking Tables ---");
    const checkTables = ['folders', 'files', 'documents'];
    for (const table of checkTables) {
        const { error } = await supabase.from(table).select('count', { count: 'exact', head: true });
        if (error) {
            console.log(`Table '${table}': NOT FOUND or error (${error.message})`);
        } else {
            console.log(`Table '${table}': EXISTS`);

            // If exists, check columns
            const { data: cols, error: colError } = await supabase.rpc('exec_sql', {
                sql: `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND table_schema = 'public'`
            });
            if (colError) console.log(`  Could not check columns for ${table}`);
            else console.log(`  Columns: ${cols.map(c => c.column_name).join(', ')}`);
        }
    }
}

debug();

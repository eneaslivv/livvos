import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Configure dotenv to read .env.local
dotenv.config({ path: '.env.local' });

// Get dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://azkhquxgekgfuplvwobe.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY is missing in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const LOG_FILE = path.join(__dirname, 'migration_log.txt');

// Ordered list of migrations - manually curated order
const MIGRATION_FILES = [
    // 1. Core tables & RLS (Fundamental)
    '2025-12-28_enable_rls.sql',
    '2025-12-28_create_documents_tables_final.sql',
    '2025-12-28_create_calendar_tables_final.sql',
    '2025-12-29_data_rls.sql', // Specific RLS policies for data tables

    // 2. Features / Modules
    '2026-01-16_notifications_system.sql',
    '2026-01-16_whitelabel_tenant.sql',
    '2026-01-20_create_finances_table.sql',
    '2026-01-21_cluster_management.sql',

    // 3. Security & Adjustments
    '2026-01-20_migrate_plaintext_credentials.sql',
];

function log(msg) {
    console.log(msg);
    try {
        fs.appendFileSync(LOG_FILE, msg + '\n');
    } catch (e) {
        console.error('Error writing to log file:', e);
    }
}

async function deployMigrations() {
    log(`\n🚀 Starting migration deployment at ${new Date().toISOString()}`);
    log(`Target: ${SUPABASE_URL}`);

    // Clear log file
    try {
        fs.writeFileSync(LOG_FILE, '');
    } catch (e) {
        console.error('Error clearing log file:', e);
    }
    log('📝 Logging to migration_log.txt');

    for (const filename of MIGRATION_FILES) {
        log(`\n📄 Processing: ${filename}`);
        const filePath = path.join(MIGRATIONS_DIR, filename);

        if (!fs.existsSync(filePath)) {
            log(`   ⚠️ File not found: ${filePath}, skipping...`);
            continue;
        }

        const sqlContent = fs.readFileSync(filePath, 'utf8');

        try {
            log(`   Executing via RPC 'exec_sql'...`);
            const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });

            if (error) {
                log(`   ❌ FAILED: ${filename}`);
                log(`   Error Details: ${JSON.stringify(error, null, 2)}`);
                log(`   ⚠️ Stopping deployment due to error.`);
                process.exitCode = 1;
                return; // Stop execution
            } else {
                log(`   ✅ Success: ${filename}`);
            }
        } catch (err) {
            log(`   ❌ EXCEPTION: ${filename}`);
            log(`   ${err.message}`);
            process.exitCode = 1;
            return;
        }
    }

    log('\n🏁 All migrations processed successfully!');
}

deployMigrations().catch(err => {
    log(`❌ Fatal Script Error: ${err.message}`);
    process.exitCode = 1;
});

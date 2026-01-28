
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabase = createClient(
    envConfig.VITE_SUPABASE_URL,
    envConfig.SUPABASE_SERVICE_ROLE_KEY
);

async function inspect() {
    try {
        const { data: cols, error } = await supabase.rpc('exec_sql_read', {
            sql: "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'activity_logs'"
        });

        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Columns:');
            // Manual formatting to avoid complex objects that might freak out node?
            if (Array.isArray(cols)) {
                cols.forEach(c => {
                    console.log(`${c.column_name} (${c.data_type}) nullable=${c.is_nullable}`);
                });
            } else {
                console.log('No columns found or invalid data format');
            }
        }
    } catch (e) {
        console.error('Exception:', e.message);
    }
}

inspect();

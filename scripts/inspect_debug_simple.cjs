
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
    console.log('--- TRIGGERS ---');

    // Get Triggers
    const { data: triggers, error } = await supabase.rpc('exec_sql_read', {
        sql: "SELECT trigger_name, action_statement FROM information_schema.triggers WHERE event_object_table = 'activity_logs'"
    });

    if (error) console.error(error);
    else {
        triggers.forEach(t => console.log(`TRIGGER: ${t.trigger_name} -> ${t.action_statement}`));
    }

    console.log('--- COLUMNS ---');
    const { data: cols } = await supabase.rpc('exec_sql_read', {
        sql: "SELECT column_name FROM information_schema.columns WHERE table_name = 'activity_logs'"
    });
    if (cols) {
        console.log(cols.map(c => c.column_name).join(', '));
    }
}

inspect();


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
    console.log('Inspecting activity_logs structure and triggers...');

    const sqlTriggers = `
        SELECT trigger_name, event_manipulation, action_statement
        FROM information_schema.triggers
        WHERE event_object_table = 'activity_logs'
    `;

    const { data: triggers, error: trigError } = await supabase.rpc('exec_sql_read', { sql: sqlTriggers });
    if (trigError) console.error('Error fetching triggers:', trigError);
    else console.log('TRIGGERS:', JSON.stringify(triggers, null, 2));

    const sqlColumns = `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'activity_logs'
    `;

    const { data: cols, error: colError } = await supabase.rpc('exec_sql_read', { sql: sqlColumns });
    if (colError) console.error('Error fetching columns:', colError);
    else console.log('COLUMNS:', JSON.stringify(cols, null, 2));
}

inspect();

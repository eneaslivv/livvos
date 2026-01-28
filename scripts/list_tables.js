
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

async function listTables() {
    console.log('Listing tables...');
    const { data: tables, error } = await supabase
        .from('information_schema.tables') // This might not work via client
        .select('*')
        .eq('table_schema', 'public');

    // Actually, supabase-js doesn't support querying information_schema easily directly via postgrest unless exposed.
    // Try RPC approach
    const sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'";
    const { data, error: rpcError } = await supabase.rpc('exec_sql', { sql });

    if (rpcError) console.error(rpcError);
    else console.log(data);
}

listTables();

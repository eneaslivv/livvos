
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

async function verify() {
    console.log('Verifying activity_logs content...');
    const { data, error } = await supabase.from('activity_logs').select('*');
    if (error) console.error(error);
    else console.log('Rows:', data.length, JSON.stringify(data, null, 2));
}

verify();

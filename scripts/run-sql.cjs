
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

async function runSql() {
    const filename = process.argv[2];
    if (!filename) {
        console.error('Please provide a SQL filename correctly.');
        process.exit(1);
    }
    const sqlPath = path.resolve(process.cwd(), filename);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`Executing SQL from ${filename}...`);
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.error('Error executing SQL:', error);
    } else {
        console.log('SQL executed successfully!');
    }
}

runSql();

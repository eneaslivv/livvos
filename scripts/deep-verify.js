
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkState() {
    console.log('--- Deep Verification ---');

    // 1. Get User by Email
    const { data: users, error: userError } = await supabase.from('profiles').select('*').eq('email', 'hola@livv.systems');
    console.log('Profiles for hola@livv.systems:', JSON.stringify(users, null, 2));

    if (users && users.length > 0) {
        const user = users[0];
        // 2. Check Roles
        const { data: roles, error: rolesError } = await supabase
            .from('user_roles')
            .select('role_id, roles(name)')
            .eq('user_id', user.id);
        console.log('User Roles:', JSON.stringify(roles, null, 2));

        // 3. Check Tenant
        if (user.tenant_id) {
            const { data: tenant } = await supabase.from('tenants').select('*').eq('id', user.tenant_id).single();
            console.log('Assigned Tenant:', JSON.stringify(tenant, null, 2));
        } else {
            console.log('❌ User has NO tenant_id');
        }
    } else {
        console.log('❌ No profile found for hola@livv.systems');
    }
}

checkState();

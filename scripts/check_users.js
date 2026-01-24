
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Manual config since dotenv might not pick up .env.local automatically in ES modules without path
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables!');
    console.log('VITE_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Set' : 'Missing');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUsers() {
    console.log('🔍 Checking for existing users...');

    // 1. Check Profiles (public table)
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, status')
        .limit(10);

    if (profilesError) {
        if (profilesError.code === 'PGRST116') {
            console.log('No profiles found (PGRST116).');
        } else {
            console.error('❌ Error fetching profiles:', profilesError.message);
        }
    } else {
        console.log('\n📄 Profiles found:', profiles.length);
        if (profiles.length > 0) {
            console.table(profiles);
        } else {
            console.log('No profiles found in public.profiles table.');
        }
    }

    // 2. Check Auth Users (requires service role, admin API)
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
        console.error('❌ Error fetching auth users:', authError.message);
    } else {
        console.log('\n🔐 Auth Users found:', users.length);
        if (users.length > 0) {
            const simplifiedUsers = users.map(u => ({
                id: u.id,
                email: u.email,
                last_sign_in: u.last_sign_in_at,
                created_at: u.created_at
            }));
            console.table(simplifiedUsers);
        } else {
            console.log('No auth users found in auth schema.');
        }
    }
}

checkUsers();

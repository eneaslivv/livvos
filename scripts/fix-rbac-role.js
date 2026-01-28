
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

async function fixRole() {
    console.log("--- FIXING USER ROLE ---");

    // 1. Get User
    const { data: user } = await supabase.from('profiles').select('id, name').eq('email', 'hola@livv.systems').single();
    if (!user) { console.error("User not found"); return; }
    console.log("User:", user.name, user.id);

    // 2. Get Owner Role
    let { data: role } = await supabase.from('roles').select('id').eq('name', 'owner').single();
    if (!role) {
        // Try 'Owner' capitalized
        const { data: roleCap } = await supabase.from('roles').select('id').eq('name', 'Owner').single();
        role = roleCap;
    }

    if (!role) {
        console.error("Owner role NOT found in DB. Creating it...");
        // Fallback: Create Owner Role if missing (should exist though)
        const { data: newRole, error } = await supabase.from('roles').insert({
            name: 'owner',
            description: 'System Owner',
            is_system: true
        }).select().single();
        if (error) { console.error("Create role error:", error); return; }
        role = newRole;
    }
    console.log("Owner Role ID:", role.id);

    // 3. Check Assignment
    const { data: existing } = await supabase.from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('role_id', role.id);

    if (existing && existing.length > 0) {
        console.log("User already has Owner role.");
    } else {
        console.log("Assigning Owner role...");
        const { error: assignErr } = await supabase.from('user_roles').insert({
            user_id: user.id,
            role_id: role.id
        });
        if (assignErr) console.error("Assignment failed:", assignErr);
        else console.log("SUCCESS: User is now Owner.");
    }
}

fixRole();

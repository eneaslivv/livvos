
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

async function testInsert() {
    // 1. Get User
    const { data: user } = await supabase.from('profiles').select('id, tenant_id').eq('email', 'hola@livv.systems').single();
    if (!user) { console.error("User not found"); return; }
    console.log("User found:", user.id);
    console.log("Tenant:", user.tenant_id);

    // 2. Simulate Insert via RPC/SQL
    // We construct a query that impersonates the user
    const sql = `

        DO $$
        DECLARE
            v_user_id uuid := '${user.id}';
            v_tenant_id uuid := '${user.tenant_id}';
        BEGIN
            -- TEST 1: Admin Insert (Should work always)
            BEGIN
                INSERT INTO public.activity_logs (
                    user_id, tenant_id, action, target, entity_type, type, details, metadata
                ) VALUES (
                    v_user_id, v_tenant_id, 'admin_check', 'debug', 'system', 'system', '{"content": "Admin Access Check"}', '{"source": "script"}'
                );
                RAISE NOTICE 'Admin Insert Success';
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Admin Insert Failed: %', SQLERRM;
                RAISE; -- Re-raise to fail script if admin fails
            END;

            -- TEST 2: User Impersonation
            BEGIN
                -- Set current user for RLS
                PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
                PERFORM set_config('role', 'authenticated', true);

                -- Try Insert
                INSERT INTO public.activity_logs (
                    user_id, tenant_id, action, target, entity_type, type, details, metadata
                ) VALUES (
                    v_user_id, v_tenant_id, 'test_post', 'debug', 'system', 'comment', '{"content": "RLS Test"}', '{"source": "script"}'
                );
                RAISE NOTICE 'User Insert Success';
            END;
        END $$;
    `;

    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.error("posting FAILED (RLS Error likely):", error);
    } else {
        console.log("posting SUCCEEDED! RLS is fine.");
    }
}

testInsert();

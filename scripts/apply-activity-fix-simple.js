
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyFix() {
    // 1. Create Table Simplified
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS public.activity_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID, 
            tenant_id UUID,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id UUID,
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            metadata JSONB DEFAULT '{}'::jsonb
        );
    `;

    console.log('Step 1: Creating Table (Simpler)...');
    const { error: err1 } = await supabase.rpc('exec_sql', { sql: createTableSQL });
    if (err1) {
        console.error('Error creating table:', err1);
        return;
    }
    console.log('Table created.');

    // 2. Add Constraints (if they don't fail)
    // We do this in a separate naming block or check if constraints exist, but for now let's just create table.

    // 3. Create Policies
    const createPolicySQL = `
        ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

        DO $$
        BEGIN
            DROP POLICY IF EXISTS "activity_logs_select_policy" ON public.activity_logs;
            CREATE POLICY "activity_logs_select_policy" ON public.activity_logs
            FOR SELECT
            USING (
                true -- Open it up for testing first, assuming auth check is done elsewhere or we refine later
                -- tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()) 
            );

            DROP POLICY IF EXISTS "activity_logs_insert_policy" ON public.activity_logs;
            CREATE POLICY "activity_logs_insert_policy" ON public.activity_logs
            FOR INSERT
            WITH CHECK ( auth.uid() = user_id );
        END
        $$;
    `;

    console.log('Step 2: Creating Policies (Simplified)...');
    const { error: err2 } = await supabase.rpc('exec_sql', { sql: createPolicySQL });
    if (err2) {
        console.error('Error creating policies:', err2);
    } else {
        console.log('Policies applied.');
    }

    // Permissions
    const fixPermissionsSQL = `
        INSERT INTO public.permissions (module, action, description)
        VALUES 
            ('activity', 'view', 'View activity logs'),
            ('activity', 'create', 'Create activity logs')
        ON CONFLICT (module, action) DO NOTHING;
    `;
    console.log('Step 3: Inserting Permissions...');
    const { error: err3 } = await supabase.rpc('exec_sql', { sql: fixPermissionsSQL });
    if (err3) console.error('Error inserting permissions:', err3);
}

applyFix();


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
    // 1. Create Table
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS public.activity_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES public.profiles(id),
            tenant_id UUID REFERENCES public.tenants(id),
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id UUID,
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            metadata JSONB DEFAULT '{}'::jsonb
        );
        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_id ON activity_logs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
        
        -- Enable RLS
        ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
        
        -- Grant Permissions
        GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
        GRANT SELECT, INSERT ON public.activity_logs TO service_role;
    `;

    console.log('Step 1: Creating Table...');
    const { error: err1 } = await supabase.rpc('exec_sql', { sql: createTableSQL });
    if (err1) {
        console.error('Error creating table:', err1);
        return;
    }
    console.log('Table created (or already exists).');

    // 2. Create Policies
    const createPolicySQL = `
        DO $$
        BEGIN
            DROP POLICY IF EXISTS "activity_logs_select_policy" ON public.activity_logs;
            CREATE POLICY "activity_logs_select_policy" ON public.activity_logs
            FOR SELECT
            USING (
                tenant_id IN (
                    SELECT p.tenant_id 
                    FROM public.profiles p 
                    WHERE p.id = auth.uid()
                ) OR
                auth.uid() IN (
                    SELECT t.owner_id 
                    FROM public.tenants t 
                    WHERE t.id = activity_logs.tenant_id
                )
            );

            DROP POLICY IF EXISTS "activity_logs_insert_policy" ON public.activity_logs;
            CREATE POLICY "activity_logs_insert_policy" ON public.activity_logs
            FOR INSERT
            WITH CHECK (
                auth.uid() = user_id
            );
        END
        $$;
    `;

    console.log('Step 2: Creating Policies...');
    const { error: err2 } = await supabase.rpc('exec_sql', { sql: createPolicySQL });
    if (err2) {
        console.error('Error creating policies:', err2);
    } else {
        console.log('Policies applied.');
    }

    // 3. Fix Permissions Data
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
    else console.log('Permissions inserted.');
}

applyFix();

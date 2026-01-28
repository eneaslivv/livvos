
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

async function runStep(name, sql) {
    console.log(`Step ${name}...`);
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
        console.error(`Error in ${name}:`, error.message);
        return false;
    }
    console.log(`Success ${name}`);
    return true;
}

async function applyFix() {
    // 1. Schema Fixes
    const schemaSQL = `
        DO $$ 
        BEGIN
            -- Projects
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'tenant_id') THEN
                ALTER TABLE public.projects ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'owner_id') THEN
                ALTER TABLE public.projects ADD COLUMN owner_id UUID REFERENCES public.profiles(id);
            END IF;
            -- Tasks
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'tenant_id') THEN
                ALTER TABLE public.tasks ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
            END IF;
            -- Documents
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'tenant_id') THEN
                ALTER TABLE public.documents ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
            END IF;
            -- Leads, Clients included
        END $$;
    `;
    if (!await runStep('Schema', schemaSQL)) return;

    // 2. Get IDs (Check Profile)
    // We can't return value easily via exec_sql to JS, but strictly purely SQL update is fine.
    // If getting IDs fails, we'll know.
    const checkProfileSQL = `
        DO $$
        DECLARE
            v_tenant UUID;
        BEGIN
            SELECT tenant_id INTO v_tenant FROM public.profiles WHERE email = 'hola@livv.systems';
            IF v_tenant IS NULL THEN RAISE EXCEPTION 'No Tenant Found'; END IF;
        END $$;
    `;
    if (!await runStep('Check Profile', checkProfileSQL)) return;

    // 3. Update Projects
    const updateProjects = `
        UPDATE public.projects 
        SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE email='hola@livv.systems'),
            owner_id = (SELECT id FROM public.profiles WHERE email='hola@livv.systems')
        WHERE tenant_id IS NULL OR owner_id IS NULL;
    `;
    if (!await runStep('Update Projects', updateProjects)) return;

    // 4. Update Tasks
    const updateTasks = `
        UPDATE public.tasks 
        SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE email='hola@livv.systems')
        WHERE tenant_id IS NULL;
    `;
    if (!await runStep('Update Tasks', updateTasks)) return;

    // 5. Update Documents
    const updateDocs = `
        UPDATE public.documents 
        SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE email='hola@livv.systems'),
            owner_id = (SELECT id FROM public.profiles WHERE email='hola@livv.systems')
        WHERE tenant_id IS NULL;
    `;
    if (!await runStep('Update Documents', updateDocs)) return;

    // 6. Update Leads
    const updateLeads = `
        UPDATE public.leads
        SET tenant_id = (SELECT tenant_id FROM public.profiles WHERE email='hola@livv.systems'),
            owner_id = (SELECT id FROM public.profiles WHERE email='hola@livv.systems')
        WHERE tenant_id IS NULL;
    `;
    if (!await runStep('Update Leads', updateLeads)) return;
}

applyFix();

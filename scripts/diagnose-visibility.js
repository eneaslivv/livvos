
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

async function diagnose() {
    console.log("--- DIAGNOSING DATA VISIBILITY ---");

    // 1. Get User and Tenant
    const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('id, email, tenant_id, name')
        .eq('email', 'hola@livv.systems')
        .single();

    if (pErr) {
        console.error("Profile not found:", pErr);
        return;
    }
    console.log("User:", profile.name, "ID:", profile.id);
    console.log("Target Tenant ID:", profile.tenant_id);

    if (!profile.tenant_id) {
        console.error("CRITICAL: User has NO tenant_id!");
        // return; // Continue to see what data exists anyway
    }

    // 2. Check Projects
    console.log("\n[PROJECTS]");
    const { data: projects, error: prjErr } = await supabase
        .from('projects')
        .select('id, name, tenant_id, owner_id, status');

    if (prjErr) console.error("Error fetching projects:", prjErr);
    else {
        const myProjects = projects.filter(p => p.tenant_id === profile.tenant_id);
        console.log(`Total Projects: ${projects.length}`);
        console.log(`Projects in Tenant ${profile.tenant_id}: ${myProjects.length}`);
        if (projects.length > 0 && myProjects.length === 0) {
            console.warn("WARNING: Projects exist but none match user's tenant!");
            console.log("Sample Project Tenant:", projects[0].tenant_id);
        }
        projects.forEach(p => console.log(`- ${p.name} (T: ${p.tenant_id}, Owner: ${p.owner_id})`));
    }

    // 3. Check Tasks
    console.log("\n[TASKS]");
    const { data: tasks, error: tskErr } = await supabase
        .from('tasks')
        .select('id, title, tenant_id, project_id, created_by');

    if (tskErr) console.error("Error fetching tasks:", tskErr);
    else {
        const myTasks = tasks.filter(t => t.tenant_id === profile.tenant_id);
        console.log(`Total Tasks: ${tasks.length}`);
        console.log(`Tasks in Tenant: ${myTasks.length}`);
        if (tasks.length > 0 && myTasks.length === 0) {
            console.warn("WARNING: Tasks exist but none match user's tenant!");
        }
    }

    // 4. Check Documents and Storage
    console.log("\n[DOCUMENTS]");
    const { data: docs, error: docErr } = await supabase
        .from('documents')
        .select('id, name, tenant_id');

    if (docErr) console.error("Error fetching documents table:", docErr);
    else {
        console.log(`Total Documents Metadata: ${docs.length}`);
        docs.forEach(d => console.log(`- ${d.name} (T: ${d.tenant_id})`));
    }

    // Check Buckets
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
    if (bErr) console.error("Error listing buckets:", bErr);
    else {
        console.log("Storage Buckets:", buckets.map(b => b.name));
    }
}

diagnose();

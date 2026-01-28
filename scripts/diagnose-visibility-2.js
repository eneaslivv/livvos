
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
    console.log("--- DIAGNOSING DATA VISIBILITY (RETRY) ---");

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', 'hola@livv.systems')
        .single();

    if (!profile) return;
    console.log("User:", profile.name, "Tenant:", profile.tenant_id);

    // Projects
    const { data: projects, error: prjErr } = await supabase.from('projects').select('*');
    if (prjErr) console.error("Projects Error:", prjErr.message);
    else {
        const myProjects = projects.filter(p => p.tenant_id === profile.tenant_id);
        console.log(`Projects: Total ${projects.length}, Tenant ${myProjects.length}`);
        if (projects.length > 0 && myProjects.length === 0) {
            console.log("User Tenant:", profile.tenant_id);
            console.log("Project 0 Tenant:", projects[0].tenant_id);
        }
    }

    // Tasks
    const { data: tasks, error: tskErr } = await supabase.from('tasks').select('*');
    if (tskErr) console.error("Tasks Error:", tskErr.message);
    else {
        const myTasks = tasks.filter(t => t.tenant_id === profile.tenant_id);
        console.log(`Tasks: Total ${tasks.length}, Tenant ${myTasks.length}`);
    }

    // Documents
    const { data: docs, error: docErr } = await supabase.from('documents').select('*');
    if (docErr) console.error("Documents Error:", docErr.message);
    else {
        console.log(`Documents Metadata: ${docs.length}`);
        if (docs.length > 0) console.log("Doc keys:", Object.keys(docs[0]));
    }

    // Buckets
    const { data: buckets } = await supabase.storage.listBuckets();
    console.log("Buckets:", buckets ? buckets.map(b => b.name) : 'None');
}

diagnose();

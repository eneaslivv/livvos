
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

async function createBuckets() {
    const buckets = ['documents', 'avatars'];

    for (const name of buckets) {
        console.log(`Creating bucket: ${name}...`);
        const { data, error } = await supabase.storage.createBucket(name, {
            public: false, // documents private
            allowedMimeTypes: null, // Allow all
            fileSizeLimit: 52428800 // 50MB
        });

        if (error) {
            console.error(`Error creating ${name}:`, error.message);
        } else {
            console.log(`Created ${name}`);
        }
    }
}

createBuckets();

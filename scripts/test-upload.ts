
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

async function testUpload() {
    console.log("Testing upload to 'documents' bucket...");
    const content = "test content " + Date.now();
    const fileName = `test_${Date.now()}.txt`;

    const { data, error } = await supabase.storage.from('documents').upload(fileName, content, {
        contentType: 'text/plain'
    });

    if (error) {
        console.error("Upload Error:", error);
    } else {
        console.log("Upload Success:", data);

        // Try to insert into files table
        const { data: fileData, error: dbError } = await supabase.from('files').insert({
            name: fileName,
            type: 'text/plain',
            size: content.length,
            url: SUPABASE_URL + "/storage/v1/object/public/documents/" + fileName,
            owner_id: '16111000-0000-0000-0000-000000000000' // dummy but valid uuid format
        }).select();

        if (dbError) console.error("Database Insert Error:", dbError);
        else console.log("Database Insert Success:", fileData);
    }
}

testUpload();

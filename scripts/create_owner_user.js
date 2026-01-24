
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables!');
    process.exit(1);
}

// Service role client needed for admin actions
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const EMAIL = 'hola@livv.systems';
const PASSWORD = 'test123';
const NAME = 'Eneas (Owner)';

async function createOwnerUser() {
    console.log(`🚀 Creating owner user: ${EMAIL}...`);

    try {
        // 0. Reload Schema Cache (Fix for "Could not find table in schema cache")
        console.log('🔄 Reloading PostgREST schema cache...');
        try {
            await supabase.rpc('exec_sql', { sql: "NOTIFY pgrst, 'reload';" });
            // Wait a bit for the reload to propagate
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('✅ Schema cache reload signal sent.');
        } catch (reloadError) {
            console.warn('⚠️ Could not reload schema cache (RPC might be missing), continuing...', reloadError.message);
        }

        // 1. Create or Get Auth User
        let userId;
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

        if (listError) throw listError;

        const existingUser = users.find(u => u.email === EMAIL);

        if (existingUser) {
            console.log('👤 User already exists, updating password...');
            const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
                existingUser.id,
                { password: PASSWORD, user_metadata: { full_name: NAME }, app_metadata: { provider: 'email', providers: ['email'] } }
            );
            if (updateError) throw updateError;
            userId = existingUser.id;
            console.log('✅ Password updated.');
        } else {
            console.log('👤 Creating new user...');
            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email: EMAIL,
                password: PASSWORD,
                email_confirm: true,
                user_metadata: { full_name: NAME }
            });
            if (createError) throw createError;
            userId = newUser.user.id;
            console.log('✅ User created.');
        }

        // 2. Ensure Tenant Exists
        console.log('🏢 Ensuring valid Tenant...');
        // Check if there's any tenant, if not create one.
        // Ideally we want a specific one for this owner.
        let tenantId;

        // Check if user already has a profile with a tenant
        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', userId).single();

        if (profile?.tenant_id) {
            tenantId = profile.tenant_id;
            console.log(`✅ User already linked to tenant: ${tenantId}`);
        } else {
            // Create new tenant
            const { data: newTenant, error: tenantError } = await supabase
                .from('tenants')
                .insert({
                    name: 'Livv Systems HQ',
                    slug: 'livv-systems', // Ensure unique slug
                    owner_id: userId,
                    status: 'active'
                })
                .select()
                .single();

            if (tenantError) {
                // If slug exists, try to fetch it
                if (tenantError.code === '23505') { // Unique violation
                    const { data: existingTenant } = await supabase.from('tenants').select('id').eq('slug', 'livv-systems').single();
                    if (existingTenant) {
                        tenantId = existingTenant.id;
                        console.log(`✅ Found existing tenant: ${tenantId}`);
                    } else {
                        throw tenantError;
                    }
                } else {
                    console.error('❌ Error creating tenant:', JSON.stringify(tenantError, null, 2));
                    throw tenantError;
                }
            } else {
                tenantId = newTenant.id;
                console.log(`✅ Created new tenant: ${tenantId}`);

                // Create tenant config
                await supabase.from('tenant_config').insert({
                    tenant_id: tenantId,
                    features: {
                        sales_module: true,
                        team_management: true,
                        notifications: true,
                        analytics: true
                    },
                    resource_limits: {
                        max_users: 100,
                        max_projects: 1000,
                        max_storage_mb: 10000,
                        max_api_calls_per_month: 200000 // Increased for owner
                    }
                });
            }
        }

        // 3. Ensure Profile Exists & is Linked
        console.log('👤 Updating Profile...');
        const { error: profileUpsertError } = await supabase
            .from('profiles')
            .upsert({
                id: userId,
                email: EMAIL,
                full_name: NAME,
                tenant_id: tenantId,
                status: 'active',
                updated_at: new Date().toISOString()
            });

        if (profileUpsertError) throw profileUpsertError;
        console.log('✅ Profile updated.');

        // 4. Assign Owner Role
        console.log('👑 Assigning Owner Role...');

        // Get Owner Role ID
        const { data: roleData, error: roleError } = await supabase
            .from('roles')
            .select('id')
            .ilike('name', 'owner')
            .single();

        if (roleError) throw new Error(`Could not find 'owner' role: ${roleError.message}`);

        const roleId = roleData.id;

        // Assign role
        const { error: assignError } = await supabase
            .from('user_roles')
            .upsert({
                user_id: userId,
                role_id: roleId
            }, { onConflict: 'user_id, role_id' });

        if (assignError) throw assignError;
        console.log('✅ Owner role assigned.');

        console.log('\n🎉 Success! You can now log in with:');
        console.log(`Email: ${EMAIL}`);
        console.log(`Password: ${PASSWORD}`);

    } catch (err) {
        console.error('❌ Error creating owner user:', err);
    }
}

createOwnerUser();

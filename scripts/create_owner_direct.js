import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const EMAIL = 'hola@livv.systems';
const PASSWORD = 'test123';
const NAME = 'Eneas (Owner)';

async function createOwnerDirect() {
    console.log(`🚀 Creating owner user: ${EMAIL}...`);

    try {
        // 1. Create Auth User
        console.log('👤 Creating auth user...');
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: EMAIL,
            password: PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: NAME }
        });

        if (authError) {
            if (authError.message.includes('already registered')) {
                console.log('⚠️  User already exists, updating password...');
                const { data: { users } } = await supabase.auth.admin.listUsers();
                const existingUser = users.find(u => u.email === EMAIL);

                if (existingUser) {
                    await supabase.auth.admin.updateUserById(existingUser.id, {
                        password: PASSWORD,
                        user_metadata: { full_name: NAME }
                    });
                    console.log('✅ Password updated for existing user');

                    // Use existing user ID
                    const userId = existingUser.id;

                    // Now create tenant and profile via SQL
                    await setupTenantAndProfile(userId);
                    return;
                }
            }
            throw authError;
        }

        const userId = authData.user.id;
        console.log(`✅ Auth user created: ${userId}`);

        // 2. Setup tenant and profile via SQL
        await setupTenantAndProfile(userId);

    } catch (err) {
        console.error('❌ Error:', err.message || err);
    }
}

async function setupTenantAndProfile(userId) {
    console.log('🏢 Setting up tenant and profile via SQL...');

    const setupSQL = `
    DO $$
    DECLARE
      v_tenant_id UUID;
      v_role_id UUID;
    BEGIN
      -- 1. Create or get tenant
      INSERT INTO tenants (name, slug, owner_id, status, created_at, updated_at)
      VALUES ('Livv Systems HQ', 'livv-systems', '${userId}', 'active', NOW(), NOW())
      ON CONFLICT (slug) DO UPDATE SET owner_id = '${userId}'
      RETURNING id INTO v_tenant_id;
      
      -- If no tenant was returned (conflict), fetch it
      IF v_tenant_id IS NULL THEN
        SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'livv-systems';
      END IF;
      
      RAISE NOTICE 'Tenant ID: %', v_tenant_id;
      
      -- 2. Create tenant config if not exists
      INSERT INTO tenant_config (tenant_id, features, resource_limits, security_settings, integrations)
      VALUES (
        v_tenant_id,
        '{"sales_module": true, "team_management": true, "notifications": true, "analytics": true}'::jsonb,
        '{"max_users": 100, "max_projects": 1000, "max_storage_mb": 10000, "max_api_calls_per_month": 200000}'::jsonb,
        '{"require_2fa": false, "session_timeout_minutes": 480, "password_min_length": 8, "allow_public_sharing": false}'::jsonb,
        '{"email_provider": null, "calendar_provider": null, "payment_processor": null, "ai_service": null}'::jsonb
      )
      ON CONFLICT (tenant_id) DO NOTHING;
      
      -- 3. Create or update profile
      INSERT INTO profiles (id, email, full_name, tenant_id, status, created_at, updated_at)
      VALUES ('${userId}', '${EMAIL}', '${NAME}', v_tenant_id, 'active', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE 
      SET tenant_id = v_tenant_id, full_name = '${NAME}', status = 'active', updated_at = NOW();
      
      -- 4. Get owner role ID
      SELECT id INTO v_role_id FROM roles WHERE LOWER(name) = 'owner' LIMIT 1;
      
      IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Owner role not found in database';
      END IF;
      
      RAISE NOTICE 'Owner Role ID: %', v_role_id;
      
      -- 5. Assign owner role
      INSERT INTO user_roles (user_id, role_id, created_at)
      VALUES ('${userId}', v_role_id, NOW())
      ON CONFLICT (user_id, role_id) DO NOTHING;
      
      RAISE NOTICE 'Owner user setup complete!';
    END $$;
  `;

    const { error } = await supabase.rpc('exec_sql', { sql: setupSQL });

    if (error) {
        console.error('❌ SQL Error:', error);
        throw error;
    }

    console.log('✅ Tenant, profile, and role assigned successfully!');
    console.log('\n🎉 Success! You can now log in with:');
    console.log(`Email: ${EMAIL}`);
    console.log(`Password: ${PASSWORD}`);
}

createOwnerDirect();

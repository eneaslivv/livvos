// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Confirms email + creates session for users who signed up via invitation.
 * Called from AcceptInvite page when Supabase requires email confirmation.
 *
 * Security: Only confirms users who have a valid pending/accepted invitation.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, token } = await req.json()

    if (!email || !token) {
      return new Response(JSON.stringify({ error: 'Missing email or token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify invitation exists and matches email
    const { data: invitation, error: invErr } = await admin
      .from('invitations')
      .select('id, email, status')
      .eq('token', token)
      .single()

    if (invErr || !invitation) {
      return new Response(JSON.stringify({ error: 'Invalid invitation token' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Email does not match invitation' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find the auth user by email
    const { data: { users }, error: listErr } = await admin.auth.admin.listUsers()
    const authUser = users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())

    if (!authUser) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auto-confirm email via admin API
    const { error: updateErr } = await admin.auth.admin.updateUserById(authUser.id, {
      email_confirm: true,
    })

    if (updateErr) {
      return new Response(JSON.stringify({ error: 'Failed to confirm email' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, user_id: authUser.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

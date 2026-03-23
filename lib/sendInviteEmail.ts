interface SendInviteEmailParams {
  clientName: string
  clientEmail: string
  inviteLink: string
  tenantName?: string
  inviteType?: 'team' | 'client'
  logoUrl?: string
  tenantId?: string
}

export const sendInviteEmail = async (params: SendInviteEmailParams): Promise<{ ok: boolean; message_id?: string }> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  // Use anon key for both Authorization and apikey — this function
  // doesn't need user auth, it just sends an email via Resend.
  const res = await fetch(`${supabaseUrl}/functions/v1/send-invite-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({
      client_name: params.clientName,
      client_email: params.clientEmail,
      invite_link: params.inviteLink,
      tenant_name: params.tenantName,
      invite_type: params.inviteType || 'team',
      logo_url: params.logoUrl,
      tenant_id: params.tenantId,
    }),
  })

  const data = await res.json()

  if (!res.ok || data.error) {
    throw new Error(data.error || `Email send failed (${res.status})`)
  }

  return data
}

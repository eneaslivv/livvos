import { supabase } from './supabase'

interface SendInviteEmailParams {
  clientName: string
  clientEmail: string
  inviteLink: string
  tenantName?: string
}

export const sendInviteEmail = async (params: SendInviteEmailParams): Promise<{ ok: boolean; message_id?: string }> => {
  const { data, error } = await supabase.functions.invoke('send-invite-email', {
    body: {
      client_name: params.clientName,
      client_email: params.clientEmail,
      invite_link: params.inviteLink,
      tenant_name: params.tenantName,
    },
  })

  if (error) throw new Error(`Email send failed: ${error.message}`)
  if (data?.error) throw new Error(data.error)

  return data
}

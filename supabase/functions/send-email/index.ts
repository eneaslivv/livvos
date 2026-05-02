// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { emailCorsHeaders, resolveTenantBranding, wrapEmailHtml, buildWeeklyDigestTeamEmail } from '../_shared/emailTemplate.ts'

interface EmailData {
  recipient_name?: string
  title: string
  message: string
  cta_url?: string
  cta_text?: string
}

const templateConfig: Record<string, { accent: string; icon: string }> = {
  task_assigned:      { accent: '#3b82f6', icon: '&#128203;' },
  task_completed:     { accent: '#10b981', icon: '&#9989;' },
  deadline_reminder:  { accent: '#f59e0b', icon: '&#9200;' },
  task_overdue:       { accent: '#ef4444', icon: '&#128308;' },
  project_update:     { accent: '#8b5cf6', icon: '&#128640;' },
  system_alert:       { accent: '#ef4444', icon: '&#128680;' },
  role_changed:       { accent: '#8b5cf6', icon: '&#128100;' },
  member_suspended:   { accent: '#f59e0b', icon: '&#9888;' },
  member_activated:   { accent: '#10b981', icon: '&#9989;' },
  member_removed:     { accent: '#ef4444', icon: '&#128683;' },
  team_invite:        { accent: '#3b82f6', icon: '&#128231;' },
  welcome:            { accent: '#10b981', icon: '&#128075;' },
  daily_schedule:     { accent: '#3b82f6', icon: '&#128197;' },
  weekly_digest:      { accent: '#8b5cf6', icon: '&#128202;' },
}

function buildWelcomeSection(): string {
  const features = [
    { icon: '&#128188;', label: 'Projects & Tasks', desc: 'Manage projects, assign tasks, track deadlines' },
    { icon: '&#128197;', label: 'Calendar & Events', desc: 'Schedule meetings, set reminders, plan your week' },
    { icon: '&#128176;', label: 'Finance', desc: 'Track income, expenses, and client payments' },
    { icon: '&#128101;', label: 'Team', desc: 'Collaborate with your team in real time' },
  ]

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr><td style="padding-bottom:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:#78736A;">Everything you need</td></tr>
      ${features.map(f => `
        <tr>
          <td style="padding:10px 16px;background-color:#fafaf8;border-radius:8px;border-left:3px solid #10b981;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
              <td width="32" valign="top" style="font-size:20px;padding-right:12px;">${f.icon}</td>
              <td>
                <div style="font-size:13px;font-weight:600;color:#18181b;margin-bottom:2px;">${f.label}</div>
                <div style="font-size:12px;color:#78736A;line-height:1.4;">${f.desc}</div>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:6px;"></td></tr>`).join('')}
    </table>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: emailCorsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Missing RESEND_API_KEY' }), {
        status: 500,
        headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { template, to, subject, brand_name, logo_url, tenant_id, data } = await req.json()

    if (!to || !subject || !data?.title) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, data.title' }),
        { status: 400, headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Authenticate the caller and verify they actually belong to the
    // tenant_id they claim. Without this check any signed-in user could
    // pass a different tenant_id and send emails using that org's branding,
    // impersonating them.
    const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let verifiedTenantId: string | null = null
    if (tenant_id) {
      const authHeader = req.headers.get('Authorization')
      const token = authHeader?.replace('Bearer ', '')
      if (!token) {
        return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
          status: 401, headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: { user }, error: authErr } = await sbAdmin.auth.getUser(token)
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // Allow tenant_id IF (a) it matches the caller's profile.tenant_id, OR
      // (b) the caller is a member of that tenant. Either is sufficient — a
      // super agency owner who's a member of multiple tenants can send mail
      // branded as any tenant they belong to.
      const { data: profile } = await sbAdmin
        .from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
      let allowed = profile?.tenant_id === tenant_id
      if (!allowed) {
        const { data: membership } = await sbAdmin
          .from('tenant_members').select('tenant_id').eq('user_id', user.id).eq('tenant_id', tenant_id).maybeSingle()
        allowed = !!membership
      }
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'You do not belong to that tenant' }), {
          status: 403, headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
        })
      }
      verifiedTenantId = tenant_id
    }

    // Resolve branding: prefer DB lookup, fallback to params
    let resolvedLogo: string | null = logo_url || null
    let brandName = brand_name || 'LIVV OS'

    if (verifiedTenantId) {
      const branding = await resolveTenantBranding(sbAdmin, verifiedTenantId)
      if (branding.logoUrl) resolvedLogo = branding.logoUrl
      if (!brand_name) brandName = branding.name
    }

    const config = templateConfig[template] || templateConfig.system_alert
    const firstName = (data as EmailData).recipient_name?.split(' ')[0] || ''
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,'

    // Rich-template branch — when the caller passes structured arrays for the
    // deadline templates, render the wine-hero "weekly digest" layout instead
    // of the generic plain-text shell. This is what the in-app
    // NotificationsContext now uses so the daily reminder doesn't render as
    // a flat paragraph.
    const richDeadline = (template === 'task_overdue' || template === 'deadline_reminder' || template === 'daily_schedule')
      && (Array.isArray((data as any)?.overdue_tasks) || Array.isArray((data as any)?.due_today_tasks) || Array.isArray((data as any)?.today_events))

    let htmlBody: string
    if (richDeadline) {
      const overdueItems = (((data as any).overdue_tasks || []) as any[])
      const dueTodayItems = (((data as any).due_today_tasks || []) as any[])
      const eventItems = (((data as any).today_events || []) as any[])
      const totalOverdue = overdueItems.length
      const totalDueToday = dueTodayItems.length
      const totalEvents = eventItems.length
      const headlineParts: string[] = []
      if (totalOverdue > 0) headlineParts.push(`${totalOverdue} overdue`)
      if (totalDueToday > 0) headlineParts.push(`${totalDueToday} due today`)
      if (totalEvents > 0) headlineParts.push(`${totalEvents} event${totalEvents === 1 ? '' : 's'}`)
      const headline = firstName
        ? `${firstName}, ${headlineParts.length ? headlineParts.join(', ') + '.' : 'your day is clear.'}`
        : (headlineParts.length ? headlineParts.join(', ') + '.' : 'Your day is clear.')

      const todayIso = new Date().toISOString().slice(0, 10)
      const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

      htmlBody = buildWeeklyDigestTeamEmail({
        brandName,
        logoUrl: resolvedLogo,
        weekLabel: dateLabel,
        digestNumber: 'DAILY',
        headline,
        intro: 'Pulled fresh from your boards. Tap any item to jump to it.',
        stats: {
          tasksClosed: 0,
          openInProgress: totalDueToday,
          overdue: totalOverdue,
          velocityPerDay: totalEvents > 0 ? String(totalEvents) : '—',
        },
        shipped: dueTodayItems.slice(0, 6).map((t: any) => ({
          title: t.title || t.name || 'Untitled',
          due: 'today',
          project: t.project_name || undefined,
        })),
        attention: overdueItems.slice(0, 6).map((t: any) => {
          const due = t.due_date || t.start_date
          let label = 'overdue'
          if (due) {
            const days = Math.max(1, Math.ceil((new Date(todayIso).getTime() - new Date(due).getTime()) / 86400000))
            label = days === 1 ? 'yesterday' : `${days}d ago`
          }
          return { title: t.title || t.name || 'Untitled', due: label, priority: 'high' as const, project: t.project_name || undefined }
        }),
        ctaUrl: (data as EmailData).cta_url || `${Deno.env.get('APP_URL') || 'https://app.livv.systems'}/calendar`,
      })
    } else {
      // Build inner body content (legacy plain-text path).
      let innerBody = (data as EmailData).message
      if (template === 'welcome') innerBody += buildWelcomeSection()
      htmlBody = wrapEmailHtml({
        accent: config.accent,
        brandName,
        logoUrl: resolvedLogo,
        greeting,
        title: (data as EmailData).title,
        icon: config.icon,
        bodyHtml: innerBody,
        ctaUrl: (data as EmailData).cta_url,
        ctaText: (data as EmailData).cta_text,
      })
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${brandName} <noreply@livv.space>`,
        to: [to],
        subject,
        html: htmlBody,
      }),
    })

    if (!resendResponse.ok) {
      const errText = await resendResponse.text()
      return new Response(JSON.stringify({ error: `Resend error: ${errText}` }), {
        status: 500,
        headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendData = await resendResponse.json()

    return new Response(JSON.stringify({ ok: true, message_id: resendData.id }), {
      headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

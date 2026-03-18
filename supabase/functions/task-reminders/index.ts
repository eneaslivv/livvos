// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

/**
 * Task Reminders Edge Function
 *
 * Called daily (via pg_cron or external scheduler) to:
 * 1. Find overdue tasks (due_date < today, not completed)
 * 2. Find tasks due today
 * 3. Send email reminders to assignees/owners
 * 4. Create in-app notifications
 *
 * Invoke: POST /functions/v1/task-reminders
 * Auth: service_role key (called from cron, not from client)
 */

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-custom-version, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const today = new Date().toISOString().split('T')[0]

    // 1. Find overdue tasks (due before today, not completed)
    const { data: overdueTasks, error: overdueErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, assignee_id, owner_id, priority, tenant_id, project_id')
      .eq('completed', false)
      .lt('due_date', today)
      .not('due_date', 'is', null)

    if (overdueErr) {
      console.error('Error fetching overdue tasks:', overdueErr)
    }

    // 2. Find tasks due today
    const { data: dueTodayTasks, error: dueErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, assignee_id, owner_id, priority, tenant_id, project_id')
      .eq('completed', false)
      .eq('due_date', today)

    if (dueErr) {
      console.error('Error fetching due-today tasks:', dueErr)
    }

    const allTasks = [
      ...(overdueTasks || []).map(t => ({ ...t, isOverdue: true })),
      ...(dueTodayTasks || []).map(t => ({ ...t, isOverdue: false })),
    ]

    if (allTasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'No overdue or due-today tasks' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Collect unique user IDs to notify
    const userTaskMap = new Map<string, { overdue: typeof allTasks; dueToday: typeof allTasks }>()

    for (const task of allTasks) {
      const userId = task.assignee_id || task.owner_id
      if (!userId) continue

      if (!userTaskMap.has(userId)) {
        userTaskMap.set(userId, { overdue: [], dueToday: [] })
      }
      const entry = userTaskMap.get(userId)!
      if (task.isOverdue) entry.overdue.push(task)
      else entry.dueToday.push(task)
    }

    // 4. Look up profiles for all users
    const userIds = Array.from(userTaskMap.keys())
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, name, tenant_id, status')
      .in('id', userIds)
      .eq('status', 'active')

    const profileMap = new Map((profiles || []).map(p => [p.id, p]))

    // 5. Check which notifications were already sent today (avoid duplicates)
    const { data: existingNotifs } = await supabase
      .from('notifications')
      .select('user_id, metadata')
      .eq('type', 'deadline')
      .gte('created_at', `${today}T00:00:00`)

    const alreadyNotified = new Set(
      (existingNotifs || []).map(n => `${n.user_id}_${n.metadata?.task_id || ''}`)
    )

    let sentCount = 0
    const notificationsToInsert: any[] = []

    // 6. Build notifications and send emails per user
    for (const [userId, tasks] of userTaskMap) {
      const profile = profileMap.get(userId)
      if (!profile) continue

      const tenantId = profile.tenant_id
      if (!tenantId) continue

      // Get tenant name + logo
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name, logo_url, logo_url_dark')
        .eq('id', tenantId)
        .single()
      const tenantName = tenant?.name || 'LIVV OS'
      // Prefer dark-mode logo for dark email header; fallback to regular logo
      const tenantLogo = tenant?.logo_url_dark || tenant?.logo_url || null

      // Create notifications for each overdue task
      for (const task of tasks.overdue) {
        const key = `${userId}_${task.id}`
        if (alreadyNotified.has(key)) continue

        const daysOverdue = Math.ceil(
          (new Date(today).getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24)
        )

        notificationsToInsert.push({
          user_id: userId,
          tenant_id: tenantId,
          type: 'deadline',
          title: `Overdue: ${task.title}`,
          message: `This task is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue.`,
          priority: daysOverdue >= 3 ? 'urgent' : 'high',
          link: '/calendar',
          metadata: { task_id: task.id, days_overdue: daysOverdue },
          action_required: true,
          action_url: '/calendar',
          action_text: 'View Task',
          category: 'deadline',
          read: false,
        })
      }

      // Create notifications for due-today tasks
      for (const task of tasks.dueToday) {
        const key = `${userId}_${task.id}`
        if (alreadyNotified.has(key)) continue

        notificationsToInsert.push({
          user_id: userId,
          tenant_id: tenantId,
          type: 'deadline',
          title: `Due today: ${task.title}`,
          message: 'This task is due today. Make sure to complete it before end of day.',
          priority: 'high',
          link: '/calendar',
          metadata: { task_id: task.id, due_today: true },
          action_required: true,
          action_url: '/calendar',
          action_text: 'View Task',
          category: 'deadline',
          read: false,
        })
      }

      // Send digest email (one email per user with all their tasks)
      if (resendApiKey && profile.email) {
        // Check email preference
        const { data: shouldSend } = await supabase.rpc('should_send_email', {
          p_user_id: userId,
          p_type: 'deadline',
          p_priority: 'high',
        })

        if (shouldSend) {
          const overdueCount = tasks.overdue.length
          const dueTodayCount = tasks.dueToday.length
          const lines: string[] = []

          if (overdueCount > 0) {
            lines.push(`<strong>${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}:</strong>`)
            for (const t of tasks.overdue.slice(0, 5)) {
              const days = Math.ceil(
                (new Date(today).getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24)
              )
              lines.push(`&bull; ${t.title} <span style="color:#ef4444;">(${days}d overdue)</span>`)
            }
            if (overdueCount > 5) lines.push(`&bull; ...and ${overdueCount - 5} more`)
          }

          if (dueTodayCount > 0) {
            if (lines.length > 0) lines.push('<br/>')
            lines.push(`<strong>${dueTodayCount} task${dueTodayCount > 1 ? 's' : ''} due today:</strong>`)
            for (const t of tasks.dueToday.slice(0, 5)) {
              lines.push(`&bull; ${t.title}`)
            }
            if (dueTodayCount > 5) lines.push(`&bull; ...and ${dueTodayCount - 5} more`)
          }

          const subject = overdueCount > 0
            ? `${overdueCount} overdue task${overdueCount > 1 ? 's' : ''} need your attention`
            : `${dueTodayCount} task${dueTodayCount > 1 ? 's' : ''} due today`

          const template = overdueCount > 0 ? 'task_overdue' : 'deadline_reminder'

          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: `${tenantName} <onboarding@resend.dev>`,
                to: [profile.email],
                subject,
                html: buildReminderHtml(template, {
                  recipientName: profile.name || undefined,
                  title: subject,
                  message: lines.join('<br/>'),
                  ctaUrl: `${Deno.env.get('APP_URL') || 'https://app.livv.systems'}/calendar`,
                  ctaText: 'View Calendar',
                }, tenantName, tenantLogo),
              }),
            })
            sentCount++
          } catch (emailErr) {
            console.error(`Failed to send reminder email to ${profile.email}:`, emailErr)
          }
        }
      }
    }

    // 7. Bulk insert notifications
    if (notificationsToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('notifications')
        .insert(notificationsToInsert)

      if (insertErr) {
        console.error('Error inserting notifications:', insertErr)
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        overdue: (overdueTasks || []).length,
        due_today: (dueTodayTasks || []).length,
        notifications_created: notificationsToInsert.length,
        emails_sent: sentCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('task-reminders error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// Reuse the same email template structure as send-email
function buildReminderHtml(
  template: string,
  data: { recipientName?: string; title: string; message: string; ctaUrl?: string; ctaText?: string },
  brandName: string,
  logoUrl?: string | null
): string {
  const configs: Record<string, { accent: string; icon: string }> = {
    task_overdue:       { accent: '#ef4444', icon: '&#128308;' },
    deadline_reminder:  { accent: '#f59e0b', icon: '&#9200;' },
  }
  const config = configs[template] || configs.deadline_reminder
  const firstName = data.recipientName?.split(' ')[0] || ''
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,'

  const ctaBlock = data.ctaUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:8px 0 32px;">
            <a href="${data.ctaUrl}"
               style="display:inline-block;padding:14px 36px;background-color:${config.accent};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;letter-spacing:0.3px;">
              ${data.ctaText || 'View Details'}
            </a>
          </td>
        </tr>
      </table>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#0a0a0a;padding:32px 40px;text-align:center;">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="${brandName}" style="max-height:40px;max-width:180px;object-fit:contain;" />`
                : `<div style="font-size:22px;font-weight:300;color:#ffffff;letter-spacing:2px;font-family:Georgia,serif;">${brandName}</div>`
              }
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;">${greeting}</h1>
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#18181b;">${config.icon} ${data.title}</h2>
              <div style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#71717a;">${data.message}</div>
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#fafafa;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:11px;color:#a1a1aa;">&copy; ${new Date().getFullYear()} ${brandName}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

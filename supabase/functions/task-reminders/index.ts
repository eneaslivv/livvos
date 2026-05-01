// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { emailCorsHeaders, resolveTenantBranding, buildWeeklyDigestTeamEmail } from '../_shared/emailTemplate.ts'

/**
 * Task Reminders + Daily Schedule Edge Function
 *
 * Called daily (via pg_cron or external scheduler) to:
 * 1. Find overdue tasks (due_date < today, not completed)
 * 2. Find tasks due today
 * 3. Find today's calendar events
 * 4. Send digest email reminders to assignees/owners
 * 5. Create in-app notifications
 *
 * Invoke: POST /functions/v1/task-reminders
 * Auth: service_role key (called from cron, not from client)
 */

// Daily briefing layout is composed via buildWeeklyDigestTeamEmail in the
// per-user loop below — the dark wine hero with stats + lists fits this
// "what's on your plate today" template better than the old colored boxes.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: emailCorsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const today = new Date().toISOString().split('T')[0]

    // 1. Find overdue tasks
    const { data: overdueTasks, error: overdueErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, assignee_id, owner_id, priority, tenant_id, project_id')
      .eq('completed', false)
      .lt('due_date', today)
      .not('due_date', 'is', null)

    if (overdueErr) console.error('Error fetching overdue tasks:', overdueErr)

    // 2. Find tasks due today
    const { data: dueTodayTasks, error: dueErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, assignee_id, owner_id, priority, tenant_id, project_id')
      .eq('completed', false)
      .eq('due_date', today)

    if (dueErr) console.error('Error fetching due-today tasks:', dueErr)

    // 3. Find today's calendar events
    const { data: todayEvents, error: eventsErr } = await supabase
      .from('calendar_events')
      .select('id, title, start_date, start_time, end_time, owner_id, tenant_id')
      .eq('start_date', today)

    if (eventsErr) console.error('Error fetching today events:', eventsErr)

    const allTasks = [
      ...(overdueTasks || []).map(t => ({ ...t, isOverdue: true })),
      ...(dueTodayTasks || []).map(t => ({ ...t, isOverdue: false })),
    ]

    // 4. Look up active profiles up front so we can enforce tenant isolation
    // when grouping. The job runs as service-role and queries every tenant,
    // so a task assigned to user A in tenant X must NOT end up in A's email
    // if A's current profile.tenant_id is tenant Y. (Cross-tenant leak.)
    const candidateUserIds = Array.from(new Set([
      ...allTasks.map(t => t.assignee_id || t.owner_id).filter(Boolean),
      ...(todayEvents || []).map(e => e.owner_id).filter(Boolean),
    ])) as string[]

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, name, tenant_id, status')
      .in('id', candidateUserIds)
      .eq('status', 'active')

    const profileMap = new Map((profiles || []).map(p => [p.id, p]))

    const userDataMap = new Map<string, { overdue: any[]; dueToday: any[]; events: any[] }>()

    for (const task of allTasks) {
      const userId = task.assignee_id || task.owner_id
      if (!userId) continue
      const profile = profileMap.get(userId)
      // Drop tasks whose tenant doesn't match the recipient's current tenant.
      if (!profile || !profile.tenant_id || profile.tenant_id !== task.tenant_id) continue
      if (!userDataMap.has(userId)) userDataMap.set(userId, { overdue: [], dueToday: [], events: [] })
      const entry = userDataMap.get(userId)!
      if (task.isOverdue) entry.overdue.push(task)
      else entry.dueToday.push(task)
    }

    for (const event of (todayEvents || [])) {
      const userId = event.owner_id
      if (!userId) continue
      const profile = profileMap.get(userId)
      if (!profile || !profile.tenant_id || profile.tenant_id !== event.tenant_id) continue
      if (!userDataMap.has(userId)) userDataMap.set(userId, { overdue: [], dueToday: [], events: [] })
      userDataMap.get(userId)!.events.push(event)
    }

    if (userDataMap.size === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'No tasks or events today' }), {
        headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 6. Avoid duplicate notifications
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

    // 7. Process each user
    for (const [userId, userData] of userDataMap) {
      const profile = profileMap.get(userId)
      if (!profile?.tenant_id) continue

      const branding = await resolveTenantBranding(supabase, profile.tenant_id)

      // Create notifications for overdue tasks
      for (const task of userData.overdue) {
        const key = `${userId}_${task.id}`
        if (alreadyNotified.has(key)) continue
        const daysOverdue = Math.ceil((new Date(today).getTime() - new Date(task.due_date).getTime()) / 86400000)
        notificationsToInsert.push({
          user_id: userId, tenant_id: profile.tenant_id, type: 'deadline',
          title: `Overdue: ${task.title}`,
          message: `This task is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue.`,
          priority: daysOverdue >= 3 ? 'urgent' : 'high',
          link: '/calendar', metadata: { task_id: task.id, days_overdue: daysOverdue },
          action_required: true, action_url: '/calendar', action_text: 'View Task',
          category: 'deadline', read: false,
        })
      }

      // Create notifications for due-today tasks
      for (const task of userData.dueToday) {
        const key = `${userId}_${task.id}`
        if (alreadyNotified.has(key)) continue
        notificationsToInsert.push({
          user_id: userId, tenant_id: profile.tenant_id, type: 'deadline',
          title: `Due today: ${task.title}`,
          message: 'This task is due today. Make sure to complete it before end of day.',
          priority: 'high', link: '/calendar', metadata: { task_id: task.id, due_today: true },
          action_required: true, action_url: '/calendar', action_text: 'View Task',
          category: 'deadline', read: false,
        })
      }

      // Send digest email — uses the wine-hero "weekly digest" layout from
      // the Livv Mailing System, adapted for a single-day briefing. Maps the
      // user's overdue/due-today/events into the same Stats + Shipped +
      // Attention sections.
      if (resendApiKey && profile.email) {
        const { data: shouldSend } = await supabase.rpc('should_send_email', {
          p_user_id: userId, p_type: 'deadline', p_priority: 'high',
        })

        if (shouldSend) {
          const { overdue, dueToday, events } = userData

          const parts: string[] = []
          if (overdue.length > 0) parts.push(`${overdue.length} overdue`)
          if (dueToday.length > 0) parts.push(`${dueToday.length} due today`)
          if (events.length > 0) parts.push(`${events.length} event${events.length > 1 ? 's' : ''}`)
          const subject = (parts.join(', ') || 'A quiet day') + ' — daily briefing'

          const firstName = profile.name?.split(' ')[0] || ''
          const dateLabel = new Date(today).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          const headline = firstName
            ? `${firstName}, here's your day — ${parts.length ? parts.join(', ') + '.' : 'no fires today.'}`
            : `Your day ahead — ${parts.length ? parts.join(', ') + '.' : 'a clear runway.'}`

          const appUrl = Deno.env.get('APP_URL') || 'https://app.livv.systems'

          const html = buildWeeklyDigestTeamEmail({
            brandName: branding.name,
            logoUrl: branding.logoUrl,
            weekLabel: dateLabel,
            digestNumber: 'DAILY',
            headline,
            intro: 'Pulled fresh from your boards. Tap any item to jump straight to it.',
            stats: {
              tasksClosed: 0,
              openInProgress: dueToday.length,
              overdue: overdue.length,
              velocityPerDay: events.length ? `${events.length}` : '—',
            },
            shipped: dueToday.slice(0, 6).map((t: any) => ({
              title: t.title,
              project: t.project_id ? `Project ${String(t.project_id).slice(0, 6)}` : undefined,
              due: 'today',
            })),
            attention: overdue.slice(0, 6).map((t: any) => {
              const days = Math.ceil((new Date(today).getTime() - new Date(t.due_date).getTime()) / 86400000)
              return {
                title: t.title,
                project: t.project_id ? `Project ${String(t.project_id).slice(0, 6)}` : undefined,
                due: days === 1 ? 'yesterday' : `${days}d ago`,
                priority: 'high' as const,
              }
            }),
            ctaUrl: `${appUrl}/calendar`,
            unsubscribeUrl: `${appUrl}/settings/notifications`,
            settingsUrl: `${appUrl}/settings/notifications`,
          })

          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: `${branding.name} <noreply@livv.space>`,
                to: [profile.email],
                subject,
                html,
              }),
            })
            sentCount++
          } catch (emailErr) {
            console.error(`Failed to send reminder to ${profile.email}:`, emailErr)
          }
        }
      }
    }

    // 8. Bulk insert notifications
    if (notificationsToInsert.length > 0) {
      const { error: insertErr } = await supabase.from('notifications').insert(notificationsToInsert)
      if (insertErr) console.error('Error inserting notifications:', insertErr)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        overdue: (overdueTasks || []).length,
        due_today: (dueTodayTasks || []).length,
        events_today: (todayEvents || []).length,
        notifications_created: notificationsToInsert.length,
        emails_sent: sentCount,
      }),
      { headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('task-reminders error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

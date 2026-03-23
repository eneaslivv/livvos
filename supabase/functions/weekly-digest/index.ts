// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { emailCorsHeaders, resolveTenantBranding, wrapEmailHtml } from '../_shared/emailTemplate.ts'

/**
 * Weekly Digest Edge Function
 *
 * Called every Monday (via pg_cron) to send a weekly summary email:
 * 1. Tasks completed last week (achievements)
 * 2. Pending tasks + upcoming deadlines (next 7 days)
 * 3. This week's calendar events
 *
 * Invoke: POST /functions/v1/weekly-digest
 * Auth: service_role key (called from cron, not from client)
 */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(time: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
}

function buildWeeklyBody(
  completed: any[],
  pending: any[],
  upcoming: any[],
  events: any[],
): string {
  const sections: string[] = []

  if (completed.length > 0) {
    sections.push(`<div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:600;color:#10b981;margin-bottom:10px;">&#9989; ${completed.length} task${completed.length !== 1 ? 's' : ''} completed last week</div>
      ${completed.slice(0, 8).map(t => `
        <div style="padding:8px 12px;background:#f0fdf4;border-radius:8px;margin-bottom:4px;font-size:13px;color:#18181b;border-left:3px solid #10b981;">
          <span style="text-decoration:line-through;opacity:0.7;">${t.title}</span>
        </div>
      `).join('')}
      ${completed.length > 8 ? `<div style="font-size:12px;color:#78736A;padding-left:12px;margin-top:4px;">+${completed.length - 8} more</div>` : ''}
    </div>`)
  }

  if (pending.length > 0) {
    sections.push(`<div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:600;color:#f59e0b;margin-bottom:10px;">&#128203; ${pending.length} task${pending.length !== 1 ? 's' : ''} still pending</div>
      ${pending.slice(0, 6).map(t => {
        const dueInfo = t.due_date ? ` <span style="color:#78736A;font-size:11px;">&middot; due ${formatDate(t.due_date)}</span>` : ''
        const priorityBadge = t.priority === 'high' || t.priority === 'urgent'
          ? `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:#fef2f2;color:#ef4444;font-size:10px;font-weight:600;margin-left:6px;">${t.priority}</span>`
          : ''
        return `<div style="padding:8px 12px;background:#fffbeb;border-radius:8px;margin-bottom:4px;font-size:13px;color:#18181b;border-left:3px solid #f59e0b;">
          ${t.title}${priorityBadge}${dueInfo}
        </div>`
      }).join('')}
      ${pending.length > 6 ? `<div style="font-size:12px;color:#78736A;padding-left:12px;margin-top:4px;">+${pending.length - 6} more</div>` : ''}
    </div>`)
  }

  if (upcoming.length > 0) {
    sections.push(`<div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:600;color:#3b82f6;margin-bottom:10px;">&#128197; ${upcoming.length} deadline${upcoming.length !== 1 ? 's' : ''} this week</div>
      ${upcoming.slice(0, 6).map(t => `
        <div style="padding:8px 12px;background:#eff6ff;border-radius:8px;margin-bottom:4px;font-size:13px;color:#18181b;border-left:3px solid #3b82f6;">
          ${t.title} <span style="color:#3b82f6;font-size:11px;">&middot; ${formatDate(t.due_date)}</span>
        </div>
      `).join('')}
    </div>`)
  }

  if (events.length > 0) {
    sections.push(`<div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:600;color:#6366f1;margin-bottom:10px;">&#128197; ${events.length} event${events.length !== 1 ? 's' : ''} this week</div>
      ${events.slice(0, 8).map(e => {
        const time = e.start_time ? formatTime(e.start_time) : ''
        return `<div style="padding:8px 12px;background:#eef2ff;border-radius:8px;margin-bottom:4px;font-size:13px;color:#18181b;border-left:3px solid #6366f1;">
          ${e.title} <span style="color:#6366f1;font-size:11px;">&middot; ${formatDate(e.start_date)}${time ? ` at ${time}` : ''}</span>
        </div>`
      }).join('')}
      ${events.length > 8 ? `<div style="font-size:12px;color:#78736A;padding-left:12px;margin-top:4px;">+${events.length - 8} more</div>` : ''}
    </div>`)
  }

  return sections.join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: emailCorsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (!resendApiKey) {
      return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY not configured' }), {
        status: 500, headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Calculate date ranges
    const lastWeekStart = new Date(now)
    lastWeekStart.setDate(now.getDate() - 7)
    const lastWeekStr = lastWeekStart.toISOString().split('T')[0]

    const nextWeekEnd = new Date(now)
    nextWeekEnd.setDate(now.getDate() + 7)
    const nextWeekStr = nextWeekEnd.toISOString().split('T')[0]

    // 1. Tasks completed last week
    const { data: completedTasks } = await supabase
      .from('tasks')
      .select('id, title, assignee_id, owner_id, tenant_id, completed_at')
      .eq('completed', true)
      .gte('completed_at', `${lastWeekStr}T00:00:00`)
      .lt('completed_at', `${today}T00:00:00`)

    // 2. Pending tasks (all incomplete)
    const { data: pendingTasks } = await supabase
      .from('tasks')
      .select('id, title, due_date, assignee_id, owner_id, priority, tenant_id')
      .eq('completed', false)

    // 3. Tasks with deadlines this week
    const { data: upcomingDeadlines } = await supabase
      .from('tasks')
      .select('id, title, due_date, assignee_id, owner_id, tenant_id')
      .eq('completed', false)
      .gte('due_date', today)
      .lte('due_date', nextWeekStr)
      .order('due_date', { ascending: true })

    // 4. Events this week
    const { data: weekEvents } = await supabase
      .from('calendar_events')
      .select('id, title, start_date, start_time, end_time, owner_id, tenant_id')
      .gte('start_date', today)
      .lte('start_date', nextWeekStr)
      .order('start_date', { ascending: true })

    // Group by user
    const userDataMap = new Map<string, { completed: any[]; pending: any[]; upcoming: any[]; events: any[] }>()

    const ensureUser = (userId: string) => {
      if (!userDataMap.has(userId)) {
        userDataMap.set(userId, { completed: [], pending: [], upcoming: [], events: [] })
      }
      return userDataMap.get(userId)!
    }

    for (const t of (completedTasks || [])) {
      const userId = t.assignee_id || t.owner_id
      if (userId) ensureUser(userId).completed.push(t)
    }

    for (const t of (pendingTasks || [])) {
      const userId = t.assignee_id || t.owner_id
      if (userId) ensureUser(userId).pending.push(t)
    }

    for (const t of (upcomingDeadlines || [])) {
      const userId = t.assignee_id || t.owner_id
      if (userId) ensureUser(userId).upcoming.push(t)
    }

    for (const e of (weekEvents || [])) {
      if (e.owner_id) ensureUser(e.owner_id).events.push(e)
    }

    if (userDataMap.size === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'No data for weekly digest' }), {
        headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up profiles
    const userIds = Array.from(userDataMap.keys())
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, name, tenant_id, status')
      .in('id', userIds)
      .eq('status', 'active')

    const profileMap = new Map((profiles || []).map(p => [p.id, p]))

    let sentCount = 0

    for (const [userId, userData] of userDataMap) {
      const profile = profileMap.get(userId)
      if (!profile?.email || !profile?.tenant_id) continue

      // Check email preferences
      const { data: shouldSend } = await supabase.rpc('should_send_email', {
        p_user_id: userId, p_type: 'project', p_priority: 'normal',
      })
      if (!shouldSend) continue

      // Get tenant branding
      const branding = await resolveTenantBranding(supabase, profile.tenant_id)

      const { data: tenant } = await supabase
        .from('tenants')
        .select('domain')
        .eq('id', profile.tenant_id)
        .single()

      const domain = tenant?.domain || 'app.livv.space'
      const dashboardUrl = `https://${domain}`

      const firstName = (profile.name || 'there').split(' ')[0]

      const hasContent = userData.completed.length > 0 || userData.pending.length > 0 || userData.upcoming.length > 0 || userData.events.length > 0
      if (!hasContent) continue

      const weeklyBody = buildWeeklyBody(userData.completed, userData.pending, userData.upcoming, userData.events)

      const divider = `<div style="height:1px;background:linear-gradient(90deg,transparent,#e6e2d8,transparent);margin-bottom:24px;"></div>`

      const html = wrapEmailHtml({
        accent: '#8b5cf6',
        brandName: branding.name,
        logoUrl: branding.logoUrl,
        greeting: `Weekly Overview &#128202;`,
        bodyHtml: `<div style="font-size:14px;color:#78736A;margin-bottom:24px;">Hi ${firstName}, here's your week at a glance.</div>${divider}${weeklyBody}`,
        ctaUrl: dashboardUrl,
        ctaText: 'Open Dashboard',
        footerExtra: 'You received this because weekly digests are enabled.',
      })

      const subject = `Your week ahead — ${userData.upcoming.length} deadline${userData.upcoming.length !== 1 ? 's' : ''}, ${userData.events.length} event${userData.events.length !== 1 ? 's' : ''}`

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${branding.name} <noreply@livv.space>`,
            to: [profile.email],
            subject,
            html,
          }),
        })

        if (res.ok) sentCount++
        else console.error(`Failed to send weekly digest to ${profile.email}:`, await res.text())
      } catch (err) {
        console.error(`Error sending weekly digest to ${profile.email}:`, err)
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount, users: userDataMap.size }), {
      headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Weekly digest error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

/**
 * Per-category data loaders for the Daily Brief.
 *
 * Each loader is a pure function that takes (db, tenantId, userId, now)
 * and returns a typed CategoryData object: a compact, structured
 * summary the synthesis layer can feed into a prompt OR the UI can
 * render directly.
 *
 * Loaders are run in parallel from the consumer (DailyBrief component).
 * If a loader fails it returns null — the brief skips that section
 * rather than failing the whole brief.
 *
 * Adding a new category: drop a new entry in CATEGORY_REGISTRY with a
 * loader + render hints. The settings UI auto-picks it up.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type CategoryId =
  | 'today_load' | 'cashflow' | 'pipeline' | 'content'
  | 'inbox' | 'team_kpis' | 'strategy' | 'upcoming';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  icon: string;
  tone: 'rose' | 'emerald' | 'violet' | 'fuchsia' | 'amber' | 'blue' | 'indigo' | 'zinc';
  // One-line description shown in the settings toggle list so the user
  // understands what this category surfaces.
  describe: string;
  // PageView id the card drill-down navigates to when clicked.
  // Keeps the brief from being a dead-end — every card is also a
  // door into the module that owns its data.
  navigateTo: string;
}

export const CATEGORY_REGISTRY: CategoryMeta[] = [
  { id: 'today_load', label: "Today's load",     icon: 'Clock',     tone: 'rose',    describe: 'Overdue + due-today task count + most urgent items.',           navigateTo: 'calendar' },
  { id: 'cashflow',   label: 'Cashflow',         icon: 'DollarSign', tone: 'emerald', describe: 'Installments paid + pending this week + overdue.',               navigateTo: 'finance' },
  { id: 'pipeline',   label: 'Sales pipeline',   icon: 'Target',    tone: 'violet',  describe: 'Lead counts by stage + actions due today + at-risk deals.',    navigateTo: 'sales_pipeline' },
  { id: 'content',    label: 'Content',          icon: 'Sparkles',  tone: 'fuchsia', describe: 'Published this week vs target + drafts in the pipeline.',         navigateTo: 'content_engine' },
  { id: 'inbox',      label: 'Inbox signals',    icon: 'Mail',      tone: 'amber',   describe: 'Pending messages count + urgent flags + AI-detected requests.',  navigateTo: 'communications' },
  { id: 'team_kpis',  label: 'Team KPIs',        icon: 'Users',     tone: 'blue',    describe: 'KPI logs below target this period — who needs help.',             navigateTo: 'team_scaling' },
  { id: 'strategy',   label: 'Strategy signals', icon: 'Flag',      tone: 'indigo',  describe: 'ICPs with no recent activity + packages with no leads.',          navigateTo: 'strategy_hub' },
  { id: 'upcoming',   label: "What's coming",    icon: 'Calendar',  tone: 'zinc',    describe: 'Events + deadlines in the next 7 days.',                          navigateTo: 'calendar' },
];

export interface CategoryData {
  id: CategoryId;
  // Short label rendered as the card title (matches CategoryMeta.label).
  title: string;
  // 1-3 highlight pills shown at the top of the card — usually counts.
  highlights: Array<{ label: string; value: string; tone?: 'rose' | 'amber' | 'emerald' | 'violet' | 'indigo' | 'zinc' }>;
  // Up to ~6 bulleted lines of detail — surfaced both in the UI and in
  // the AI synthesis prompt as ground truth.
  bullets: string[];
  // Status: 'attention' = needs action, 'ok' = nothing to do here,
  // 'empty' = no data exists in this module yet. Drives the card
  // border tone.
  status: 'attention' | 'ok' | 'empty';
  // Free-form context the synthesis layer can use but the UI doesn't
  // render. E.g. raw counts for the AI to compose its narrative.
  context?: Record<string, any>;
  // Optional inline gauges — surfaced as small progress bars inside
  // the card body. Currently only used by `content` for per-channel
  // frequency compliance, but the shape is general.
  gauges?: Array<{ label: string; current: number; target: number; tone?: 'rose' | 'amber' | 'emerald' | 'violet' }>;
  // Optional structured items — richer than plain bullets. Each item
  // has an id + text and can carry arbitrary meta. When present, the
  // UI renders these as clickable rows that can open a detail panel
  // (e.g. inbox messages). The plain `bullets` array still exists for
  // the AI synthesis prompt.
  items?: Array<{ id: string; text: string; meta?: Record<string, any> }>;
}

export interface LoaderCtx {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
  now: Date;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

// ── today_load ────────────────────────────────────────────────────
async function loadTodayLoad(ctx: LoaderCtx): Promise<CategoryData | null> {
  try {
    const today = isoDay(ctx.now);
    const { data: tasks } = await ctx.db
      .from('tasks')
      .select('id, title, priority, start_date, status, completed, assignee_ids, owner_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('completed', false)
      .not('status', 'eq', 'cancelled')
      .not('start_date', 'is', null);
    const mine = (tasks || []).filter((t: any) => {
      const ids: string[] = Array.isArray(t.assignee_ids) ? t.assignee_ids : [];
      return ids.includes(ctx.userId) || t.owner_id === ctx.userId;
    });
    const overdue = mine.filter((t: any) => t.start_date < today);
    const dueToday = mine.filter((t: any) => t.start_date === today);
    const topUrgent = [...overdue, ...dueToday]
      .sort((a, b) => {
        const rank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (rank[a.priority || 'medium'] ?? 2) - (rank[b.priority || 'medium'] ?? 2);
      })
      .slice(0, 5);
    return {
      id: 'today_load',
      title: "Today's load",
      highlights: [
        { label: 'Overdue',   value: String(overdue.length),   tone: overdue.length > 0 ? 'rose' : 'zinc' },
        { label: 'Due today', value: String(dueToday.length),  tone: dueToday.length > 0 ? 'amber' : 'zinc' },
      ],
      bullets: topUrgent.map((t: any) =>
        `${t.priority === 'urgent' || t.priority === 'high' ? '🔥 ' : ''}${t.title}${t.start_date === today ? ' (today)' : ` (${daysAgo(t.start_date, today)}d overdue)`}`
      ),
      status: overdue.length + dueToday.length > 0 ? 'attention' : 'ok',
      context: { overdue_count: overdue.length, due_today_count: dueToday.length },
    };
  } catch { return null; }
}

// ── cashflow ──────────────────────────────────────────────────────
async function loadCashflow(ctx: LoaderCtx): Promise<CategoryData | null> {
  try {
    const today = isoDay(ctx.now);
    const weekStart = isoDay(startOfWeek(ctx.now));
    const weekEnd = isoDay(addDays(startOfWeek(ctx.now), 6));
    const { data: rows } = await ctx.db
      .from('installments')
      .select('amount, status, due_date, paid_date, income_id, incomes!inner(tenant_id, concept, client_name)')
      .eq('incomes.tenant_id', ctx.tenantId);
    const all = (rows || []) as any[];
    const paidThisWeek = all.filter(r => r.status === 'paid' && r.paid_date && r.paid_date >= weekStart && r.paid_date <= weekEnd);
    const pendingThisWeek = all.filter(r => r.status === 'pending' && r.due_date >= weekStart && r.due_date <= weekEnd);
    const overdueDue = all.filter(r => r.status === 'pending' && r.due_date < today);
    const sum = (xs: any[]) => xs.reduce((s, r) => s + Number(r.amount || 0), 0);
    const paidSum = sum(paidThisWeek);
    const pendingSum = sum(pendingThisWeek);
    const overdueSum = sum(overdueDue);
    const topOverdue = overdueDue
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
      .slice(0, 4);
    return {
      id: 'cashflow',
      title: 'Cashflow',
      highlights: [
        { label: 'Paid this wk', value: `$${paidSum.toLocaleString()}`,    tone: paidSum > 0 ? 'emerald' : 'zinc' },
        { label: 'Due this wk',  value: `$${pendingSum.toLocaleString()}`, tone: pendingSum > 0 ? 'amber' : 'zinc' },
        { label: 'Overdue',      value: `$${overdueSum.toLocaleString()}`, tone: overdueSum > 0 ? 'rose' : 'zinc' },
      ],
      bullets: topOverdue.map((r: any) =>
        `${r.incomes?.client_name || '—'} · ${r.incomes?.concept || 'invoice'}: $${Number(r.amount || 0).toLocaleString()} (due ${r.due_date}, ${daysAgo(r.due_date, today)}d ago)`
      ),
      status: overdueDue.length > 0 ? 'attention' : (paidSum + pendingSum > 0 ? 'ok' : 'empty'),
      context: { paid_this_week: paidSum, due_this_week: pendingSum, overdue: overdueSum, overdue_count: overdueDue.length },
    };
  } catch { return null; }
}

// ── pipeline ──────────────────────────────────────────────────────
async function loadPipeline(ctx: LoaderCtx): Promise<CategoryData | null> {
  try {
    const today = isoDay(ctx.now);
    const { data: leads } = await ctx.db
      .from('sales_leads')
      .select('id, company_name, status, next_action, next_action_date, deal_value_implementation, deal_value_monthly, updated_at')
      .eq('tenant_id', ctx.tenantId)
      .not('status', 'in', '(lost)');
    const active = (leads || []) as any[];
    const won = active.filter(l => l.status === 'won').length;
    const actionDueToday = active.filter(l => l.next_action_date && l.next_action_date <= today && l.status !== 'won');
    const callsScheduled = active.filter(l => l.status === 'call_scheduled').length;
    const proposalsSent = active.filter(l => l.status === 'proposal_sent').length;
    const pipelineValue = active.filter(l => l.status !== 'won').reduce((s, l) => s + Number(l.deal_value_implementation || 0), 0);
    // "At risk" = lead in active stage with no activity in 7 days
    const sevenDaysAgo = isoDay(addDays(ctx.now, -7));
    const atRisk = active.filter(l => l.status !== 'won' && l.status !== 'nurturing' && l.updated_at && l.updated_at.slice(0, 10) < sevenDaysAgo);
    return {
      id: 'pipeline',
      title: 'Sales pipeline',
      highlights: [
        { label: 'Pipeline value', value: `$${pipelineValue.toLocaleString()}`, tone: pipelineValue > 0 ? 'violet' : 'zinc' },
        { label: 'Calls scheduled', value: String(callsScheduled), tone: callsScheduled > 0 ? 'emerald' : 'zinc' },
        { label: 'Actions due',    value: String(actionDueToday.length), tone: actionDueToday.length > 0 ? 'amber' : 'zinc' },
      ],
      bullets: [
        ...actionDueToday.slice(0, 3).map((l: any) => `🎯 ${l.company_name}: ${l.next_action || 'follow up'}`),
        ...atRisk.slice(0, 3).map((l: any) => `⚠ ${l.company_name} · ${l.status} · stale ${daysAgo(l.updated_at.slice(0, 10), today)}d`),
      ],
      status: actionDueToday.length > 0 || atRisk.length > 0 ? 'attention' : (active.length > 0 ? 'ok' : 'empty'),
      context: { pipeline_value: pipelineValue, calls_scheduled: callsScheduled, proposals_sent: proposalsSent, at_risk_count: atRisk.length, won_count: won },
    };
  } catch { return null; }
}

// ── content ───────────────────────────────────────────────────────
async function loadContent(ctx: LoaderCtx): Promise<CategoryData | null> {
  try {
    const today = isoDay(ctx.now);
    const weekStart = isoDay(startOfWeek(ctx.now));
    const { data: channels } = await ctx.db
      .from('content_channels')
      .select('id, name, frequency_posts_per_week, priority, status')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'active');
    const { data: pieces } = await ctx.db
      .from('content_pieces')
      .select('id, channel_id, status, published_date, scheduled_date, title')
      .eq('tenant_id', ctx.tenantId);
    const ch = (channels || []) as any[];
    const pcs = (pieces || []) as any[];
    if (ch.length === 0 && pcs.length === 0) {
      return { id: 'content', title: 'Content', highlights: [], bullets: [], status: 'empty', context: {} };
    }
    const publishedThisWeek = pcs.filter(p => p.status === 'published' && p.published_date >= weekStart && p.published_date <= today);
    const inPipeline = pcs.filter(p => p.status === 'idea' || p.status === 'drafted' || p.status === 'review' || p.status === 'scheduled').length;
    const scheduledThisWeek = pcs.filter(p => p.status === 'scheduled' && p.scheduled_date && p.scheduled_date >= today && p.scheduled_date <= isoDay(addDays(ctx.now, 7)));
    // Per-channel compliance — channels behind target
    const behindChannels = ch.filter(c => {
      if (!c.frequency_posts_per_week || c.frequency_posts_per_week === 0) return false;
      const count = publishedThisWeek.filter(p => p.channel_id === c.id).length;
      return count < c.frequency_posts_per_week;
    });
    // Per-channel compliance gauges — one bar per channel with a
    // frequency target. Behind = rose, on track = emerald, no target
    // set = skipped entirely. Sorted by % attainment ascending so
    // problem channels surface first.
    const gauges = ch
      .filter(c => c.frequency_posts_per_week && c.frequency_posts_per_week > 0)
      .map(c => {
        const current = publishedThisWeek.filter(p => p.channel_id === c.id).length;
        const target = c.frequency_posts_per_week;
        const tone: 'rose' | 'amber' | 'emerald' = current >= target ? 'emerald'
          : (current / target) >= 0.5 ? 'amber'
          : 'rose';
        return { label: c.name, current, target, tone };
      })
      .sort((a, b) => (a.current / a.target) - (b.current / b.target))
      .slice(0, 5);
    return {
      id: 'content',
      title: 'Content',
      highlights: [
        { label: 'Published wk',  value: String(publishedThisWeek.length), tone: publishedThisWeek.length > 0 ? 'emerald' : 'amber' },
        { label: 'In pipeline',   value: String(inPipeline),                tone: 'violet' },
        { label: 'Channels behind', value: String(behindChannels.length),   tone: behindChannels.length > 0 ? 'rose' : 'emerald' },
      ],
      bullets: scheduledThisWeek.slice(0, 3).map((p: any) => `📅 "${p.title}" — ${p.scheduled_date?.slice(5)}`),
      gauges,
      status: behindChannels.length > 0 ? 'attention' : (publishedThisWeek.length > 0 ? 'ok' : 'empty'),
      context: { published_this_week: publishedThisWeek.length, in_pipeline: inPipeline, channels_behind: behindChannels.length, total_channels: ch.length },
    };
  } catch { return null; }
}

// ── inbox ─────────────────────────────────────────────────────────
async function loadInbox(ctx: LoaderCtx): Promise<CategoryData | null> {
  try {
    const { data: msgs } = await ctx.db
      .from('communication_messages')
      .select('id, platform, from_name, from_email, subject, body_text, channel_name, received_at, status, ai_classification, matched_client_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'pending')
      .order('received_at', { ascending: false })
      .limit(50);
    const pending = (msgs || []) as any[];
    const urgent = pending.filter(m => {
      const c = m.ai_classification || {};
      return c.priority === 'high' || c.intent === 'urgent';
    });
    const requests = pending.filter(m => m.ai_classification?.should_create_task === true);
    // Surface urgent + requests first, then fill with the rest.
    const seen = new Set<string>();
    const topItems: any[] = [];
    for (const m of [...urgent, ...requests, ...pending]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      topItems.push(m);
      if (topItems.length >= 6) break;
    }
    return {
      id: 'inbox',
      title: 'Inbox signals',
      highlights: [
        { label: 'Pending',  value: String(pending.length),  tone: pending.length > 0 ? 'amber' : 'zinc' },
        { label: 'Urgent',   value: String(urgent.length),   tone: urgent.length > 0 ? 'rose' : 'zinc' },
        { label: 'Requests', value: String(requests.length), tone: requests.length > 0 ? 'violet' : 'zinc' },
      ],
      bullets: topItems.map((m: any) =>
        `${m.from_name || 'Anonymous'} · ${(m.subject || '(no subject)').slice(0, 60)}`
      ),
      // Structured items — each carries the full message data so the
      // detail panel can render it without a round-trip to the DB.
      items: topItems.map((m: any) => ({
        id: m.id,
        text: `${m.from_name || 'Anonymous'} · ${(m.subject || '(no subject)').slice(0, 60)}`,
        meta: {
          platform: m.platform,
          from_name: m.from_name,
          from_email: m.from_email,
          subject: m.subject,
          body_text: m.body_text,
          channel_name: m.channel_name,
          received_at: m.received_at,
          ai_classification: m.ai_classification,
          matched_client_id: m.matched_client_id,
        },
      })),
      status: urgent.length > 0 ? 'attention' : (pending.length > 0 ? 'ok' : 'empty'),
      context: { pending_total: pending.length, urgent_count: urgent.length, request_count: requests.length },
    };
  } catch { return null; }
}

// ── team_kpis ─────────────────────────────────────────────────────
async function loadTeamKpis(ctx: LoaderCtx): Promise<CategoryData | null> {
  try {
    const monthAgo = isoDay(addDays(ctx.now, -30));
    const { data: logs } = await ctx.db
      .from('team_kpi_logs')
      .select('id, member_id, metric_name, target_value, actual_value, period_end, team_member_profiles(name)')
      .eq('tenant_id', ctx.tenantId)
      .gte('period_end', monthAgo)
      .order('period_end', { ascending: false })
      .limit(60);
    const all = (logs || []) as any[];
    if (all.length === 0) {
      return { id: 'team_kpis', title: 'Team KPIs', highlights: [], bullets: [], status: 'empty', context: {} };
    }
    const measured = all.filter(l => l.target_value != null && l.actual_value != null);
    const missing = measured.filter(l => Number(l.actual_value) < Number(l.target_value));
    const hit = measured.length - missing.length;
    const topMiss = missing.slice(0, 4);
    return {
      id: 'team_kpis',
      title: 'Team KPIs',
      highlights: [
        { label: 'KPIs hit',  value: `${hit}/${measured.length}`, tone: missing.length === 0 ? 'emerald' : 'amber' },
        { label: 'Missing',   value: String(missing.length),       tone: missing.length > 0 ? 'rose' : 'zinc' },
      ],
      bullets: topMiss.map((l: any) => {
        const name = l.team_member_profiles?.name || 'Someone';
        const pct = l.target_value > 0 ? Math.round((Number(l.actual_value) / Number(l.target_value)) * 100) : 0;
        return `${name} · ${l.metric_name}: ${l.actual_value}/${l.target_value} (${pct}%)`;
      }),
      status: missing.length > 0 ? 'attention' : 'ok',
      context: { kpis_measured: measured.length, kpis_hit: hit, kpis_missing: missing.length },
    };
  } catch { return null; }
}

// ── strategy ──────────────────────────────────────────────────────
async function loadStrategy(ctx: LoaderCtx): Promise<CategoryData | null> {
  try {
    const monthAgo = isoDay(addDays(ctx.now, -30));
    const [icpRes, pkgRes, leadRes] = await Promise.all([
      ctx.db.from('strategy_icps').select('id, name, status').eq('tenant_id', ctx.tenantId).eq('status', 'active'),
      ctx.db.from('strategy_packages').select('id, name, status').eq('tenant_id', ctx.tenantId).eq('status', 'active'),
      ctx.db.from('sales_leads').select('icp_id, package_id, created_at').eq('tenant_id', ctx.tenantId).gte('created_at', monthAgo),
    ]);
    const icps = (icpRes.data || []) as any[];
    const pkgs = (pkgRes.data || []) as any[];
    const recentLeads = (leadRes.data || []) as any[];
    if (icps.length === 0 && pkgs.length === 0) {
      return { id: 'strategy', title: 'Strategy signals', highlights: [], bullets: [], status: 'empty', context: {} };
    }
    const icpsWithLeads = new Set(recentLeads.map(l => l.icp_id).filter(Boolean));
    const pkgsWithLeads = new Set(recentLeads.map(l => l.package_id).filter(Boolean));
    const dormantIcps = icps.filter(i => !icpsWithLeads.has(i.id));
    const unusedPkgs = pkgs.filter(p => !pkgsWithLeads.has(p.id));
    return {
      id: 'strategy',
      title: 'Strategy signals',
      highlights: [
        { label: 'Active ICPs', value: String(icps.length), tone: 'indigo' },
        { label: 'No leads 30d', value: String(dormantIcps.length), tone: dormantIcps.length > 0 ? 'amber' : 'emerald' },
        { label: 'Unused packages', value: String(unusedPkgs.length), tone: unusedPkgs.length > 0 ? 'amber' : 'emerald' },
      ],
      bullets: [
        ...dormantIcps.slice(0, 3).map((i: any) => `🎯 ICP "${i.name}" — no leads in last 30d`),
        ...unusedPkgs.slice(0, 2).map((p: any) => `📦 Package "${p.name}" — never proposed`),
      ],
      status: dormantIcps.length > 0 || unusedPkgs.length > 0 ? 'attention' : 'ok',
      context: { active_icps: icps.length, dormant_icps: dormantIcps.length, active_packages: pkgs.length, unused_packages: unusedPkgs.length },
    };
  } catch { return null; }
}

// ── upcoming ──────────────────────────────────────────────────────
async function loadUpcoming(ctx: LoaderCtx): Promise<CategoryData | null> {
  try {
    const today = isoDay(ctx.now);
    const weekOut = isoDay(addDays(ctx.now, 7));
    const [evRes, taskRes] = await Promise.all([
      ctx.db.from('events').select('id, title, start_date, start_time').eq('tenant_id', ctx.tenantId).gte('start_date', today).lte('start_date', weekOut),
      ctx.db.from('tasks').select('id, title, start_date, priority').eq('tenant_id', ctx.tenantId).eq('completed', false).gte('start_date', today).lte('start_date', weekOut),
    ]);
    const events = (evRes.data || []) as any[];
    const tasks = (taskRes.data || []) as any[];
    const topItems = [
      ...events.slice(0, 4).map((e: any) => ({ kind: 'event', date: e.start_date, label: `📅 ${e.title}${e.start_time ? ` @${e.start_time}` : ''}` })),
      ...tasks.slice(0, 4).map((t: any) => ({ kind: 'task', date: t.start_date, label: `${t.priority === 'urgent' ? '🔥' : '✓'} ${t.title}` })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return {
      id: 'upcoming',
      title: "What's coming",
      highlights: [
        { label: 'Events 7d',    value: String(events.length), tone: 'zinc' },
        { label: 'Deadlines 7d', value: String(tasks.length),  tone: 'zinc' },
      ],
      bullets: topItems.slice(0, 5).map(i => `${i.date.slice(5)} · ${i.label}`),
      status: events.length + tasks.length > 0 ? 'ok' : 'empty',
      context: { events_7d: events.length, deadlines_7d: tasks.length },
    };
  } catch { return null; }
}

const LOADERS: Record<CategoryId, (ctx: LoaderCtx) => Promise<CategoryData | null>> = {
  today_load: loadTodayLoad,
  cashflow:   loadCashflow,
  pipeline:   loadPipeline,
  content:    loadContent,
  inbox:      loadInbox,
  team_kpis:  loadTeamKpis,
  strategy:   loadStrategy,
  upcoming:   loadUpcoming,
};

/** Run every loader whose category id is in `enabledIds`, in parallel. */
export async function loadEnabledCategories(
  ctx: LoaderCtx,
  enabledIds: CategoryId[],
): Promise<CategoryData[]> {
  const valid = enabledIds.filter(id => LOADERS[id]);
  const results = await Promise.all(valid.map(id => LOADERS[id](ctx).catch(() => null)));
  // Preserve the user's order. Drop nulls so failed loaders don't
  // surface as blank cards.
  return results.filter((r): r is CategoryData => r != null);
}

function daysAgo(dateStr: string, refIso: string): number {
  const a = new Date(dateStr + 'T12:00:00');
  const b = new Date(refIso + 'T12:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

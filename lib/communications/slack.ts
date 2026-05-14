/**
 * Slack — frontend helpers.
 *
 * Same architecture as gmail.ts: OAuth + raw Slack API calls happen in
 * Supabase Edge Functions (Phase 2). The frontend just kicks off the
 * connect flow and reads results back from our DB.
 */

import { supabase } from '../supabase';
import type { CommunicationMessage, SlackMonitoredChannel } from '../../types/communications';

// ── OAuth connect URL ─────────────────────────────────────────────────────
export async function getSlackConnectUrl(tenantId: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-connect?tenant_id=${tenantId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`slack-connect failed: ${res.status}`);
  const { auth_url } = await res.json();
  return auth_url as string;
}

// ── List Slack channels available for monitoring ──────────────────────────
// Edge fn: slack-channels — lists channels the bot has access to AND
// returns the bot's actual identity (so the UI can show the exact
// `/invite @<handle>` command instead of guessing from the workspace name).
// Frontend uses this to populate the multi-select in IntegrationSettings
// + render the invite hint.
export interface AvailableSlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
  num_members: number | null;
}

export interface SlackBotIdentity {
  user_id: string;
  /** The legacy username — what /invite @<this> actually accepts. */
  handle: string | null;
  /** What Slack shows in messages/UI. */
  display_name: string | null;
}

export interface SlackChannelsResult {
  bot: SlackBotIdentity | null;
  channels: AvailableSlackChannel[];
}

export async function listAvailableSlackChannels(
  tenantId: string,
  integrationTokenId: string,
): Promise<SlackChannelsResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-channels?tenant_id=${tenantId}&integration_token_id=${integrationTokenId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`slack-channels failed: ${res.status}`);
  const data = await res.json() as Partial<SlackChannelsResult>;
  return {
    bot: data.bot || null,
    channels: data.channels || [],
  };
}

// ── Toggle which channels are monitored ───────────────────────────────────
// Direct Supabase mutation — no edge fn needed. RLS already scopes to the
// caller's tenant.
//
// Now preserves the project_id mapping per channel: we read the existing
// rows BEFORE deleting and carry their project_id into the inserts. So
// re-toggling a channel doesn't wipe the channel→project link the user
// already configured.
export async function setMonitoredChannels(
  tenantId: string,
  integrationTokenId: string,
  channels: AvailableSlackChannel[],
): Promise<SlackMonitoredChannel[]> {
  // 1. Snapshot existing project_id mappings keyed by channel_id so we can
  //    re-apply them after the replace-all.
  const { data: existing } = await supabase
    .from('slack_monitored_channels')
    .select('channel_id, project_id')
    .eq('integration_token_id', integrationTokenId);
  const projectByChannel = new Map<string, string | null>();
  (existing || []).forEach((r: any) => {
    if (r.project_id) projectByChannel.set(r.channel_id, r.project_id);
  });

  const { error: delErr } = await supabase
    .from('slack_monitored_channels')
    .delete()
    .eq('integration_token_id', integrationTokenId);
  if (delErr) throw delErr;

  if (channels.length === 0) return [];
  const { data, error } = await supabase
    .from('slack_monitored_channels')
    .insert(
      channels.map(c => ({
        tenant_id: tenantId,
        integration_token_id: integrationTokenId,
        channel_id: c.id,
        channel_name: c.name,
        channel_type: c.is_private ? 'private' : 'public',
        is_active: true,
        project_id: projectByChannel.get(c.id) || null,
      })),
    )
    .select();
  if (error) throw error;
  return data as SlackMonitoredChannel[];
}

// ── Update which events a monitored channel subscribes to ────────────────
// notify_events is a jsonb array of SlackProjectEvent strings. Default at
// migration time is ["task_completed","milestone_paid","project_completed"]
// (task_created OFF). Use this helper to flip individual events on/off.
export async function setSlackChannelNotifyEvents(
  monitoredChannelRowId: string,
  events: SlackProjectEvent[],
): Promise<void> {
  const { error } = await supabase
    .from('slack_monitored_channels')
    .update({ notify_events: events })
    .eq('id', monitoredChannelRowId);
  if (error) throw error;
}

// ── Link a monitored channel to a project (or unlink with null) ──────────
// Updates slack_monitored_channels.project_id directly. After this call
// every NEW message arriving from that channel will have its
// matched_project_id auto-populated by slack-events / slack-sync.
//
// Existing messages from before the link are not retroactively re-tagged
// (they were classified at insert time). If you need to backfill, run
// an UPDATE manually or ask the AI to re-classify.
export async function linkSlackChannelToProject(
  monitoredChannelRowId: string,
  projectId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('slack_monitored_channels')
    .update({ project_id: projectId })
    .eq('id', monitoredChannelRowId);
  if (error) throw error;
}

// ── Post a message INTO a Slack channel (outbound) ────────────────────────
// Edge fn: slack-notify — uses the connected workspace's bot token to call
// chat.postMessage. Used for manual "send to channel" actions and for
// automatic notifications (new lead, approved proposal, etc).
//
// channel_id is optional: when omitted we use the per-workspace default
// stored in integration_tokens.slack_notify_channel_id (set in Settings).
export async function postToSlack(args: {
  tenantId: string;
  channelId?: string;
  text: string;
  blocks?: any[];
  integrationTokenId?: string;
}): Promise<{ ok: true; ts: string; channel: string; workspace?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-notify`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: args.tenantId,
        channel_id: args.channelId,
        text: args.text,
        blocks: args.blocks,
        integration_token_id: args.integrationTokenId,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `slack-notify failed: ${res.status}`);
  }
  return res.json();
}

// ── Set / clear the default notification channel for a workspace ─────────
// Direct table update — no edge fn needed. RLS scopes to the caller's tenant.
// Pass null to clear it (notifications won't auto-send anywhere until reset).
export async function setSlackNotifyChannel(
  integrationTokenId: string,
  channelId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('integration_tokens')
    .update({ slack_notify_channel_id: channelId })
    .eq('id', integrationTokenId);
  if (error) throw error;
}

// ── Notify Slack when something happens to a project ─────────────────────
// Generic dispatcher: looks up every active channel linked to the project,
// filters by per-channel `notify_events` jsonb subscription, builds the
// right Block Kit message per event type, and posts via slack-notify.
//
// Best-effort: errors are collected, never thrown. A failed Slack post
// never blocks the underlying mutation (task save / income save / etc).
//
// Supported events:
//   - task_created       a new task was added under the project
//   - task_started       a task transitioned to status='in-progress'
//   - task_completed     a task transitioned to status='done'
//   - milestone_paid     an income installment was marked paid
//   - project_started    project status flipped to 'Active' (kickoff digest)
//   - project_completed  the project itself moved to status='Completed'
export type SlackProjectEvent =
  | 'task_created'
  | 'task_started'
  | 'task_completed'
  | 'milestone_paid'
  | 'project_started'
  | 'project_completed';

export interface SlackProjectEventPayload {
  tenantId: string;
  projectId: string;
  event: SlackProjectEvent;
  /** What this event is about — title of the task / income / project. */
  itemTitle: string;
  /** Optional pre-resolved project name; auto-fetched if missing. */
  projectName?: string | null;
  /** Optional actor (e.g. 'Eneas Aldabe'). Renders as a context line. */
  actorName?: string | null;
  /** Optional money amount for milestone_paid (e.g. 2300). */
  amount?: number | null;
  currency?: string | null;
  /** Optional priority — surfaced as a small badge for task_created. */
  priority?: string | null;
  /** Optional ISO date for task_created — when present, surfaced as
   *  "Due Aug 22" in the Slack message so the team can see deadlines
   *  rolling into the channel as tasks get created. */
  dueDate?: string | null;
  /** Optional assignee display name for task_created. */
  assigneeName?: string | null;
  /** For task_started/task_completed events — the task's id so the
   *  helper can fetch its subtasks + parent context to render a richer
   *  message (subtasks checklist, parent breadcrumb). */
  taskId?: string | null;
}

interface EventCopy { emoji: string; headline: string }

const EVENT_COPY: Record<SlackProjectEvent, EventCopy> = {
  task_created:       { emoji: '🆕', headline: 'New task' },
  task_started:       { emoji: '▶️', headline: 'Task started' },
  task_completed:     { emoji: '✅', headline: 'Task completed' },
  milestone_paid:     { emoji: '💰', headline: 'Installment paid' },
  project_started:    { emoji: '🚀', headline: 'Project started' },
  project_completed:  { emoji: '🏁', headline: 'Project completed' },
};

const fmtMoney = (n: number, curr: string) =>
  `${curr} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// ── Project kickoff digest ────────────────────────────────────────────────
// Fetches the project row + open tasks + scheduled income milestones, then
// groups tasks by timeframe relative to today. Output is Block Kit JSON
// suitable for slack-notify. Designed to be readable in one screen on
// mobile Slack — bucketed by date, not a 40-row dump.
async function buildProjectKickoffBlocks(
  payload: SlackProjectEventPayload,
  projectName: string | null,
): Promise<{ text: string; blocks: any[] }> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
  const endOfNextWeek = new Date(endOfWeek); endOfNextWeek.setDate(endOfWeek.getDate() + 7);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  // Pull everything we need in parallel — best-effort, any failure just
  // means a less complete digest, never a thrown error.
  const [projectRes, tasksRes, milestonesRes] = await Promise.all([
    supabase.from('projects')
      .select('title, deadline, budget, currency, description, client_id')
      .eq('id', payload.projectId).maybeSingle(),
    supabase.from('tasks')
      .select('id, title, start_date, due_date, priority, status, parent_task_id, completed')
      .eq('project_id', payload.projectId)
      .neq('status', 'cancelled')
      .order('start_date', { ascending: true, nullsFirst: false }),
    supabase.from('income_installments')
      .select('amount, currency, due_date, number, status, incomes!inner(project_id, currency, concept)')
      .eq('incomes.project_id', payload.projectId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
  ]);

  const project = (projectRes.data as any) || {};
  const allTasks = (tasksRes.data as any[]) || [];
  // Only parent tasks for the digest, and exclude already-done ones.
  const tasks = allTasks.filter(t => !t.parent_task_id && !t.completed);

  // Bucket tasks by upcoming timeframe.
  const buckets: Record<string, any[]> = {
    'This week':   [],
    'Next week':   [],
    'This month':  [],
    'Later':       [],
    'No date':     [],
  };
  for (const t of tasks) {
    const dStr = t.start_date || t.due_date;
    if (!dStr) { buckets['No date'].push(t); continue; }
    const d = new Date(String(dStr).slice(0, 10) + 'T12:00:00');
    if (d <= endOfWeek)      buckets['This week'].push(t);
    else if (d <= endOfNextWeek) buckets['Next week'].push(t);
    else if (d <= endOfMonth)    buckets['This month'].push(t);
    else                          buckets['Later'].push(t);
  }

  const totalOpen = tasks.length;
  const totalAll = allTasks.filter(t => !t.parent_task_id).length;
  const subtasksCount = allTasks.filter(t => !!t.parent_task_id).length;

  // Header
  const headline = `🚀 Project started — *${projectName || project.title || 'Project'}*`;
  const subBits: string[] = [];
  if (project.budget) subBits.push(`Budget *${fmtMoney(Number(project.budget) || 0, project.currency || 'USD')}*`);
  if (project.deadline) {
    const dl = new Date(String(project.deadline).slice(0, 10) + 'T12:00:00');
    subBits.push(`Deadline *${dl.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}*`);
  }
  subBits.push(`*${totalOpen}* open ${totalOpen === 1 ? 'task' : 'tasks'}${subtasksCount ? ` (+${subtasksCount} subtasks)` : ''}`);

  const blocks: any[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${headline}\n${subBits.join(' · ')}` },
    },
    { type: 'divider' },
  ];

  // Bucket sections — render only buckets that have content
  const ORDER = ['This week', 'Next week', 'This month', 'Later', 'No date'] as const;
  for (const key of ORDER) {
    const items = buckets[key];
    if (!items.length) continue;
    const lines = items.slice(0, 6).map(t => {
      const dateLabel = t.start_date || t.due_date;
      const dateBit = dateLabel
        ? ` _(${new Date(String(dateLabel).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })})_`
        : '';
      const priBit = (t.priority === 'urgent' || t.priority === 'high') ? ` *${t.priority.toUpperCase()}*` : '';
      return `• ${t.title}${dateBit}${priBit}`;
    });
    if (items.length > 6) lines.push(`_…+${items.length - 6} more in this bucket_`);
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${key}* — ${items.length} ${items.length === 1 ? 'task' : 'tasks'}\n${lines.join('\n')}` },
    });
  }

  // Milestones strip
  const installments = (milestonesRes.data as any[]) || [];
  if (installments.length > 0) {
    const lines = installments.slice(0, 5).map(inst => {
      const dueStr = inst.due_date
        ? new Date(String(inst.due_date).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
        : 'TBD';
      const paidBadge = inst.status === 'paid' ? '✅' : '⏳';
      return `${paidBadge} #${inst.number} · ${fmtMoney(Number(inst.amount) || 0, inst.currency || project.currency || 'USD')} · _${dueStr}_`;
    });
    if (installments.length > 5) lines.push(`_…+${installments.length - 5} more milestones_`);
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Billing milestones*\n${lines.join('\n')}` },
    });
  }

  // Footer
  const footerBits: string[] = [];
  if (payload.actorName) footerBits.push(`Kicked off by *${payload.actorName}*`);
  footerBits.push(`${totalAll} total ${totalAll === 1 ? 'task' : 'tasks'}`);
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: footerBits.join(' · ') }],
  });

  const text = `🚀 Project started — ${projectName || project.title || 'Project'} (${totalOpen} open tasks)`;
  return { text, blocks };
}

// ── Task transition (started / completed) digest ──────────────────────────
// Pulls the task's subtasks + parent context so the channel sees the full
// breakdown — not just the title. Renders a checklist of subtasks with
// ✓ / ○ markers, the parent task as a breadcrumb, and progress count.
async function buildTaskTransitionBlocks(
  payload: SlackProjectEventPayload,
  projectName: string | null,
): Promise<{ text: string; blocks: any[] }> {
  const isCompleted = payload.event === 'task_completed';
  const emoji = isCompleted ? '✅' : '▶️';
  const headline = isCompleted ? 'Task completed' : 'Task started';

  // Pull the task itself so we have description/dates if the caller
  // didn't provide them — and the parent task for breadcrumb context.
  const [taskRes, subtasksRes] = await Promise.all([
    supabase.from('tasks')
      .select('id, title, description, status, priority, start_date, due_date, completed, completed_at, parent_task_id, started_at')
      .eq('id', payload.taskId!)
      .maybeSingle(),
    supabase.from('tasks')
      .select('id, title, status, completed, priority, due_date')
      .eq('parent_task_id', payload.taskId!)
      .order('order_index', { ascending: true }),
  ]);
  const task = (taskRes.data as any) || {};
  const subtasks = (subtasksRes.data as any[]) || [];

  let parent: any = null;
  if (task.parent_task_id) {
    const { data } = await supabase.from('tasks')
      .select('title')
      .eq('id', task.parent_task_id)
      .maybeSingle();
    parent = data || null;
  }

  // Counters for the subtask checklist
  const doneSubs = subtasks.filter(s => s.completed || s.status === 'done').length;
  const totalSubs = subtasks.length;

  // Header line — task title + emoji + project + parent breadcrumb
  const titleParts: string[] = [`${emoji} ${headline}`, `*${payload.itemTitle}*`];
  if (projectName) titleParts.push(`_${projectName}_`);

  const blocks: any[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: titleParts.join('\n') },
    },
  ];

  // Breadcrumb context — "↳ part of <Parent Task>"
  if (parent?.title) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `↳ part of *${parent.title}*` }],
    });
  }

  // Optional description (truncated)
  if (task.description) {
    const desc = String(task.description).trim();
    const trimmed = desc.length > 200 ? desc.slice(0, 197) + '…' : desc;
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `> ${trimmed.replace(/\n/g, '\n> ')}` },
    });
  }

  // Subtasks checklist — only if there are any
  if (totalSubs > 0) {
    const lines = subtasks.slice(0, 12).map(s => {
      const isDone = s.completed || s.status === 'done';
      const mark = isDone ? '✓' : '○';
      const dueBit = s.due_date
        ? ` _(${new Date(String(s.due_date).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })})_`
        : '';
      const priBit = (s.priority === 'urgent' || s.priority === 'high') ? ` *${String(s.priority).toUpperCase()}*` : '';
      const titleStr = isDone ? `~${s.title}~` : s.title;
      return `${mark} ${titleStr}${dueBit}${priBit}`;
    });
    if (subtasks.length > 12) lines.push(`_…+${subtasks.length - 12} more subtasks_`);
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Subtasks · ${doneSubs}/${totalSubs} done*\n${lines.join('\n')}` },
    });
  }

  // Footer context — actor, due date, duration if completed
  const footerBits: string[] = [];
  if (payload.actorName) footerBits.push(isCompleted ? `Closed by *${payload.actorName}*` : `Started by *${payload.actorName}*`);
  if (payload.assigneeName) footerBits.push(`Assigned to *${payload.assigneeName}*`);
  if (task.due_date) {
    const d = new Date(String(task.due_date).slice(0, 10) + 'T12:00:00');
    footerBits.push(`Due *${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}*`);
  }
  if (task.priority && task.priority !== 'medium') {
    footerBits.push(`priority *${task.priority}*`);
  }
  // Duration calc when completed (started_at → completed_at)
  if (isCompleted && task.started_at && task.completed_at) {
    const ms = new Date(task.completed_at).getTime() - new Date(task.started_at).getTime();
    if (ms > 0) {
      const h = Math.floor(ms / 3_600_000);
      if (h < 24) footerBits.push(`took *${h}h*`);
      else footerBits.push(`took *${Math.round(h / 24)}d*`);
    }
  }
  if (footerBits.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: footerBits.join(' · ') }],
    });
  }

  const text = `${emoji} ${headline} — ${payload.itemTitle}${totalSubs > 0 ? ` (${doneSubs}/${totalSubs} subtasks done)` : ''}`;
  return { text, blocks };
}

export async function notifySlackProjectEvent(payload: SlackProjectEventPayload): Promise<{ posted: number; errors: string[] }> {
  const errors: string[] = [];
  if (!payload.projectId) return { posted: 0, errors };

  // 1. All active channels linked to this project.
  const { data: links, error } = await supabase
    .from('slack_monitored_channels')
    .select('channel_id, channel_name, integration_token_id, notify_events')
    .eq('tenant_id', payload.tenantId)
    .eq('project_id', payload.projectId)
    .eq('is_active', true);
  if (error) {
    errors.push(error.message);
    return { posted: 0, errors };
  }
  if (!links || links.length === 0) return { posted: 0, errors };

  // 2. Filter by per-channel event subscription.
  const subscribed = links.filter((l: any) => {
    const events = Array.isArray(l.notify_events) ? l.notify_events : [];
    return events.includes(payload.event);
  });
  if (subscribed.length === 0) return { posted: 0, errors };

  // 3. Resolve project name on demand.
  let projectName = payload.projectName ?? null;
  if (!projectName) {
    try {
      const { data: proj } = await supabase
        .from('projects').select('title').eq('id', payload.projectId).maybeSingle();
      projectName = (proj as any)?.title || null;
    } catch { /* ignore */ }
  }

  // 4. Build the message.
  const copy = EVENT_COPY[payload.event];
  const projectLine = projectName ? `_${projectName}_` : '';
  const amountLine = (payload.amount != null && payload.amount > 0)
    ? `\n*${fmtMoney(payload.amount, payload.currency || 'USD')}*`
    : '';
  const priorityBadge = payload.priority && payload.priority !== 'medium'
    ? ` · priority ${payload.priority}` : '';

  let text: string;
  let blocks: any[];

  if (payload.event === 'project_started') {
    // Rich kickoff digest — pulls tasks + milestones + budget and groups
    // tasks by upcoming timeframe ("This week / Next week / This month /
    // Later / No date"). Tells the team what's coming and when.
    const kickoff = await buildProjectKickoffBlocks(payload, projectName);
    text = kickoff.text;
    blocks = kickoff.blocks;
  } else if ((payload.event === 'task_started' || payload.event === 'task_completed') && payload.taskId) {
    // Rich task-transition message — pulls subtasks (with checkmarks for
    // done ones) and the parent task as breadcrumb, so the channel sees
    // exactly what's progressing and how much of the parent is left.
    const transition = await buildTaskTransitionBlocks(payload, projectName);
    text = transition.text;
    blocks = transition.blocks;
  } else {
    // Build the "Due Aug 22" line for task_created (and task_completed
    // — useful as a log of "X was due on Y, marked done today").
    let dueLine = '';
    if (payload.dueDate) {
      try {
        const d = new Date(String(payload.dueDate).slice(0, 10) + 'T12:00:00');
        if (!isNaN(d.getTime())) {
          dueLine = `\n📅 Due ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
      } catch { /* ignore */ }
    }

    text = `${copy.emoji} ${copy.headline} — ${payload.itemTitle}`;
    blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${copy.emoji} ${copy.headline}\n*${payload.itemTitle}*${amountLine}${dueLine}${projectLine ? `\n${projectLine}` : ''}`,
        },
      },
    ];
    const contextLines: string[] = [];
    if (payload.assigneeName) contextLines.push(`Assigned to *${payload.assigneeName}*`);
    if (payload.actorName) contextLines.push(`By ${payload.actorName}`);
    if (priorityBadge) contextLines.push(priorityBadge.replace(' · ', ''));
    if (contextLines.length > 0) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: contextLines.join(' · ') }],
      });
    }
  }

  // 5. Post to each subscribed channel.
  let posted = 0;
  for (const link of subscribed) {
    try {
      await postToSlack({
        tenantId: payload.tenantId,
        channelId: link.channel_id,
        text,
        blocks,
        integrationTokenId: link.integration_token_id || undefined,
      });
      posted++;
    } catch (err: any) {
      errors.push(`#${link.channel_name}: ${err?.message || 'failed'}`);
    }
  }
  return { posted, errors };
}

// Back-compat shim — keeps the older callsite working until we delete it.
// New code should call notifySlackProjectEvent directly.
export async function notifyTaskCompletedToSlack(args: {
  tenantId: string;
  task: { id: string; title: string; project_id?: string | null };
  projectName?: string | null;
  completedByName?: string;
}): Promise<{ posted: number; errors: string[] }> {
  if (!args.task.project_id) return { posted: 0, errors: [] };
  return notifySlackProjectEvent({
    tenantId: args.tenantId,
    projectId: args.task.project_id,
    event: 'task_completed',
    itemTitle: args.task.title,
    projectName: args.projectName,
    actorName: args.completedByName || null,
  });
}

// ── Pull recent messages from monitored channels ──────────────────────────
// Edge fn: slack-sync — calls conversations.history on each channel listed
// in slack_monitored_channels and inserts new messages into
// communication_messages. Idempotent (deduped by channel_id:ts).
//
// Called from the manual "Sync now" button AND from the auto-poll interval
// in pages/Communications.tsx.
export async function syncSlack(
  tenantId: string,
  opts: { hours?: number } = {},
): Promise<{ synced: number; errors: string[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-sync`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenant_id: tenantId, hours: opts.hours ?? 24 }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `slack-sync failed: ${res.status}`);
  }
  return res.json();
}

// ── Send Slack reply ──────────────────────────────────────────────────────
// Same edge fn as gmail (comm-reply) — it routes by platform.
export async function sendSlackReply(args: {
  message_id: string;
  body: string;
  edited_from_draft?: boolean;
}): Promise<CommunicationMessage> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comm-reply`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `comm-reply failed: ${res.status}`);
  }
  return res.json();
}

// ── Display helpers ───────────────────────────────────────────────────────
/** Slack messages can use mrkdwn — extract a plain preview for the inbox list. */
export function slackTextToPreview(text: string): string {
  if (!text) return '';
  return text
    // <@U123|name> → @name
    .replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_, _id, name) => `@${name || 'user'}`)
    // <#C123|chan> → #chan
    .replace(/<#([A-Z0-9]+)(?:\|([^>]+))?>/g, (_, _id, name) => `#${name || 'channel'}`)
    // <https://example.com|label> → label, <https://example.com> → URL
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    // basic mrkdwn → plain
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

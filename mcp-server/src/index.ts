#!/usr/bin/env node
/**
 * LIVV OS — MCP server
 * ──────────────────────────────────────────────────────────────────
 * Exposes a focused set of dashboard operations (tasks, projects,
 * leads, calendar, finance, brief) as MCP tools so Claude Code (or
 * any MCP-compatible client) can manage your workspace directly.
 *
 * Auth model
 *   • Uses the Supabase service-role key to bypass RLS — this server
 *     is for the workspace OWNER, not for multi-user delegation.
 *   • Every read/write is hard-scoped to the LIVVOS_TENANT_ID env
 *     var so a typo in a tool argument can never cross workspaces.
 *
 * Transport
 *   • stdio (default) — works with Claude Code, Claude Desktop, and
 *     any MCP client that spawns a process.
 *
 * To add a tool, append an entry to TOOLS and a case to the dispatch
 * switch in callTool(). Each tool's input schema is a Zod object so
 * we validate args before they reach Supabase.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ── Env ────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_ID = process.env.LIVVOS_TENANT_ID;
const OWNER_USER_ID = process.env.LIVVOS_OWNER_USER_ID || null;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || null;
const USER_JWT = process.env.LIVVOS_USER_JWT || null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TENANT_ID) {
  // Log to stderr — stdout is reserved for the MCP protocol stream.
  console.error(
    '[livvos-mcp] missing required env vars. Need SUPABASE_URL, ' +
      'SUPABASE_SERVICE_ROLE_KEY, LIVVOS_TENANT_ID. See .env.example.',
  );
  process.exit(1);
}

const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ────────────────────────────────────────────────────────
const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const json = (obj: unknown) => ok(JSON.stringify(obj, null, 2));
const err = (msg: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: `Error: ${msg}` }],
});

const today = () => new Date().toISOString().slice(0, 10);

async function resolveOwnerId(): Promise<string | null> {
  if (OWNER_USER_ID) return OWNER_USER_ID;
  // Fallback: first member of this tenant — usually the owner.
  const { data } = await db
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', TENANT_ID)
    .limit(1)
    .maybeSingle();
  return data?.user_id || null;
}

// ── Zod schemas for tool inputs ───────────────────────────────────
const ListTasksInput = z.object({
  status: z.enum(['todo', 'in-progress', 'done', 'cancelled', 'open', 'all']).default('open'),
  assignee_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  due_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_after: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

const CreateTaskInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  project_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  assignee_id: z.string().uuid().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

const UpdateTaskInput = z.object({
  id: z.string().uuid(),
  title: z.string().optional(),
  status: z.enum(['todo', 'in-progress', 'done', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
});

const IdInput = z.object({ id: z.string().uuid() });

const ListProjectsInput = z.object({
  status: z.enum(['active', 'paused', 'completed', 'cancelled', 'all']).default('active'),
  client_id: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const CreateProjectInput = z.object({
  title: z.string().min(1),
  client_id: z.string().uuid().optional(),
  description: z.string().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  budget: z.number().optional(),
  color: z.string().optional(),
});

const ListLeadsInput = z.object({
  status: z.enum(['new', 'contacted', 'following', 'closed', 'lost', 'all']).default('all'),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const UpdateLeadInput = z.object({
  id: z.string().uuid(),
  status: z.enum(['new', 'contacted', 'following', 'closed', 'lost']).optional(),
  owner_id: z.string().uuid().nullable().optional(),
  temperature: z.enum(['cold', 'warm', 'hot']).optional(),
  next_action: z.string().optional(),
  next_action_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const ListEventsInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

const CreateEventInput = z.object({
  title: z.string().min(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration: z.number().int().min(5).max(480).default(60),
  type: z.enum(['meeting', 'call', 'deadline', 'reminder', 'other']).default('meeting'),
  color: z.string().optional(),
  description: z.string().optional(),
});

const AskAdvisorInput = z.object({
  question: z.string().min(1),
  include_actions: z.boolean().default(false),
});

const FinanceSummaryInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ── Tool definitions (advertised via list_tools) ──────────────────
const TOOLS = [
  {
    name: 'whoami',
    description:
      'Connection check. Returns the tenant id, name, plus counts of tasks / projects / clients / leads. ' +
      'Call this first to confirm the MCP is wired correctly.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_tasks',
    description:
      'List tasks in the current workspace. Defaults to open (todo + in-progress, excluding done/cancelled). ' +
      'Supports filtering by status, assignee, project, and due-date range.',
    inputSchema: zodToJson(ListTasksInput),
  },
  {
    name: 'create_task',
    description:
      'Create a new task. Minimum required: title. Optionally attach to a project / client / assignee + set due date and priority.',
    inputSchema: zodToJson(CreateTaskInput),
  },
  {
    name: 'update_task',
    description:
      'Update an existing task by id. Pass only the fields you want to change. ' +
      'Setting status=done auto-flips completed=true and stamps completed_at.',
    inputSchema: zodToJson(UpdateTaskInput),
  },
  {
    name: 'complete_task',
    description: 'Shortcut for update_task with status=done.',
    inputSchema: zodToJson(IdInput),
  },
  {
    name: 'list_projects',
    description: 'List projects with optional status / client / search filters.',
    inputSchema: zodToJson(ListProjectsInput),
  },
  {
    name: 'create_project',
    description: 'Create a new project. Minimum required: title.',
    inputSchema: zodToJson(CreateProjectInput),
  },
  {
    name: 'list_clients',
    description: 'List all clients in the workspace, with their basic CRM info.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_leads',
    description: 'List leads with optional status filter. Returns id, name, company, status, temperature, budget, owner_id, next_action.',
    inputSchema: zodToJson(ListLeadsInput),
  },
  {
    name: 'update_lead',
    description:
      'Update a lead — status, owner, temperature, next_action, next_action_due. ' +
      'next_action + next_action_due live inside the existing ai_analysis JSONB so no schema migration is needed.',
    inputSchema: zodToJson(UpdateLeadInput),
  },
  {
    name: 'list_team_members',
    description: 'List active team members in the workspace (id, name, email, role).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_calendar_events',
    description: 'List calendar events in a date range (default = upcoming 14 days).',
    inputSchema: zodToJson(ListEventsInput),
  },
  {
    name: 'create_calendar_event',
    description: 'Create a calendar event. Minimum required: title + start_date.',
    inputSchema: zodToJson(CreateEventInput),
  },
  {
    name: 'get_brief_today',
    description:
      'Snapshot of today: overdue tasks count, due-today count, events today, pending messages, latest AI synthesis text if any. ' +
      'Mirrors the data the Brief page shows.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_finance_summary',
    description: 'Income / expense / balance totals for a period (default = current month).',
    inputSchema: zodToJson(FinanceSummaryInput),
  },
  {
    name: 'ask_advisor',
    description:
      'Send a question to the AI Advisor (calls the gemini edge function as advisor_chat or advisor_chat_actions). ' +
      'Requires SUPABASE_ANON_KEY + LIVVOS_USER_JWT env vars. Without them, returns an instruction to set them.',
    inputSchema: zodToJson(AskAdvisorInput),
  },
];

// ── Server boot ───────────────────────────────────────────────────
const server = new Server(
  { name: 'livvos-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: rawArgs } = req.params;
  try {
    switch (name) {
      case 'whoami':              return await whoami();
      case 'list_tasks':          return await listTasks(ListTasksInput.parse(rawArgs ?? {}));
      case 'create_task':         return await createTask(CreateTaskInput.parse(rawArgs ?? {}));
      case 'update_task':         return await updateTask(UpdateTaskInput.parse(rawArgs ?? {}));
      case 'complete_task':       return await completeTask(IdInput.parse(rawArgs ?? {}));
      case 'list_projects':       return await listProjects(ListProjectsInput.parse(rawArgs ?? {}));
      case 'create_project':      return await createProject(CreateProjectInput.parse(rawArgs ?? {}));
      case 'list_clients':        return await listClients();
      case 'list_leads':          return await listLeads(ListLeadsInput.parse(rawArgs ?? {}));
      case 'update_lead':         return await updateLead(UpdateLeadInput.parse(rawArgs ?? {}));
      case 'list_team_members':   return await listTeamMembers();
      case 'list_calendar_events':return await listCalendarEvents(ListEventsInput.parse(rawArgs ?? {}));
      case 'create_calendar_event':return await createCalendarEvent(CreateEventInput.parse(rawArgs ?? {}));
      case 'get_brief_today':     return await getBriefToday();
      case 'get_finance_summary': return await getFinanceSummary(FinanceSummaryInput.parse(rawArgs ?? {}));
      case 'ask_advisor':         return await askAdvisor(AskAdvisorInput.parse(rawArgs ?? {}));
      default:                    return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err((e as Error).message || String(e));
  }
});

// ── Tool implementations ──────────────────────────────────────────

async function whoami() {
  const [{ data: tenant }, tasks, projects, clients, leads] = await Promise.all([
    db.from('tenants').select('id, name, plan').eq('id', TENANT_ID).maybeSingle(),
    db.from('tasks').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID),
    db.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID),
    db.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID),
  ]);
  return json({
    ok: true,
    server: 'livvos-mcp v0.1.0',
    tenant_id: TENANT_ID,
    tenant_name: tenant?.name || '(unknown)',
    plan: tenant?.plan || null,
    counts: {
      tasks:    tasks.count    ?? 0,
      projects: projects.count ?? 0,
      clients:  clients.count  ?? 0,
      leads:    leads.count    ?? 0,
    },
    tools: TOOLS.length,
  });
}

async function listTasks(args: z.infer<typeof ListTasksInput>) {
  let q = db
    .from('tasks')
    .select('id, title, status, priority, assignee_id, project_id, client_id, start_date, completed, completed_at, created_at, parent_task_id, owner_id')
    .eq('tenant_id', TENANT_ID)
    .is('parent_task_id', null)
    .order('start_date', { ascending: true, nullsFirst: false })
    .limit(args.limit);

  if (args.status === 'open')        q = q.eq('completed', false).neq('status', 'cancelled');
  else if (args.status !== 'all')    q = q.eq('status', args.status);
  if (args.assignee_id)              q = q.eq('assignee_id', args.assignee_id);
  if (args.project_id)               q = q.eq('project_id', args.project_id);
  if (args.due_before)               q = q.lte('start_date', args.due_before);
  if (args.due_after)                q = q.gte('start_date', args.due_after);
  if (args.search)                   q = q.ilike('title', `%${args.search}%`);

  const { data, error } = await q;
  if (error) return err(error.message);
  return json({ count: data?.length ?? 0, tasks: data });
}

async function createTask(args: z.infer<typeof CreateTaskInput>) {
  const owner = await resolveOwnerId();
  const { data, error } = await db
    .from('tasks')
    .insert({
      tenant_id: TENANT_ID,
      owner_id: owner,
      title: args.title,
      description: args.description ?? null,
      project_id: args.project_id ?? null,
      client_id: args.client_id ?? null,
      assignee_id: args.assignee_id ?? null,
      start_date: args.due_date ?? null,
      priority: args.priority,
      status: 'todo',
      completed: false,
    })
    .select('*')
    .single();
  if (error) return err(error.message);
  return json({ ok: true, task: data });
}

async function updateTask(args: z.infer<typeof UpdateTaskInput>) {
  const updates: Record<string, unknown> = {};
  if (args.title !== undefined)       updates.title = args.title;
  if (args.priority !== undefined)    updates.priority = args.priority;
  if (args.due_date !== undefined)    updates.start_date = args.due_date;
  if (args.assignee_id !== undefined) updates.assignee_id = args.assignee_id;
  if (args.project_id !== undefined)  updates.project_id = args.project_id;
  if (args.status !== undefined) {
    updates.status = args.status;
    updates.completed = args.status === 'done';
    updates.completed_at = args.status === 'done' ? new Date().toISOString() : null;
  }
  const { data, error } = await db
    .from('tasks')
    .update(updates)
    .eq('id', args.id)
    .eq('tenant_id', TENANT_ID)
    .select('*')
    .single();
  if (error) return err(error.message);
  return json({ ok: true, task: data });
}

async function completeTask(args: { id: string }) {
  return updateTask({ id: args.id, status: 'done' });
}

async function listProjects(args: z.infer<typeof ListProjectsInput>) {
  let q = db
    .from('projects')
    .select('id, title, status, client_id, deadline, budget, currency, color, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(args.limit);
  if (args.status !== 'all')  q = q.eq('status', args.status);
  if (args.client_id)         q = q.eq('client_id', args.client_id);
  if (args.search)            q = q.ilike('title', `%${args.search}%`);
  const { data, error } = await q;
  if (error) return err(error.message);
  return json({ count: data?.length ?? 0, projects: data });
}

async function createProject(args: z.infer<typeof CreateProjectInput>) {
  const owner = await resolveOwnerId();
  const { data, error } = await db
    .from('projects')
    .insert({
      tenant_id: TENANT_ID,
      owner_id: owner,
      title: args.title,
      client_id: args.client_id ?? null,
      description: args.description ?? null,
      deadline: args.deadline ?? null,
      budget: args.budget ?? null,
      color: args.color ?? null,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) return err(error.message);
  return json({ ok: true, project: data });
}

async function listClients() {
  const { data, error } = await db
    .from('clients')
    .select('id, name, company, email, phone, status, color, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('name', { ascending: true });
  if (error) return err(error.message);
  return json({ count: data?.length ?? 0, clients: data });
}

async function listLeads(args: z.infer<typeof ListLeadsInput>) {
  let q = db
    .from('leads')
    .select('id, name, company, email, status, temperature, source, owner_id, ai_analysis, created_at, last_interaction')
    .eq('tenant_id', TENANT_ID)
    .order('last_interaction', { ascending: false, nullsFirst: false })
    .limit(args.limit);
  if (args.status !== 'all') q = q.eq('status', args.status);
  if (args.search)           q = q.or(`name.ilike.%${args.search}%,company.ilike.%${args.search}%,email.ilike.%${args.search}%`);
  const { data, error } = await q;
  if (error) return err(error.message);
  return json({ count: data?.length ?? 0, leads: data });
}

async function updateLead(args: z.infer<typeof UpdateLeadInput>) {
  // Fetch the current ai_analysis so we can merge next_action/due into it
  // without clobbering existing fields like summary / recommendation.
  const { data: current, error: fetchErr } = await db
    .from('leads')
    .select('ai_analysis')
    .eq('id', args.id)
    .eq('tenant_id', TENANT_ID)
    .maybeSingle();
  if (fetchErr) return err(fetchErr.message);

  const updates: Record<string, unknown> = {};
  if (args.status !== undefined)      updates.status = args.status;
  if (args.owner_id !== undefined)    updates.owner_id = args.owner_id;
  if (args.temperature !== undefined) updates.temperature = args.temperature;

  if (args.next_action !== undefined || args.next_action_due !== undefined) {
    updates.ai_analysis = {
      ...(current?.ai_analysis ?? {}),
      ...(args.next_action !== undefined ? { next_action: args.next_action } : {}),
      ...(args.next_action_due !== undefined ? { next_action_due: args.next_action_due } : {}),
    };
  }

  const { data, error } = await db
    .from('leads')
    .update(updates)
    .eq('id', args.id)
    .eq('tenant_id', TENANT_ID)
    .select('id, name, status, owner_id, temperature, ai_analysis')
    .single();
  if (error) return err(error.message);
  return json({ ok: true, lead: data });
}

async function listTeamMembers() {
  const { data, error } = await db
    .from('tenant_members')
    .select('user_id, role, status, profiles!inner(id, name, email)')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'active');
  if (error) return err(error.message);
  const flat = (data ?? []).map((m: any) => ({
    id:    m.user_id,
    name:  m.profiles?.name || null,
    email: m.profiles?.email || null,
    role:  m.role,
  }));
  return json({ count: flat.length, members: flat });
}

async function listCalendarEvents(args: z.infer<typeof ListEventsInput>) {
  const from = args.from || today();
  const to = args.to || (() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  })();
  const { data, error } = await db
    .from('events')
    .select('id, title, start_date, start_time, duration, type, color, description, client_id, project_id')
    .eq('tenant_id', TENANT_ID)
    .gte('start_date', from)
    .lte('start_date', to)
    .order('start_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })
    .limit(args.limit);
  if (error) return err(error.message);
  return json({ count: data?.length ?? 0, from, to, events: data });
}

async function createCalendarEvent(args: z.infer<typeof CreateEventInput>) {
  const owner = await resolveOwnerId();
  const { data, error } = await db
    .from('events')
    .insert({
      tenant_id: TENANT_ID,
      owner_id: owner,
      title: args.title,
      start_date: args.start_date,
      start_time: args.start_time ?? null,
      duration: args.duration,
      type: args.type,
      color: args.color ?? '#3b82f6',
      description: args.description ?? null,
    })
    .select('*')
    .single();
  if (error) return err(error.message);
  return json({ ok: true, event: data });
}

async function getBriefToday() {
  const todayKey = today();
  const [overdueRes, dueTodayRes, eventsTodayRes, pendingMsgRes] = await Promise.all([
    db.from('tasks').select('id, title, start_date, priority').eq('tenant_id', TENANT_ID)
      .is('parent_task_id', null).eq('completed', false).neq('status', 'cancelled')
      .lt('start_date', todayKey).order('start_date', { ascending: true }).limit(20),
    db.from('tasks').select('id, title, priority').eq('tenant_id', TENANT_ID)
      .is('parent_task_id', null).eq('completed', false).neq('status', 'cancelled')
      .eq('start_date', todayKey).limit(20),
    db.from('events').select('id, title, start_time, type').eq('tenant_id', TENANT_ID)
      .eq('start_date', todayKey).order('start_time', { ascending: true, nullsFirst: false }).limit(20),
    db.from('messages').select('id', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID).eq('status', 'pending'),
  ]);

  return json({
    date: todayKey,
    overdue: {
      count: overdueRes.data?.length ?? 0,
      items: overdueRes.data ?? [],
    },
    due_today: {
      count: dueTodayRes.data?.length ?? 0,
      items: dueTodayRes.data ?? [],
    },
    events_today: {
      count: eventsTodayRes.data?.length ?? 0,
      items: eventsTodayRes.data ?? [],
    },
    pending_messages: pendingMsgRes.count ?? 0,
  });
}

async function getFinanceSummary(args: z.infer<typeof FinanceSummaryInput>) {
  const todayDate = new Date();
  const fromIso = args.from || `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-01`;
  const toIso = args.to || (() => {
    const last = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
    return last.toISOString().slice(0, 10);
  })();

  const [incomeRes, expenseRes] = await Promise.all([
    db.from('incomes').select('amount, status').eq('tenant_id', TENANT_ID)
      .gte('date', fromIso).lte('date', toIso),
    db.from('expenses').select('amount, status').eq('tenant_id', TENANT_ID)
      .gte('date', fromIso).lte('date', toIso),
  ]);

  const sumWhere = (arr: any[], pred: (r: any) => boolean) =>
    (arr || []).filter(pred).reduce((s, r) => s + Number(r.amount || 0), 0);

  const income_total   = sumWhere(incomeRes.data ?? [],  () => true);
  const income_paid    = sumWhere(incomeRes.data ?? [],  (r) => r.status === 'paid');
  const income_pending = income_total - income_paid;
  const expense_total  = sumWhere(expenseRes.data ?? [], () => true);
  const expense_paid   = sumWhere(expenseRes.data ?? [], (r) => r.status === 'paid');
  const expense_pending = expense_total - expense_paid;

  return json({
    period: { from: fromIso, to: toIso },
    income:  { total: income_total, paid: income_paid, pending: income_pending },
    expense: { total: expense_total, paid: expense_paid, pending: expense_pending },
    balance: income_paid - expense_paid,
    projected_balance: income_total - expense_total,
  });
}

async function askAdvisor(args: z.infer<typeof AskAdvisorInput>) {
  if (!ANON_KEY || !USER_JWT) {
    return err(
      'ask_advisor requires SUPABASE_ANON_KEY + LIVVOS_USER_JWT env vars. ' +
      'Get a JWT by logging into the app and copying access_token from localStorage key sb-*-auth-token.',
    );
  }
  const type = args.include_actions ? 'advisor_chat_actions' : 'advisor_chat';

  // Build a minimal context — pull active projects + open tasks counts.
  const [{ data: projects }, { data: tasks }] = await Promise.all([
    db.from('projects').select('id, title, status').eq('tenant_id', TENANT_ID).eq('status', 'active').limit(20),
    db.from('tasks').select('id, title, priority, start_date, status, completed').eq('tenant_id', TENANT_ID)
      .is('parent_task_id', null).eq('completed', false).limit(30),
  ]);

  const context = JSON.stringify({
    projects: projects ?? [],
    tasks: tasks ?? [],
  }, null, 2);

  const payload = JSON.stringify({ context, history: [], question: args.question });

  const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${USER_JWT}`,
    },
    body: JSON.stringify({ type, input: payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    return err(`advisor call failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const body = (await res.json()) as { result?: { reply?: string; actions?: unknown[] } };
  return json({
    type,
    reply: body?.result?.reply ?? '(no reply)',
    actions: body?.result?.actions ?? [],
  });
}

// ── Boot ──────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[livvos-mcp] connected via stdio. Waiting for client…');

// ── Tiny zod-to-JSONSchema converter ──────────────────────────────
// Only handles the subset we use: object / string / number / boolean /
// enum / uuid pattern / regex / default / optional. Good enough for
// our tool schemas without pulling in zod-to-json-schema as a dep.
function zodToJson(schema: z.ZodType<any>): any {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as any)._def.shape();
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape) as [string, z.ZodType<any>][]) {
      const sub = zodToJson(value);
      properties[key] = sub;
      if (!(value instanceof z.ZodOptional || value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    return { type: 'object', properties, required, additionalProperties: false };
  }
  if (schema instanceof z.ZodOptional) return zodToJson((schema as any)._def.innerType);
  if (schema instanceof z.ZodDefault)  return { ...zodToJson((schema as any)._def.innerType), default: (schema as any)._def.defaultValue() };
  if (schema instanceof z.ZodNullable) return { ...zodToJson((schema as any)._def.innerType), nullable: true };
  if (schema instanceof z.ZodString) {
    const checks = (schema as any)._def.checks || [];
    const out: any = { type: 'string' };
    for (const c of checks) {
      if (c.kind === 'regex') out.pattern = c.regex.source;
      if (c.kind === 'uuid')  out.format = 'uuid';
      if (c.kind === 'min')   out.minLength = c.value;
    }
    return out;
  }
  if (schema instanceof z.ZodNumber) {
    const checks = (schema as any)._def.checks || [];
    const out: any = { type: 'number' };
    for (const c of checks) {
      if (c.kind === 'int')  out.type = 'integer';
      if (c.kind === 'min')  out.minimum = c.value;
      if (c.kind === 'max')  out.maximum = c.value;
    }
    return out;
  }
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: (schema as any)._def.values };
  }
  return {};
}

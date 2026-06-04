/**
 * Centralized action executor — single dispatcher for every ProposedAction
 * the orchestrator emits. Surfaces (Brief, AiAdvisor, future widgets)
 * call this instead of switching on `action.kind` themselves.
 *
 * Design rules:
 *   • Every kind lives in ONE place — adding a new action means editing
 *     one switch + the prompt menu in types.ts.
 *   • All writes route through the same Supabase client passed in
 *     ExecutionContext — RLS scopes by tenant.
 *   • Returns { ok, summary, error? } — caller flips its UI state by
 *     observing this.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProposedAction, ExecutionContext } from './types';

export interface ExecuteResult {
  ok: boolean;
  summary: string;
  error?: string;
  /** When the action created a new row, surface its id so the UI can
   *  link to it (e.g. "View the task you just created"). */
  newRowId?: string;
}

/** Helpers the executor needs from the calling surface. Keeps the
 *  executor decoupled from React contexts — Brief / AiAdvisor pass
 *  their concrete implementations in.
 *
 *  All helpers are optional. If an action's required helper is
 *  missing, the executor throws a clear error inside its case branch
 *  (no silent no-op). Surfaces that don't expose, say, deleteTask
 *  simply won't be able to handle a delete_task action — the AI
 *  shouldn't propose one in the first place, but defensively the
 *  user just sees "helper not provided" in the action card error. */
export interface ExecutorHelpers {
  /** Wraps CalendarContext.updateTask. */
  updateTask?: (id: string, patch: Record<string, any>) => Promise<any>;
  /** Wraps CalendarContext.createTask. */
  createTask?: (data: Record<string, any>) => Promise<any>;
  /** Wraps CalendarContext.deleteTask. */
  deleteTask?: (id: string) => Promise<any>;
  /** Wraps CalendarContext.updateEvent. */
  updateEvent?: (id: string, patch: Record<string, any>) => Promise<any>;
  /** Wraps CalendarContext.createEvent. */
  createEvent?: (data: Record<string, any>) => Promise<any>;
  /** Wraps CalendarContext.deleteEvent. */
  deleteEvent?: (id: string) => Promise<any>;
}

export async function executeProposedAction(
  action: ProposedAction,
  ctx: ExecutionContext,
  helpers: ExecutorHelpers = {},
): Promise<ExecuteResult> {
  try {
    switch (action.kind) {
      // ── Tasks ──
      case 'complete_task':
        if (!helpers.updateTask) throw new Error('updateTask helper not provided');
        await helpers.updateTask(action.params.task_id, { status: 'done', completed: true });
        return { ok: true, summary: 'Task marked done' };

      case 'reopen_task':
        if (!helpers.updateTask) throw new Error('updateTask helper not provided');
        await helpers.updateTask(action.params.task_id, { status: 'todo', completed: false });
        return { ok: true, summary: 'Task reopened' };

      case 'start_task':
        if (!helpers.updateTask) throw new Error('updateTask helper not provided');
        await helpers.updateTask(action.params.task_id, { status: 'in-progress', completed: false });
        return { ok: true, summary: 'Task moved to in-progress' };

      case 'update_task_priority':
        if (!helpers.updateTask) throw new Error('updateTask helper not provided');
        await helpers.updateTask(action.params.task_id, { priority: action.params.priority });
        return { ok: true, summary: `Priority set to ${action.params.priority}` };

      case 'update_task_due_date':
        if (!helpers.updateTask) throw new Error('updateTask helper not provided');
        await helpers.updateTask(action.params.task_id, {
          start_date: action.params.due_date,
          end_date: action.params.due_date,
        });
        return { ok: true, summary: `Due date moved to ${action.params.due_date}` };

      case 'create_task': {
        if (!helpers.createTask) throw new Error('createTask helper not provided');
        // If the agent passed an assignee_id, seed assignee_ids with
        // it. Without this, "create a task for Christie" would
        // create the task unassigned even when Christie's id was
        // resolved upstream.
        const assignees: string[] = action.params.assignee_id ? [action.params.assignee_id] : [];
        const created = await helpers.createTask({
          title: action.params.title,
          description: action.params.description,
          priority: action.params.priority || 'medium',
          status: 'todo',
          completed: false,
          owner_id: ctx.userId,
          project_id: action.params.project_id,
          client_id: action.params.client_id,
          start_date: action.params.due_date,
          assignee_ids: assignees,
          order_index: 0,
        });
        return { ok: true, summary: `Created task "${action.params.title}"`, newRowId: (created as any)?.id };
      }

      case 'create_task_group': {
        // One PARENT task + pipe-separated subtasks → keeps the board clean
        // instead of spraying many flat tasks. Each subtask may carry its own
        // owner as "Título @<uuid>"; otherwise it inherits the parent's.
        if (!helpers.createTask) throw new Error('createTask helper not provided');
        const parentAssignees: string[] = action.params.assignee_id ? [action.params.assignee_id] : [];
        const parent = await helpers.createTask({
          title: action.params.title,
          description: action.params.description,
          priority: action.params.priority || 'medium',
          status: 'todo',
          completed: false,
          owner_id: ctx.userId,
          project_id: action.params.project_id,
          client_id: action.params.client_id,
          start_date: action.params.due_date,
          assignee_ids: parentAssignees,
          order_index: 0,
        });
        const parentId = (parent as any)?.id;
        const subs = String(action.params.subtasks || '')
          .split('|').map(s => s.trim()).filter(Boolean);
        let made = 0;
        for (let i = 0; i < subs.length; i++) {
          let title = subs[i];
          let subAssignees = parentAssignees;
          const at = title.lastIndexOf('@');
          if (at > 0) {
            const maybe = title.slice(at + 1).trim();
            if (/^[0-9a-fA-F-]{16,}$/.test(maybe)) { subAssignees = [maybe]; title = title.slice(0, at).trim(); }
          }
          if (!title) continue;
          try {
            await helpers.createTask({
              title,
              priority: action.params.priority || 'medium',
              status: 'todo',
              completed: false,
              owner_id: ctx.userId,
              project_id: action.params.project_id,
              client_id: action.params.client_id,
              parent_task_id: parentId,
              assignee_ids: subAssignees,
              order_index: i + 1,
            });
            made++;
          } catch { /* skip a bad subtask, keep the rest */ }
        }
        return { ok: true, summary: `Created "${action.params.title}" with ${made} subtask${made === 1 ? '' : 's'}`, newRowId: parentId };
      }

      case 'assign_task': {
        if (!helpers.updateTask) throw new Error('updateTask helper not provided');
        // Single-assignee for now (covers the 95% case of "asignale
        // esto a X"). The DB column is assignee_ids[] so this
        // overwrites any previous assignees — which is the desired
        // semantics for a voice/chat "assign to Y" command.
        await helpers.updateTask(action.params.task_id, {
          assignee_ids: [action.params.assignee_id],
        });
        return { ok: true, summary: 'Task reassigned' };
      }

      case 'delete_task': {
        if (!helpers.deleteTask) throw new Error('deleteTask helper not provided');
        await helpers.deleteTask(action.params.task_id);
        return { ok: true, summary: 'Task deleted' };
      }

      // ── Finance ──
      case 'mark_installment_paid': {
        const today = (ctx.now || new Date()).toISOString().slice(0, 10);
        const { error } = await ctx.db.from('installments').update({
          status: 'paid',
          paid_date: action.params.paid_date || today,
        }).eq('id', action.params.installment_id);
        if (error) throw error;
        return { ok: true, summary: 'Installment marked paid' };
      }

      case 'mark_installment_pending': {
        const { error } = await ctx.db.from('installments').update({
          status: 'pending', paid_date: null,
        }).eq('id', action.params.installment_id);
        if (error) throw error;
        return { ok: true, summary: 'Installment marked pending' };
      }

      case 'create_expense': {
        const { data, error } = await ctx.db.from('expenses').insert({
          tenant_id: ctx.tenantId,
          concept: action.params.concept,
          amount: Number(action.params.amount),
          date: action.params.date,
          category: action.params.category || 'Operations',
          status: action.params.status || 'paid',
        }).select('id').single();
        if (error) throw error;
        return { ok: true, summary: `Expense "${action.params.concept}" logged`, newRowId: (data as any)?.id };
      }

      case 'create_income': {
        const { data, error } = await ctx.db.from('incomes').insert({
          tenant_id: ctx.tenantId,
          concept: action.params.concept,
          total_amount: Number(action.params.total_amount),
          due_date: action.params.due_date,
          client_id: action.params.client_id || null,
          project_id: action.params.project_id || null,
          status: 'pending',
        }).select('id').single();
        if (error) throw error;
        return { ok: true, summary: `Income "${action.params.concept}" logged`, newRowId: (data as any)?.id };
      }

      case 'delete_expense': {
        // tenant_id filter is the RLS belt-and-suspenders — RLS would
        // reject cross-tenant deletes anyway, but adding the eq
        // surfaces a row-not-found error instead of silently no-op'ing.
        const { error } = await ctx.db.from('expenses').delete()
          .eq('id', action.params.expense_id)
          .eq('tenant_id', ctx.tenantId);
        if (error) throw error;
        return { ok: true, summary: 'Expense deleted' };
      }

      case 'delete_income': {
        const { error } = await ctx.db.from('incomes').delete()
          .eq('id', action.params.income_id)
          .eq('tenant_id', ctx.tenantId);
        if (error) throw error;
        return { ok: true, summary: 'Income deleted' };
      }

      // ── Calendar ──
      case 'reschedule_event': {
        if (!helpers.updateEvent) throw new Error('updateEvent helper not provided');
        const patch: any = { start_date: action.params.new_date };
        if (action.params.new_time) patch.start_time = action.params.new_time;
        await helpers.updateEvent(action.params.event_id, patch);
        return { ok: true, summary: `Event moved to ${action.params.new_date}` };
      }

      case 'cancel_event': {
        if (!helpers.deleteEvent) throw new Error('deleteEvent helper not provided');
        await helpers.deleteEvent(action.params.event_id);
        return { ok: true, summary: 'Event canceled' };
      }

      case 'create_event': {
        if (!helpers.createEvent) throw new Error('createEvent helper not provided');
        const created = await helpers.createEvent({
          title: action.params.title,
          start_date: action.params.start_date,
          start_time: action.params.start_time,
          duration: Number(action.params.duration) || 60,
          type: action.params.type || 'meeting',
          owner_id: ctx.userId,
        });
        return { ok: true, summary: `Event "${action.params.title}" scheduled`, newRowId: (created as any)?.id };
      }

      case 'delete_event': {
        // Functionally identical to cancel_event today (both delete
        // the row). Kept as a separate kind so prompts that emit
        // "delete the meeting" map cleanly without the agent having
        // to remember the cancel/delete distinction.
        if (!helpers.deleteEvent) throw new Error('deleteEvent helper not provided');
        await helpers.deleteEvent(action.params.event_id);
        return { ok: true, summary: 'Event deleted' };
      }

      // ── Inbox ──
      case 'mark_message_done': {
        const { error } = await ctx.db.from('communication_messages').update({
          status: 'replied',
          replied_at: new Date().toISOString(),
        }).eq('id', action.params.message_id).eq('tenant_id', ctx.tenantId);
        if (error) throw error;
        return { ok: true, summary: 'Message marked done' };
      }

      case 'convert_to_task': {
        if (!helpers.createTask) throw new Error('createTask helper not provided');
        // Pull the message to derive client/project linkage from its
        // existing ai_classification.
        const { data: msg } = await ctx.db.from('communication_messages')
          .select('matched_client_id, matched_project_id, body_text')
          .eq('id', action.params.message_id).maybeSingle();
        const created = await helpers.createTask({
          title: action.params.task_title || 'Task from inbox',
          description: (msg as any)?.body_text?.slice(0, 500) || undefined,
          status: 'todo',
          completed: false,
          owner_id: ctx.userId,
          client_id: (msg as any)?.matched_client_id || undefined,
          project_id: (msg as any)?.matched_project_id || undefined,
          priority: 'medium',
          assignee_ids: [],
          order_index: 0,
        });
        // Mark message as converted so it stops appearing in "requests"
        await ctx.db.from('communication_messages')
          .update({ status: 'task_created' })
          .eq('id', action.params.message_id);
        return { ok: true, summary: 'Converted to task', newRowId: (created as any)?.id };
      }

      case 'draft_reply':
        // Drafting only — the actual send goes through comm-reply,
        // which the EmailDraftPanel / Inbox reply box handle. We just
        // signal intent here so the calling surface can pop the
        // composer with the suggested body pre-filled.
        return { ok: true, summary: 'Reply drafted — open Inbox to send' };

      // ── Clients ──
      case 'update_client_notes': {
        const { error } = await ctx.db.from('clients').update({
          email_context_notes: action.params.notes,
        }).eq('id', action.params.client_id).eq('tenant_id', ctx.tenantId);
        if (error) throw error;
        return { ok: true, summary: 'Client notes updated' };
      }

      case 'create_client': {
        const { data, error } = await ctx.db.from('clients').insert({
          tenant_id: ctx.tenantId,
          owner_id: ctx.userId,
          name: action.params.name,
          email: action.params.email || null,
          company: action.params.company || null,
          status: 'prospect',
        }).select('id').single();
        if (error) throw error;
        return { ok: true, summary: `Client "${action.params.name}" created`, newRowId: (data as any)?.id };
      }

      case 'delete_client': {
        // Soft-guard: refuse if the client still has projects. The DB
        // may also enforce this via FK constraints — we pre-check so
        // the user gets a useful message instead of a Postgres error.
        const { count } = await ctx.db.from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', action.params.client_id)
          .eq('tenant_id', ctx.tenantId);
        if ((count || 0) > 0) {
          return { ok: false, summary: 'Cannot delete', error: `Client still has ${count} project(s). Archive or reassign them first.` };
        }
        const { error } = await ctx.db.from('clients').delete()
          .eq('id', action.params.client_id)
          .eq('tenant_id', ctx.tenantId);
        if (error) throw error;
        return { ok: true, summary: 'Client deleted' };
      }

      // ── Projects ──
      case 'set_project_status': {
        const { error } = await ctx.db.from('projects').update({
          status: action.params.status,
        }).eq('id', action.params.project_id).eq('tenant_id', ctx.tenantId);
        if (error) throw error;
        return { ok: true, summary: `Project status → ${action.params.status}` };
      }

      case 'set_project_deadline': {
        const { error } = await ctx.db.from('projects').update({
          deadline: action.params.deadline,
        }).eq('id', action.params.project_id).eq('tenant_id', ctx.tenantId);
        if (error) throw error;
        return { ok: true, summary: `Deadline set to ${action.params.deadline}` };
      }

      case 'create_project': {
        const { data, error } = await ctx.db.from('projects').insert({
          tenant_id: ctx.tenantId,
          owner_id: ctx.userId,
          title: action.params.title,
          client_id: action.params.client_id || null,
          deadline: action.params.deadline || null,
          status: 'Pending',
        }).select('id').single();
        if (error) throw error;
        return { ok: true, summary: `Project "${action.params.title}" created`, newRowId: (data as any)?.id };
      }

      case 'delete_project': {
        // Soft-guard mirrors delete_client — refuse when open tasks
        // exist so the user doesn't orphan a backlog. "Open" means
        // not done AND not cancelled; a project with only finished
        // tasks is safe to delete.
        const { count } = await ctx.db.from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', action.params.project_id)
          .eq('tenant_id', ctx.tenantId)
          .not('status', 'in', '(done,cancelled)');
        if ((count || 0) > 0) {
          return { ok: false, summary: 'Cannot delete', error: `Project still has ${count} open task(s). Close them or move them first.` };
        }
        const { error } = await ctx.db.from('projects').delete()
          .eq('id', action.params.project_id)
          .eq('tenant_id', ctx.tenantId);
        if (error) throw error;
        return { ok: true, summary: 'Project deleted' };
      }

      default:
        return { ok: false, summary: 'Unknown action', error: `unsupported kind: ${(action as any).kind}` };
    }
  } catch (e: any) {
    return { ok: false, summary: 'Action failed', error: e?.message || 'unknown error' };
  }
}

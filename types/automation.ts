/**
 * Automation types — mirror migrations/2026-06-06_automations.sql.
 *
 * User-defined cross-module rules. The 4 hard-coded triggers from
 * 2026-06-01 still run unconditionally — these are extras the user
 * configures through the Toolkit UI.
 */

export type AutomationStatus = 'active' | 'paused' | 'draft' | 'archived';

export type AutomationModule =
  | 'tasks' | 'projects' | 'leads' | 'content' | 'finance'
  | 'calendar' | 'partners' | 'team' | 'time' | 'notifications' | 'ai';

export interface AutomationTriggerConfig {
  /** Match incoming events against these field filters. */
  filter?: {
    status_from?: string;
    status_to?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    project_id?: string;
    client_id?: string;
    [key: string]: unknown;
  };
  /** Throttle — don't fire twice within N minutes of the same trigger. */
  debounce_minutes?: number;
  [key: string]: unknown;
}

export interface AutomationActionConfig {
  /** When action_type=create_task — the task template. */
  task_template?: {
    title: string;
    project_id?: string;
    assignee_id?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    due_in_days?: number;
  };
  /** When action_type=send_slack / send_email — recipient + body. */
  recipient?: string;
  template?: string;
  /** When action_type=generate_content — brand + channel + brief. */
  brand_id?: string;
  channel?: string;
  briefing?: string;
  [key: string]: unknown;
}

export interface Automation {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  trigger_module: AutomationModule;
  trigger_event: string;
  trigger_config: AutomationTriggerConfig;
  action_module: AutomationModule;
  action_type: string;
  action_config: AutomationActionConfig;
  status: AutomationStatus;
  last_run_at: string | null;
  last_run_status: string | null;
  run_count: number;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  automation_id: string;
  tenant_id: string;
  triggered_at: string;
  trigger_data: unknown;
  action_result: unknown;
  status: 'success' | 'failed' | 'skipped';
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export type AutomationInsert = Partial<Omit<Automation, 'id' | 'created_at' | 'updated_at' | 'tenant_id' | 'run_count' | 'error_count' | 'last_run_at' | 'last_run_status'>> & {
  name: string;
  trigger_module: AutomationModule;
  trigger_event: string;
  action_module: AutomationModule;
  action_type: string;
};

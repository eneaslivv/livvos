/**
 * Communications Hub — TypeScript types
 *
 * Shared between frontend (React) and the edge functions that talk to
 * Gmail / Slack on the backend. Mirrors the schema in
 * migrations/2026-05-06_communications_hub.sql.
 */

export type Platform = 'gmail' | 'slack';

export type MessageIntent =
  | 'new_request'   // Client asks for something new
  | 'follow_up'     // "Bumping this thread"
  | 'question'      // Needs answer, no new work
  | 'approval'      // "Looks good?" / sign-off
  | 'feedback'      // Comments on prior delivery
  | 'info_only'     // FYI, no response needed
  | 'urgent';       // Time-sensitive — irrespective of other intent

export type MessagePriority = 'high' | 'medium' | 'low';

export type MessageStatus =
  | 'pending'       // Inbox — needs decision
  | 'task_created'  // Was converted to a task
  | 'replied'       // Was answered
  | 'snoozed'       // Postponed (snoozed_until)
  | 'ignored'       // Consciously dismissed
  | 'archived';     // Old / done

export type ReplyTone = 'formal' | 'friendly' | 'concise';

export type Language = 'es' | 'en' | 'other';

export type ChannelType = 'public' | 'private' | 'dm';

// ── AI classification result ──────────────────────────────────────────────
// Stored on communication_messages.ai_classification (jsonb).
export interface AIClassification {
  intent: MessageIntent;
  priority: MessagePriority;
  /** 1–2 line plain-language recap of the message. */
  summary: string;
  /** Whether the inbox should suggest creating a task from this message. */
  should_create_task: boolean;
  suggested_task: {
    title: string;
    description: string;
    /** YYYY-MM-DD or null if not inferable. */
    due_date: string | null;
    /** Free-text hint about which project this likely belongs to. */
    project_hint: string | null;
  } | null;
  /** Pre-filled reply draft from the agency's perspective (first-person plural). */
  suggested_reply: string;
  reply_tone: ReplyTone;
  /** Names, dates, amounts mentioned — surfaced as chips in the UI. */
  key_entities: string[];
  language: Language;
}

// ── Snippet of one message inside a thread (for AI context) ───────────────
export interface ThreadContextItem {
  from: string;
  body: string;
  date: string;
}

// ── Communication message (one inbox row) ────────────────────────────────
export interface CommunicationMessage {
  id: string;
  tenant_id: string;
  platform: Platform;

  external_id: string;
  thread_id: string | null;

  from_id: string | null;
  from_name: string | null;
  from_email: string | null;
  from_avatar_url: string | null;

  subject: string | null;
  body_text: string;
  body_html: string | null;
  channel_id: string | null;
  channel_name: string | null;

  thread_context: ThreadContextItem[] | null;

  received_at: string;

  ai_processed: boolean;
  ai_classification: AIClassification | null;

  status: MessageStatus;
  task_id: string | null;
  replied_at: string | null;
  replied_by: string | null;
  reply_sent: string | null;
  snoozed_until: string | null;

  created_at: string;
  updated_at: string;
}

// ── Integration token (one connected account) ────────────────────────────
export interface IntegrationToken {
  id: string;
  tenant_id: string;
  platform: Platform;

  // Tokens are write-only from the client's perspective — the SELECT
  // policy returns them for tenant members but typical UI code shouldn't
  // ever read them. Edge functions use the service role to fetch tokens.
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_at?: string | null;

  // Gmail
  gmail_email: string | null;
  gmail_history_id: string | null;
  gmail_watch_expiry: string | null;

  // Slack
  slack_team_id: string | null;
  slack_team_name: string | null;
  slack_bot_user_id: string | null;
  slack_bot_token?: string;

  connected_at: string;
  last_sync_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Slack monitored channel ──────────────────────────────────────────────
export interface SlackMonitoredChannel {
  id: string;
  tenant_id: string;
  integration_token_id: string | null;
  channel_id: string;
  channel_name: string;
  channel_type: ChannelType;
  is_active: boolean;
  created_at: string;
}

// ── Reply draft (audit row) ──────────────────────────────────────────────
export interface ReplyDraft {
  id: string;
  message_id: string;
  tenant_id: string;
  ai_generated_text: string;
  edited_text: string | null;
  was_sent: boolean;
  created_by: string | null;
  created_at: string;
}

// ── Classifier input (frontend → edge fn → gemini) ───────────────────────
export interface ClassifierInput {
  platform: Platform;
  from_name: string;
  from_email?: string;
  subject?: string;
  body: string;
  thread_context?: ThreadContextItem[];
  /** Tenant name for the agency, used as the "we" perspective in the reply. */
  agency_name: string;
}

// ── Helpers — UI uses these to color/sort messages ───────────────────────
export const INTENT_LABELS: Record<MessageIntent, { label: string; color: string }> = {
  new_request: { label: 'New request', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  follow_up:   { label: 'Follow-up',   color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  question:    { label: 'Question',    color: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  approval:    { label: 'Approval',    color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  feedback:    { label: 'Feedback',    color: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300' },
  info_only:   { label: 'FYI',         color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400' },
  urgent:      { label: 'Urgent',      color: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
};

export const STATUS_LABELS: Record<MessageStatus, string> = {
  pending:      'Pending',
  task_created: 'Task created',
  replied:      'Replied',
  snoozed:      'Snoozed',
  ignored:      'Ignored',
  archived:     'Archived',
};

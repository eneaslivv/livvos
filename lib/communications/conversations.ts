export type CommunicationPlatform = 'gmail' | 'slack' | string;

export type CommunicationMessageLike = {
  id?: string | null;
  platform?: CommunicationPlatform | null;
  from_name?: string | null;
  from_email?: string | null;
  subject?: string | null;
  body_text?: string | null;
  channel_id?: string | null;
  channel_name?: string | null;
  thread_id?: string | null;
  external_id?: string | null;
  received_at?: string | null;
  status?: string | null;
  ai_classification?: {
    intent?: string | null;
    priority?: string | null;
    should_create_task?: boolean | null;
    summary?: string | null;
  } | null;
  matched_client_id?: string | null;
  matched_project_id?: string | null;
  replied_in_platform?: boolean | null;
  reply_count?: number | null;
  last_reply_at?: string | null;
  /** 'inbound' | 'outbound'. Outbound = sent by us / authored by a linked
   *  self/team identity — never an inbound follow-up. */
  direction?: string | null;
  opened_at?: string | null;
  read_at?: string | null;
};

export type CommunicationConversation<T extends CommunicationMessageLike = CommunicationMessageLike> = {
  key: string;
  platform: CommunicationPlatform;
  title: string;
  subtitle: string;
  sourceLabel: string;
  messages: T[];
  total: number;
  pending: number;
  handled: number;
  followups: number;
  urgent: number;
  latest: T | null;
  participants: string[];
};

const HANDLED_STATUSES = new Set(['replied', 'sent', 'task_created', 'ignored', 'archived', 'auto_resolved']);
const FOLLOW_UP_INTENTS = new Set([
  'request',
  'question',
  'follow_up',
  'new_request',
  'needs_clarification',
  'task_request',
  'blocker',
]);

export function normalizeEmailSubject(value?: string | null): string {
  const raw = String(value || '').trim();
  const normalized = raw
    .replace(/^\s*(re|fw|fwd)\s*:\s*/i, '')
    .replace(/^\s*(re|fw|fwd)\s*:\s*/i, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || '(no subject)';
}

export function getConversationKey(message: CommunicationMessageLike): string {
  const platform = message.platform || 'unknown';
  if (platform === 'gmail') {
    const subject = normalizeEmailSubject(message.subject || message.body_text?.split('\n')[0]);
    const participant = (message.from_email || message.from_name || 'unknown').toLowerCase();
    return `gmail:${message.thread_id || `${participant}:${subject.toLowerCase()}`}`;
  }
  if (platform === 'slack') {
    const channel = message.channel_id || message.channel_name || 'dm';
    const thread = message.thread_id || message.external_id || message.id || 'message';
    return `slack:${channel}:${thread}`;
  }
  return `${platform}:${message.thread_id || message.external_id || message.id || 'message'}`;
}

export function getSourceLabel(message: CommunicationMessageLike): string {
  if (message.platform === 'gmail') return 'Mail';
  if (message.platform === 'slack') return message.channel_name ? `#${message.channel_name}` : 'Slack';
  return String(message.platform || 'Inbox');
}

export function getConversationTitle(message: CommunicationMessageLike): string {
  if (message.platform === 'gmail') {
    return normalizeEmailSubject(message.subject || message.body_text?.split('\n')[0]);
  }
  if (message.platform === 'slack') {
    return message.channel_name ? `#${message.channel_name}` : 'Slack thread';
  }
  return message.subject || message.from_name || 'Conversation';
}

export function getConversationSubtitle(message: CommunicationMessageLike): string {
  if (message.platform === 'gmail') {
    return message.from_name || message.from_email || 'Unknown sender';
  }
  return message.from_name || message.from_email || 'Slack conversation';
}

export function isMessageHandled(message: CommunicationMessageLike): boolean {
  const status = String(message.status || '').toLowerCase();
  // Outbound = we sent it, or it was authored by a linked self/team identity.
  // Either way it is never an inbound item the operator must act on.
  if (String(message.direction || '').toLowerCase() === 'outbound') return true;
  return HANDLED_STATUSES.has(status) || message.replied_in_platform === true;
}

export function needsMessageFollowUp(message: CommunicationMessageLike, now = Date.now()): boolean {
  if (isMessageHandled(message)) return false;
  const status = String(message.status || '').toLowerCase();
  if (status && status !== 'pending' && status !== 'snoozed') return false;
  const cls = message.ai_classification || {};
  const priority = String(cls.priority || '').toLowerCase();
  const intent = String(cls.intent || '').toLowerCase();
  const received = message.received_at ? new Date(message.received_at).getTime() : now;
  const ageHours = Number.isFinite(received) ? (now - received) / 3600000 : 0;
  return cls.should_create_task === true
    || priority === 'urgent'
    || priority === 'high'
    || FOLLOW_UP_INTENTS.has(intent)
    || ageHours >= 24;
}

export function isUrgentMessage(message: CommunicationMessageLike): boolean {
  const cls = message.ai_classification || {};
  const priority = String(cls.priority || '').toLowerCase();
  return priority === 'urgent' || priority === 'high';
}

export function groupCommunicationMessages<T extends CommunicationMessageLike>(
  messages: T[],
): CommunicationConversation<T>[] {
  const groups = new Map<string, CommunicationConversation<T>>();
  for (const message of messages) {
    const key = getConversationKey(message);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        platform: message.platform || 'unknown',
        title: getConversationTitle(message),
        subtitle: getConversationSubtitle(message),
        sourceLabel: getSourceLabel(message),
        messages: [],
        total: 0,
        pending: 0,
        handled: 0,
        followups: 0,
        urgent: 0,
        latest: null,
        participants: [],
      });
    }
    const group = groups.get(key)!;
    group.messages.push(message);
    group.total += 1;
    if (String(message.status || '').toLowerCase() === 'pending') group.pending += 1;
    if (isMessageHandled(message)) group.handled += 1;
    if (needsMessageFollowUp(message)) group.followups += 1;
    if (isUrgentMessage(message)) group.urgent += 1;
    const participant = message.from_name || message.from_email;
    if (participant && !group.participants.includes(participant)) group.participants.push(participant);
    if (!group.latest || String(message.received_at || '') > String(group.latest.received_at || '')) {
      group.latest = message;
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.followups !== b.followups) return b.followups - a.followups;
    if (a.urgent !== b.urgent) return b.urgent - a.urgent;
    return String(b.latest?.received_at || '').localeCompare(String(a.latest?.received_at || ''));
  });
}

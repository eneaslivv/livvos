-- Persist inbox read/opened state and integration health metadata.
-- Idempotent so it can be applied safely on environments with partial drift.

alter table public.communication_messages
  add column if not exists integration_token_id uuid references public.integration_tokens(id) on delete set null,
  add column if not exists opened_at timestamptz,
  add column if not exists opened_by uuid references auth.users(id) on delete set null,
  add column if not exists read_at timestamptz,
  add column if not exists read_by uuid references auth.users(id) on delete set null;

create index if not exists idx_comm_messages_integration_token
  on public.communication_messages(integration_token_id);

create index if not exists idx_comm_messages_unread_inbound
  on public.communication_messages(tenant_id, platform, received_at desc)
  where read_at is null and coalesce(direction, 'inbound') = 'inbound';

update public.communication_messages m
set integration_token_id = c.integration_token_id
from public.slack_monitored_channels c
where m.integration_token_id is null
  and m.platform = 'slack'
  and m.tenant_id = c.tenant_id
  and m.channel_id = c.channel_id
  and c.integration_token_id is not null;

alter table public.integration_tokens
  add column if not exists last_sync_status text not null default 'idle',
  add column if not exists last_sync_error text,
  add column if not exists last_sync_started_at timestamptz,
  add column if not exists last_sync_finished_at timestamptz,
  add column if not exists last_sync_count integer not null default 0;

alter table public.integration_tokens
  drop constraint if exists integration_tokens_last_sync_status_check;

alter table public.integration_tokens
  add constraint integration_tokens_last_sync_status_check
  check (last_sync_status in ('idle', 'syncing', 'success', 'error'));

alter table public.slack_monitored_channels
  add column if not exists inbound_filter text not null default 'actionable',
  add column if not exists last_sync_at timestamptz,
  add column if not exists last_sync_error text,
  add column if not exists last_message_at timestamptz;

alter table public.slack_monitored_channels
  drop constraint if exists slack_monitored_channels_inbound_filter_check;

alter table public.slack_monitored_channels
  add constraint slack_monitored_channels_inbound_filter_check
  check (inbound_filter in ('all', 'mentions', 'actionable'));

comment on column public.communication_messages.integration_token_id is
  'Integration token/account that ingested the message; used for multi-account replies.';
comment on column public.communication_messages.opened_at is
  'First time the message detail was opened in LIVV.';
comment on column public.communication_messages.read_at is
  'First time the message was marked read in LIVV.';
comment on column public.slack_monitored_channels.inbound_filter is
  'Controls Slack inbox noise: all, mentions only, or likely actionable external messages.';

notify pgrst, 'reload schema';

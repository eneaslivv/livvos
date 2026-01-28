-- Fix tenant/owner integrity for CRM + Activity

-- 1) Ensure required columns exist (guarded)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    alter table public.leads add column if not exists tenant_id uuid references public.tenants(id);
    alter table public.leads add column if not exists owner_id uuid references public.profiles(id);
    create index if not exists idx_leads_tenant_id on public.leads(tenant_id);
    create index if not exists idx_leads_owner_id on public.leads(owner_id);
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_logs') then
    alter table public.activity_logs add column if not exists tenant_id uuid references public.tenants(id);
    create index if not exists idx_activity_logs_tenant_id on public.activity_logs(tenant_id);
  end if;
end $$;

-- 2) Backfill tenant_id where possible (guarded)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    update public.leads l
    set tenant_id = p.tenant_id
    from public.profiles p
    where l.tenant_id is null
      and l.owner_id = p.id;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_logs') then
    update public.activity_logs a
    set tenant_id = p.tenant_id
    from public.profiles p
    where a.tenant_id is null
      and a.user_id = p.id;
  end if;
end $$;

-- 3) Enforce tenant_id when safe (guarded)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    if not exists (select 1 from public.leads where tenant_id is null) then
      alter table public.leads alter column tenant_id set not null;
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_logs') then
    if not exists (select 1 from public.activity_logs where tenant_id is null) then
      alter table public.activity_logs alter column tenant_id set not null;
    end if;
  end if;
end $$;

-- 4) Auto-attach tenant/user on insert (server-side safety net)
create or replace function public.set_leads_context()
returns trigger as $$
begin
  if new.owner_id is null then
    new.owner_id = auth.uid();
  end if;

  if new.tenant_id is null then
    select tenant_id into new.tenant_id from public.profiles where id = auth.uid();
  end if;

  return new;
end;
$$ language plpgsql security definer;

create or replace function public.set_activity_context()
returns trigger as $$
begin
  if new.user_id is null then
    new.user_id = auth.uid();
  end if;

  if new.tenant_id is null then
    select tenant_id into new.tenant_id from public.profiles where id = auth.uid();
  end if;

  return new;
end;
$$ language plpgsql security definer;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    drop trigger if exists set_leads_context on public.leads;
    create trigger set_leads_context
    before insert on public.leads
    for each row execute function public.set_leads_context();
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_logs') then
    drop trigger if exists set_activity_context on public.activity_logs;
    create trigger set_activity_context
    before insert on public.activity_logs
    for each row execute function public.set_activity_context();
  end if;
end $$;

-- 5) RLS policies scoped by tenant
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    alter table public.leads enable row level security;

    drop policy if exists "Leads tenant access" on public.leads;
    create policy "Leads tenant access" on public.leads
    for all
    using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'activity_logs') then
    alter table public.activity_logs enable row level security;

    drop policy if exists "Activity tenant access" on public.activity_logs;
    create policy "Activity tenant access" on public.activity_logs
    for all
    using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));
  end if;
end $$;

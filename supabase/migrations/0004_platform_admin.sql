-- Platform super-admin + global billing switch.
-- When billing_enabled = false, all teams are effectively free/unlimited.
-- Super admins control plans and turn billing on when ready.

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id                int primary key default 1 check (id = 1),
  billing_enabled   boolean not null default false,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id)
);

insert into public.app_settings (id, billing_enabled)
values (1, false)
on conflict (id) do nothing;

-- Seed first platform admin (meetly@local.dev) if that user exists
insert into public.platform_admins (user_id, email)
select id, email from auth.users
where lower(email) = lower('meetly@local.dev')
on conflict (user_id) do nothing;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins a where a.user_id = auth.uid()
  );
$$;

create or replace function public.billing_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select billing_enabled from public.app_settings where id = 1),
    false
  );
$$;

grant execute on function public.is_platform_admin() to authenticated, anon, service_role;
grant execute on function public.billing_is_enabled() to authenticated, anon, service_role;

-- Seat enforcement only when billing is on
create or replace function public.enforce_seat_limit_on_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim integer;
  used integer;
begin
  if not public.billing_is_enabled() then
    return new;
  end if;
  select seat_limit into lim from public.teamspace_plan_limits(new.teamspace_id);
  used := public.teamspace_seat_count(new.teamspace_id);
  if used >= coalesce(lim, 3) then
    raise exception 'Seat limit reached for this plan (% seats). Upgrade to invite more people.', lim
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_seat_limit_on_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim integer;
  used integer;
begin
  if not public.billing_is_enabled() then
    return new;
  end if;
  if new.status is distinct from 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;
  select seat_limit into lim from public.teamspace_plan_limits(new.teamspace_id);
  select count(*)::int into used from public.teamspace_members
    where teamspace_id = new.teamspace_id and status = 'active'
      and user_id is distinct from new.user_id;
  if used >= coalesce(lim, 3) then
    raise exception 'Seat limit reached for this plan (% seats). Upgrade to add members.', lim
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Super-admin: update a plan
create or replace function public.admin_upsert_plan(
  p_id text,
  p_name text,
  p_description text,
  p_seat_limit integer,
  p_ai_minutes_limit integer,
  p_price_usd_month numeric,
  p_active boolean,
  p_stripe_price_id text default null,
  p_sort_order integer default 0
)
returns public.billing_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.billing_plans;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin only';
  end if;
  insert into public.billing_plans as bp (
    id, name, description, seat_limit, ai_minutes_limit, price_usd_month,
    stripe_price_id, sort_order, active
  ) values (
    p_id, p_name, coalesce(p_description, ''), p_seat_limit, p_ai_minutes_limit,
    coalesce(p_price_usd_month, 0), nullif(p_stripe_price_id, ''), p_sort_order, p_active
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    seat_limit = excluded.seat_limit,
    ai_minutes_limit = excluded.ai_minutes_limit,
    price_usd_month = excluded.price_usd_month,
    stripe_price_id = excluded.stripe_price_id,
    sort_order = excluded.sort_order,
    active = excluded.active
  returning * into row;
  return row;
end;
$$;

create or replace function public.admin_set_billing_enabled(enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin only';
  end if;
  insert into public.app_settings (id, billing_enabled, updated_at, updated_by)
  values (1, enabled, now(), auth.uid())
  on conflict (id) do update set
    billing_enabled = excluded.billing_enabled,
    updated_at = now(),
    updated_by = auth.uid();
  return enabled;
end;
$$;

create or replace function public.admin_add_platform_admin(admin_email text)
returns public.platform_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  row public.platform_admins;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin only';
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(admin_email));
  if uid is null then
    raise exception 'No user with email %', admin_email;
  end if;
  insert into public.platform_admins (user_id, email)
  values (uid, lower(trim(admin_email)))
  on conflict (user_id) do update set email = excluded.email
  returning * into row;
  return row;
end;
$$;

-- Bootstrap: allow claiming first admin if none exist (one-time)
create or replace function public.admin_bootstrap_self()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.platform_admins) then
    return public.is_platform_admin();
  end if;
  if auth.uid() is null then
    return false;
  end if;
  insert into public.platform_admins (user_id, email)
  values (auth.uid(), (select email from auth.users where id = auth.uid()))
  on conflict do nothing;
  return true;
end;
$$;

grant execute on function public.admin_upsert_plan(text, text, text, integer, integer, numeric, boolean, text, integer) to authenticated;
grant execute on function public.admin_set_billing_enabled(boolean) to authenticated;
grant execute on function public.admin_add_platform_admin(text) to authenticated;
grant execute on function public.admin_bootstrap_self() to authenticated;

-- Initially: only Free is customer-visible; paid plans exist but inactive
update public.billing_plans set active = false where id in ('team', 'business');
update public.billing_plans
set seat_limit = 1000, ai_minutes_limit = 100000, description = 'Everything included while billing is off / free tier.'
where id = 'free';

-- RLS
alter table public.platform_admins enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "admins read self" on public.platform_admins;
drop policy if exists "admins read all" on public.platform_admins;
create policy "admins read self" on public.platform_admins
  for select using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "settings read" on public.app_settings;
create policy "settings read" on public.app_settings
  for select using (true);

-- Plans: customers see active only (existing policy); admins need all via RPC / service
-- Allow platform admins to select inactive plans
drop policy if exists "plans read" on public.billing_plans;
create policy "plans read" on public.billing_plans
  for select using (active = true or public.is_platform_admin());

grant select on public.platform_admins to authenticated;
grant select on public.app_settings to authenticated, anon;
grant select on public.billing_plans to authenticated, anon, service_role;

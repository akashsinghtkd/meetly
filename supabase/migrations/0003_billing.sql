-- Meetly SaaS billing: plans, subscriptions, seat + AI minute quotas.

-- ── plan catalog ────────────────────────────────────────────────────────────
create table if not exists public.billing_plans (
  id                text primary key,          -- free | team | business
  name              text not null,
  description       text not null default '',
  seat_limit        integer not null,          -- max active members (+ pending invites count toward seats)
  ai_minutes_limit  integer not null,          -- transcription minutes / calendar month
  price_usd_month   numeric(10,2) not null default 0,
  stripe_price_id   text,                      -- null until Stripe products are wired
  sort_order        integer not null default 0,
  active            boolean not null default true
);

insert into public.billing_plans (id, name, description, seat_limit, ai_minutes_limit, price_usd_month, sort_order)
values
  ('free',     'Free',     'Try Meetly with a small team.',           3,   60,   0,    0),
  ('team',     'Team',     'For growing teams that meet often.',     15,  500,  29,    1),
  ('business', 'Business', 'Higher limits and priority support.',    50, 2000,  79,    2)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  seat_limit = excluded.seat_limit,
  ai_minutes_limit = excluded.ai_minutes_limit,
  price_usd_month = excluded.price_usd_month,
  sort_order = excluded.sort_order;

-- ── subscription per teamspace ──────────────────────────────────────────────
create table if not exists public.teamspace_subscriptions (
  teamspace_id              text primary key references public.teamspaces (id) on delete cascade,
  plan_id                   text not null references public.billing_plans (id) default 'free',
  status                    text not null default 'active'
                            check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  stripe_customer_id        text,
  stripe_subscription_id    text,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  updated_at                timestamptz not null default now()
);

-- Backfill free plan for existing teamspaces
insert into public.teamspace_subscriptions (teamspace_id, plan_id, status)
select id, 'free', 'active' from public.teamspaces
on conflict (teamspace_id) do nothing;

-- Auto-create free subscription when a teamspace is created
create or replace function public.teamspace_ensure_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.teamspace_subscriptions (teamspace_id, plan_id, status)
  values (new.id, 'free', 'active')
  on conflict (teamspace_id) do nothing;
  return new;
end;
$$;

drop trigger if exists teamspace_ensure_subscription on public.teamspaces;
create trigger teamspace_ensure_subscription
  after insert on public.teamspaces
  for each row execute function public.teamspace_ensure_subscription();

-- ── helpers: seats + plan limits ────────────────────────────────────────────
create or replace function public.teamspace_seat_count(ts text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*)::int from public.teamspace_members
     where teamspace_id = ts and status = 'active')
    +
    (select count(*)::int from public.teamspace_invites
     where teamspace_id = ts and accepted_at is null and expires_at > now())
  );
$$;

create or replace function public.teamspace_plan_limits(ts text)
returns table (plan_id text, seat_limit integer, ai_minutes_limit integer, status text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.seat_limit, p.ai_minutes_limit, coalesce(s.status, 'active')
  from public.billing_plans p
  left join public.teamspace_subscriptions s on s.plan_id = p.id and s.teamspace_id = ts
  where p.id = coalesce(
    (select plan_id from public.teamspace_subscriptions where teamspace_id = ts),
    'free'
  );
$$;

create or replace function public.teamspace_ai_minutes_used(ts text, month_start timestamptz default date_trunc('month', now()))
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(audio_seconds) / 60.0, 0)
  from public.usage_records
  where teamspace_id = ts
    and estimated is not true
    and kind = 'transcription'
    and at >= month_start;
$$;

grant execute on function public.teamspace_seat_count(text) to authenticated, service_role;
grant execute on function public.teamspace_plan_limits(text) to authenticated, service_role;
grant execute on function public.teamspace_ai_minutes_used(text, timestamptz) to authenticated, service_role;

-- Block invites that would exceed seat limit
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
  select seat_limit into lim from public.teamspace_plan_limits(new.teamspace_id);
  used := public.teamspace_seat_count(new.teamspace_id);
  -- seat_count already includes existing invites; this NEW row isn't committed yet
  if used >= coalesce(lim, 3) then
    raise exception 'Seat limit reached for this plan (% seats). Upgrade to invite more people.', lim
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_seat_limit_on_invite on public.teamspace_invites;
create trigger enforce_seat_limit_on_invite
  before insert on public.teamspace_invites
  for each row execute function public.enforce_seat_limit_on_invite();

-- Block accepting invite / adding member beyond seats
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
  if new.status is distinct from 'active' then
    return new;
  end if;
  -- On update from removed→active or insert
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

drop trigger if exists enforce_seat_limit_on_member on public.teamspace_members;
create trigger enforce_seat_limit_on_member
  before insert or update of status on public.teamspace_members
  for each row execute function public.enforce_seat_limit_on_member();

-- Dev / ops: set plan without Stripe (local Docker). Requires admin role.
create or replace function public.dev_set_teamspace_plan(ts text, new_plan text)
returns public.teamspace_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.teamspace_subscriptions;
begin
  if not public.can_admin_teamspace(ts) then
    raise exception 'Only owners/admins can change the plan';
  end if;
  if not exists (select 1 from public.billing_plans where id = new_plan and active) then
    raise exception 'Unknown plan %', new_plan;
  end if;
  insert into public.teamspace_subscriptions (teamspace_id, plan_id, status, updated_at)
  values (ts, new_plan, 'active', now())
  on conflict (teamspace_id) do update
    set plan_id = excluded.plan_id,
        status = 'active',
        cancel_at_period_end = false,
        updated_at = now()
  returning * into sub;
  return sub;
end;
$$;

grant execute on function public.dev_set_teamspace_plan(text, text) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.billing_plans enable row level security;
alter table public.teamspace_subscriptions enable row level security;

drop policy if exists "plans read" on public.billing_plans;
create policy "plans read" on public.billing_plans
  for select using (active = true);

drop policy if exists "subs select" on public.teamspace_subscriptions;
drop policy if exists "subs update" on public.teamspace_subscriptions;
create policy "subs select" on public.teamspace_subscriptions
  for select using (public.is_teamspace_member(teamspace_id));
-- Updates only via service role (webhook) or security definer RPCs
create policy "subs no direct write" on public.teamspace_subscriptions
  for insert with check (false);
create policy "subs no direct update" on public.teamspace_subscriptions
  for update using (false);

grant select on public.billing_plans to anon, authenticated, service_role;
grant select on public.teamspace_subscriptions to authenticated, service_role;
grant all on public.teamspace_subscriptions to service_role;
grant all on public.billing_plans to service_role;

-- Fixes found in review:
--  1. Invite acceptance was blocked by RLS (members INSERT only allows self-as-owner
--     or existing admins). A newly-invited user is neither → "violates row-level
--     security policy". Same chicken-and-egg as teamspace creation (see 0005).
--     Fix: a security-definer accept_invite() that validates + joins atomically.
--  2. dev_set_teamspace_plan rejected inactive plans, but Team/Business ship hidden
--     (active=false), so "switch plans in dev mode" couldn't reach any paid plan.
--  3. 0004 bumped Free to 1000 seats / 100000 min, which defeats enforcement once
--     billing is switched on. "Billing off = unlimited" is already handled by the
--     billing_is_enabled() guards + client, so restore Free to its real limits.

-- ── 1. Atomic invite acceptance ──────────────────────────────────────────────
create or replace function public.accept_invite(p_token text)
returns public.teamspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  uemail text;
  inv   public.teamspace_invites;
  ts    public.teamspaces;
  mem_id text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select lower(email) into uemail from auth.users where id = uid;

  select * into inv
  from public.teamspace_invites
  where token = p_token
  limit 1;

  if inv.id is null then
    raise exception 'Invite not found' using errcode = 'P0001';
  end if;

  if lower(inv.email) <> coalesce(uemail, '') then
    raise exception 'This invite was sent to %. Sign in with that email.', inv.email
      using errcode = 'P0001';
  end if;

  -- Allow re-running for an already-accepted invite as long as it's the same user
  -- (idempotent link clicks); otherwise enforce expiry.
  if inv.accepted_at is null and inv.expires_at < now() then
    raise exception 'This invite has expired' using errcode = 'P0001';
  end if;

  mem_id := 'tm-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.teamspace_members (id, teamspace_id, user_id, role, status)
  values (mem_id, inv.teamspace_id, uid, inv.role, 'active')
  on conflict (teamspace_id, user_id) do update
    set status = 'active',
        -- never demote an existing owner
        role = case
          when public.teamspace_members.role = 'owner' then 'owner'
          else excluded.role
        end;

  update public.teamspace_invites
    set accepted_at = coalesce(accepted_at, now())
    where id = inv.id;

  select * into ts from public.teamspaces where id = inv.teamspace_id;
  return ts;
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;

-- ── 2. dev plan switching should reach hidden plans ──────────────────────────
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
  -- Plan just needs to exist; hidden (inactive) plans are still selectable in dev.
  if not exists (select 1 from public.billing_plans where id = new_plan) then
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

-- ── 3. Restore real Free-tier limits (enforced only when billing is switched on) ─
update public.billing_plans
set seat_limit = 3,
    ai_minutes_limit = 60,
    description = 'Try Meetly with a small team.'
where id = 'free';

-- Platform admin console: read/control RPCs for users & teamspaces, meetings &
-- recordings, storage builds, and usage — all gated by is_platform_admin().
-- List/read RPCs are `language sql` and filter on is_platform_admin() (returns
-- an empty set for non-admins); mutating RPCs are `language plpgsql` and raise,
-- matching the existing admin_* functions in 0004_platform_admin.sql.

-- ── Users & teamspaces ───────────────────────────────────────────────────────
create or replace function public.admin_list_teamspaces()
returns table (
  id text, name text, slug text, emoji text, created_at timestamptz,
  owner_email text, member_count integer,
  plan_id text, plan_name text, seat_limit integer, billing_status text
)
language sql stable security definer set search_path = public
as $$
  select
    t.id, t.name, t.slug, t.emoji, t.created_at,
    u.email,
    (select count(*)::int from public.teamspace_members m
       where m.teamspace_id = t.id and m.status = 'active'),
    coalesce(s.plan_id, 'free'),
    p.name,
    p.seat_limit,
    coalesce(s.status, 'active')
  from public.teamspaces t
  left join auth.users u on u.id = t.created_by
  left join public.teamspace_subscriptions s on s.teamspace_id = t.id
  left join public.billing_plans p on p.id = coalesce(s.plan_id, 'free')
  where public.is_platform_admin()
  order by t.created_at desc;
$$;
grant execute on function public.admin_list_teamspaces() to authenticated;

create or replace function public.admin_list_members(p_teamspace_id text)
returns table (user_id uuid, email text, role text, status text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select m.user_id, u.email, m.role, m.status, m.created_at
  from public.teamspace_members m
  join auth.users u on u.id = m.user_id
  where m.teamspace_id = p_teamspace_id and public.is_platform_admin()
  order by m.created_at asc;
$$;
grant execute on function public.admin_list_members(text) to authenticated;

create or replace function public.admin_remove_member(p_teamspace_id text, p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin only';
  end if;
  update public.teamspace_members
    set status = 'removed'
    where teamspace_id = p_teamspace_id and user_id = p_user_id;
  return found;
end;
$$;
grant execute on function public.admin_remove_member(text, uuid) to authenticated;

create or replace function public.admin_set_team_plan(p_teamspace_id text, p_plan_id text)
returns public.teamspace_subscriptions
language plpgsql security definer set search_path = public
as $$
declare
  sub public.teamspace_subscriptions;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin only';
  end if;
  if not exists (select 1 from public.billing_plans where id = p_plan_id) then
    raise exception 'Unknown plan %', p_plan_id;
  end if;
  insert into public.teamspace_subscriptions (teamspace_id, plan_id, status, updated_at)
  values (p_teamspace_id, p_plan_id, 'active', now())
  on conflict (teamspace_id) do update
    set plan_id = excluded.plan_id, status = 'active', updated_at = now()
  returning * into sub;
  return sub;
end;
$$;
grant execute on function public.admin_set_team_plan(text, text) to authenticated;

-- ── Meetings & recordings ────────────────────────────────────────────────────
create or replace function public.admin_list_meetings(
  p_search text default null,
  p_teamspace_id text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id text, title text, teamspace_id text, teamspace_name text, user_email text,
  started_at timestamptz, duration_secs double precision, status text, has_audio boolean
)
language sql stable security definer set search_path = public
as $$
  select
    m.id, m.title, m.teamspace_id, t.name, u.email,
    m.started_at, m.duration_secs, m.status, (m.audio_url is not null)
  from public.meetings m
  left join public.teamspaces t on t.id = m.teamspace_id
  left join auth.users u on u.id = m.user_id
  where public.is_platform_admin()
    and (p_teamspace_id is null or m.teamspace_id = p_teamspace_id)
    and (p_search is null or m.title ilike '%' || p_search || '%')
  order by m.started_at desc
  limit least(coalesce(p_limit, 50), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;
grant execute on function public.admin_list_meetings(text, text, integer, integer) to authenticated;

create or replace function public.admin_get_meeting(p_meeting_id text)
returns public.meetings
language sql stable security definer set search_path = public
as $$
  select m.* from public.meetings m
  where m.id = p_meeting_id and public.is_platform_admin();
$$;
grant execute on function public.admin_get_meeting(text) to authenticated;

create or replace function public.admin_delete_meeting(p_meeting_id text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin only';
  end if;
  delete from public.meetings where id = p_meeting_id;
  return found;
end;
$$;
grant execute on function public.admin_delete_meeting(text) to authenticated;

-- ── App builds & releases (Storage) ──────────────────────────────────────────
create or replace function public.admin_list_builds()
returns table (name text, size_bytes bigint, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select o.name, nullif(o.metadata->>'size', '')::bigint, o.created_at, o.updated_at
  from storage.objects o
  where o.bucket_id = 'builds' and public.is_platform_admin()
  order by o.created_at desc;
$$;
grant execute on function public.admin_list_builds() to authenticated;

-- Removes the object's listing (and access via its public URL). Does not
-- guarantee immediate reclaim of underlying storage bytes.
create or replace function public.admin_delete_build(p_name text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin only';
  end if;
  delete from storage.objects where bucket_id = 'builds' and name = p_name;
  return found;
end;
$$;
grant execute on function public.admin_delete_build(text) to authenticated;

-- ── Usage & billing ──────────────────────────────────────────────────────────
create or replace function public.admin_usage_summary(p_month timestamptz default date_trunc('month', now()))
returns table (
  teamspace_id text, teamspace_name text,
  requests integer, audio_minutes double precision, cost_usd double precision
)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(u.teamspace_id, '(none)') as teamspace_id,
    coalesce(t.name, '(no team)') as teamspace_name,
    count(*)::int as requests,
    coalesce(sum(u.audio_seconds), 0) / 60.0 as audio_minutes,
    coalesce(sum(u.cost_usd), 0) as cost_usd
  from public.usage_records u
  left join public.teamspaces t on t.id = u.teamspace_id
  where public.is_platform_admin()
    and u.at >= date_trunc('month', p_month)
    and u.at < date_trunc('month', p_month) + interval '1 month'
  group by u.teamspace_id, t.name
  order by cost_usd desc;
$$;
grant execute on function public.admin_usage_summary(timestamptz) to authenticated;

-- Postgres grants EXECUTE to PUBLIC by default; revoke it so anon can't even
-- attempt these (the is_platform_admin() gate inside still applies either way).
revoke execute on function public.admin_list_teamspaces() from public;
revoke execute on function public.admin_list_members(text) from public;
revoke execute on function public.admin_remove_member(text, uuid) from public;
revoke execute on function public.admin_set_team_plan(text, text) from public;
revoke execute on function public.admin_list_meetings(text, text, integer, integer) from public;
revoke execute on function public.admin_get_meeting(text) from public;
revoke execute on function public.admin_delete_meeting(text) from public;
revoke execute on function public.admin_list_builds() from public;
revoke execute on function public.admin_delete_build(text) from public;
revoke execute on function public.admin_usage_summary(timestamptz) from public;

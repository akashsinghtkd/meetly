-- Meetly SaaS tenancy: teamspaces, memberships, invites.
-- Projects / meetings / tasks / usage become teamspace-scoped.
-- user_id remains as created_by for audit.

-- ── teamspaces ──────────────────────────────────────────────────────────────
create table if not exists public.teamspaces (
  id          text primary key,
  name        text not null,
  slug        text not null unique,
  emoji       text not null default '🏢',
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.teamspace_members (
  id            text primary key,
  teamspace_id  text not null references public.teamspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  status        text not null default 'active' check (status in ('active', 'removed')),
  created_at    timestamptz not null default now(),
  unique (teamspace_id, user_id)
);
create index if not exists teamspace_members_user_idx
  on public.teamspace_members (user_id) where status = 'active';
create index if not exists teamspace_members_ts_idx
  on public.teamspace_members (teamspace_id) where status = 'active';

create table if not exists public.teamspace_invites (
  id            text primary key,
  teamspace_id  text not null references public.teamspaces (id) on delete cascade,
  email         text not null,
  role          text not null default 'member'
                check (role in ('admin', 'member', 'viewer')),
  token         text not null unique,
  invited_by    uuid not null references auth.users (id) on delete cascade,
  expires_at    timestamptz not null default (now() + interval '14 days'),
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists teamspace_invites_email_idx
  on public.teamspace_invites (lower(email));
create index if not exists teamspace_invites_token_idx
  on public.teamspace_invites (token);

-- ── add teamspace_id to domain tables ───────────────────────────────────────
alter table public.projects
  add column if not exists teamspace_id text references public.teamspaces (id) on delete cascade;
alter table public.meetings
  add column if not exists teamspace_id text references public.teamspaces (id) on delete cascade;
alter table public.tasks
  add column if not exists teamspace_id text references public.teamspaces (id) on delete cascade;
alter table public.usage_records
  add column if not exists teamspace_id text references public.teamspaces (id) on delete cascade;

-- Backfill: one personal teamspace per existing user that owns rows.
do $$
declare
  r record;
  ts_id text;
  mem_id text;
  slug text;
begin
  for r in
    select distinct user_id from (
      select user_id from public.projects
      union select user_id from public.meetings
      union select user_id from public.tasks
      union select user_id from public.usage_records
    ) u
  loop
    ts_id := 'ts-' || replace(r.user_id::text, '-', '');
    mem_id := 'tm-' || replace(r.user_id::text, '-', '');
    slug := 'workspace-' || substr(replace(r.user_id::text, '-', ''), 1, 12);

    insert into public.teamspaces (id, name, slug, emoji, created_by)
    values (ts_id, 'My workspace', slug, '🏢', r.user_id)
    on conflict (id) do nothing;

    insert into public.teamspace_members (id, teamspace_id, user_id, role, status)
    values (mem_id, ts_id, r.user_id, 'owner', 'active')
    on conflict (teamspace_id, user_id) do nothing;

    update public.projects set teamspace_id = ts_id where user_id = r.user_id and teamspace_id is null;
    update public.meetings set teamspace_id = ts_id where user_id = r.user_id and teamspace_id is null;
    update public.tasks set teamspace_id = ts_id where user_id = r.user_id and teamspace_id is null;
    update public.usage_records set teamspace_id = ts_id where user_id = r.user_id and teamspace_id is null;
  end loop;
end $$;

-- For any remaining nulls (shouldn't happen), leave nullable briefly then enforce
-- via app; fresh rows always set teamspace_id.

create index if not exists projects_teamspace_idx on public.projects (teamspace_id);
create index if not exists meetings_teamspace_idx on public.meetings (teamspace_id, started_at desc);
create index if not exists tasks_teamspace_idx on public.tasks (teamspace_id);
create index if not exists usage_teamspace_idx on public.usage_records (teamspace_id, at desc);

-- ── membership helpers (security definer to avoid RLS recursion) ────────────
create or replace function public.is_teamspace_member(ts text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teamspace_members m
    where m.teamspace_id = ts
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.teamspace_role(ts text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.teamspace_members m
  where m.teamspace_id = ts
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.can_edit_teamspace(ts text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.teamspace_role(ts) in ('owner', 'admin', 'member'), false);
$$;

create or replace function public.can_admin_teamspace(ts text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.teamspace_role(ts) in ('owner', 'admin'), false);
$$;

grant execute on function public.is_teamspace_member(text) to authenticated, anon, service_role;
grant execute on function public.teamspace_role(text) to authenticated, anon, service_role;
grant execute on function public.can_edit_teamspace(text) to authenticated, anon, service_role;
grant execute on function public.can_admin_teamspace(text) to authenticated, anon, service_role;

-- ── RLS: teamspaces ─────────────────────────────────────────────────────────
alter table public.teamspaces enable row level security;
alter table public.teamspace_members enable row level security;
alter table public.teamspace_invites enable row level security;

drop policy if exists "teamspaces select" on public.teamspaces;
drop policy if exists "teamspaces insert" on public.teamspaces;
drop policy if exists "teamspaces update" on public.teamspaces;
drop policy if exists "teamspaces delete" on public.teamspaces;

create policy "teamspaces select" on public.teamspaces
  for select using (public.is_teamspace_member(id));

create policy "teamspaces insert" on public.teamspaces
  for insert with check (auth.uid() = created_by);

create policy "teamspaces update" on public.teamspaces
  for update using (public.can_admin_teamspace(id));

create policy "teamspaces delete" on public.teamspaces
  for delete using (public.teamspace_role(id) = 'owner');

-- members
drop policy if exists "members select" on public.teamspace_members;
drop policy if exists "members insert" on public.teamspace_members;
drop policy if exists "members update" on public.teamspace_members;
drop policy if exists "members delete" on public.teamspace_members;

create policy "members select" on public.teamspace_members
  for select using (public.is_teamspace_member(teamspace_id) or user_id = auth.uid());

-- Users can insert themselves as owner when creating a teamspace; admins can add others.
create policy "members insert" on public.teamspace_members
  for insert with check (
    (user_id = auth.uid() and role = 'owner')
    or public.can_admin_teamspace(teamspace_id)
  );

create policy "members update" on public.teamspace_members
  for update using (public.can_admin_teamspace(teamspace_id));

create policy "members delete" on public.teamspace_members
  for delete using (
    public.can_admin_teamspace(teamspace_id)
    or user_id = auth.uid()
  );

-- invites: admins manage; invitee can read by email match via authenticated session
drop policy if exists "invites select" on public.teamspace_invites;
drop policy if exists "invites insert" on public.teamspace_invites;
drop policy if exists "invites update" on public.teamspace_invites;
drop policy if exists "invites delete" on public.teamspace_invites;

create policy "invites select" on public.teamspace_invites
  for select using (
    public.can_admin_teamspace(teamspace_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "invites insert" on public.teamspace_invites
  for insert with check (public.can_admin_teamspace(teamspace_id));

create policy "invites update" on public.teamspace_invites
  for update using (
    public.can_admin_teamspace(teamspace_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "invites delete" on public.teamspace_invites
  for delete using (public.can_admin_teamspace(teamspace_id));

-- ── Replace personal RLS on domain tables ───────────────────────────────────
drop policy if exists "own rows select" on public.projects;
drop policy if exists "own rows modify" on public.projects;
drop policy if exists "own rows select" on public.meetings;
drop policy if exists "own rows modify" on public.meetings;
drop policy if exists "own rows select" on public.tasks;
drop policy if exists "own rows modify" on public.tasks;
drop policy if exists "own rows select" on public.usage_records;
drop policy if exists "own rows modify" on public.usage_records;

create policy "ts select" on public.projects
  for select using (teamspace_id is not null and public.is_teamspace_member(teamspace_id));
create policy "ts insert" on public.projects
  for insert with check (public.can_edit_teamspace(teamspace_id) and auth.uid() = user_id);
create policy "ts update" on public.projects
  for update using (public.can_edit_teamspace(teamspace_id));
create policy "ts delete" on public.projects
  for delete using (public.can_edit_teamspace(teamspace_id));

create policy "ts select" on public.meetings
  for select using (teamspace_id is not null and public.is_teamspace_member(teamspace_id));
create policy "ts insert" on public.meetings
  for insert with check (public.can_edit_teamspace(teamspace_id) and auth.uid() = user_id);
create policy "ts update" on public.meetings
  for update using (public.can_edit_teamspace(teamspace_id));
create policy "ts delete" on public.meetings
  for delete using (public.can_edit_teamspace(teamspace_id));

create policy "ts select" on public.tasks
  for select using (teamspace_id is not null and public.is_teamspace_member(teamspace_id));
create policy "ts insert" on public.tasks
  for insert with check (public.can_edit_teamspace(teamspace_id) and auth.uid() = user_id);
create policy "ts update" on public.tasks
  for update using (public.can_edit_teamspace(teamspace_id));
create policy "ts delete" on public.tasks
  for delete using (public.can_edit_teamspace(teamspace_id));

create policy "ts select" on public.usage_records
  for select using (teamspace_id is not null and public.is_teamspace_member(teamspace_id));
create policy "ts insert" on public.usage_records
  for insert with check (public.can_edit_teamspace(teamspace_id) and auth.uid() = user_id);
create policy "ts update" on public.usage_records
  for update using (public.can_edit_teamspace(teamspace_id));
create policy "ts delete" on public.usage_records
  for delete using (public.can_edit_teamspace(teamspace_id));

-- Grants
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

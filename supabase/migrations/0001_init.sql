-- Meetly cloud schema (local-first + sync).
--
-- Nested meeting data (transcript, speakers, summary, action items) is stored as
-- JSONB so the local-first client can upsert a whole meeting as one row — sync
-- stays simple while the columns remain queryable. Row-Level Security ensures
-- each user only ever sees their own rows.

-- ── projects ────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Untitled project',
  emoji       text not null default '📁',
  color       text not null default '#2383e2',
  description text,
  updated_at  timestamptz not null default now()
);

-- ── meetings ────────────────────────────────────────────────────────────────
create table if not exists public.meetings (
  id            text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null default 'Untitled meeting',
  emoji         text not null default '🎙️',
  project_id    text references public.projects (id) on delete set null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_secs double precision not null default 0,
  status        text not null default 'ready',
  participants  jsonb not null default '[]'::jsonb,
  speakers      jsonb not null default '[]'::jsonb,
  transcript    jsonb not null default '[]'::jsonb,
  summary       jsonb,
  action_items  jsonb not null default '[]'::jsonb,
  audio_url     text,
  updated_at    timestamptz not null default now()
);
create index if not exists meetings_user_idx on public.meetings (user_id, started_at desc);
create index if not exists meetings_project_idx on public.meetings (project_id);

-- ── tasks ───────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                   text primary key,
  user_id              uuid not null references auth.users (id) on delete cascade,
  project_id           text references public.projects (id) on delete cascade,
  title                text not null default '',
  status               text not null default 'not_started',
  owner                text,
  due                  text,
  source_meeting_id    text,
  source_action_item_id text,
  updated_at           timestamptz not null default now()
);
create index if not exists tasks_user_idx on public.tasks (user_id);
create index if not exists tasks_project_idx on public.tasks (project_id);

-- ── usage / cost ledger ─────────────────────────────────────────────────────
create table if not exists public.usage_records (
  id            text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  at            timestamptz not null default now(),
  provider      text not null,
  model         text not null,
  kind          text not null,
  meeting_id    text,
  audio_seconds double precision,
  input_tokens  integer,
  output_tokens integer,
  cost_usd      double precision not null default 0,
  estimated     boolean not null default false
);
create index if not exists usage_user_idx on public.usage_records (user_id, at desc);

-- ── Row-Level Security ──────────────────────────────────────────────────────
alter table public.projects       enable row level security;
alter table public.meetings       enable row level security;
alter table public.tasks          enable row level security;
alter table public.usage_records  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projects','meetings','tasks','usage_records'] loop
    execute format($f$
      drop policy if exists "own rows select" on public.%1$I;
      drop policy if exists "own rows modify" on public.%1$I;
      create policy "own rows select" on public.%1$I
        for select using (auth.uid() = user_id);
      create policy "own rows modify" on public.%1$I
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;

-- ── Audio storage bucket (private) ──────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

-- Users can read/write only their own audio (path prefixed with their uid).
drop policy if exists "own audio" on storage.objects;
create policy "own audio" on storage.objects
  for all to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

-- API roles need table privileges (RLS still restricts row access).
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

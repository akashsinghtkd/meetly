-- Public storage bucket for desktop app installers (macOS/Windows), uploaded
-- by CI/release scripts via the service_role key. No insert policy is added
-- for anon/authenticated, so only the service_role (which bypasses RLS) can
-- write here; the "public" flag makes uploaded files downloadable by URL.
insert into storage.buckets (id, name, public, file_size_limit)
values ('builds', 'builds', true, 314572800) -- 300MB cap per installer
on conflict (id) do nothing;

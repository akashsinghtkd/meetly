-- Fix teamspace creation RLS chicken-and-egg:
-- INSERT succeeds, but Prefer: return=representation / SELECT policy requires
-- membership that doesn't exist yet → "violates row-level security policy".

-- Creators can always read their own teamspaces (needed for RETURNING + onboarding).
drop policy if exists "teamspaces select" on public.teamspaces;
create policy "teamspaces select" on public.teamspaces
  for select using (
    public.is_teamspace_member(id)
    or created_by = auth.uid()
  );

-- Atomic create: teamspace + owner membership in one security-definer call.
create or replace function public.create_teamspace(
  p_name text,
  p_emoji text default '🏢',
  p_id text default null,
  p_member_id text default null
)
returns public.teamspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ts_id text;
  mem_id text;
  slug text;
  trimmed text;
  row public.teamspaces;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  trimmed := nullif(trim(p_name), '');
  if trimmed is null then
    raise exception 'Teamspace name is required';
  end if;

  ts_id := coalesce(nullif(trim(p_id), ''), 'ts-' || replace(gen_random_uuid()::text, '-', ''));
  mem_id := coalesce(nullif(trim(p_member_id), ''), 'tm-' || replace(gen_random_uuid()::text, '-', ''));

  slug := lower(regexp_replace(trimmed, '[^a-zA-Z0-9]+', '-', 'g'));
  slug := trim(both '-' from slug);
  if slug = '' then
    slug := 'workspace';
  end if;
  slug := left(slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);

  insert into public.teamspaces (id, name, slug, emoji, created_by)
  values (ts_id, trimmed, slug, coalesce(nullif(trim(p_emoji), ''), '🏢'), uid)
  returning * into row;

  insert into public.teamspace_members (id, teamspace_id, user_id, role, status)
  values (mem_id, ts_id, uid, 'owner', 'active');

  return row;
end;
$$;

grant execute on function public.create_teamspace(text, text, text, text) to authenticated;

-- Local dev seed (runs after migrations on `supabase db reset`).
-- Creates the documented sign-in accounts so login works out of the box, and
-- makes meetly@local.dev the platform admin.
--
-- WITHOUT this file, a fresh DB has zero auth users → you cannot sign in, and
-- the platform-admin seed in 0004 (which runs before any user exists) matches
-- nothing. Passwords here are for LOCAL DOCKER ONLY.

create extension if not exists pgcrypto;

do $$
declare
  acct    record;
  new_uid uuid;
begin
  for acct in
    select * from (values
      ('meetly@local.dev',   'meetly123456'),
      ('akdevjam@gmail.com', 'testpass123')
    ) as t(email, pw)
  loop
    -- Skip if the user already exists (idempotent).
    if exists (select 1 from auth.users where lower(email) = lower(acct.email)) then
      continue;
    end if;

    new_uid := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_sso_user,
      is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_uid,
      'authenticated',
      'authenticated',
      lower(acct.email),
      crypt(acct.pw, gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      false,
      false
    );

    -- Matching identity row (email provider). Required for password sign-in.
    insert into auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      new_uid,
      new_uid::text,
      jsonb_build_object('sub', new_uid::text, 'email', lower(acct.email)),
      'email',
      now(),
      now(),
      now()
    );

    raise notice 'Seeded user % (%)', acct.email, new_uid;
  end loop;
end $$;

-- Make meetly@local.dev the platform admin (0004 ran before this user existed).
insert into public.platform_admins (user_id, email)
select id, lower(email) from auth.users
where lower(email) = lower('meetly@local.dev')
on conflict (user_id) do nothing;

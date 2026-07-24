create table items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,            -- NOT NULL if every item has one
  price_cp    integer not null,
  tags        text[] not null default '{}',
  created_at  timestamptz default now()
);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now(),
  role        text not null default 'player' check (role in ('player', 'dm'))
);

create table dm_invites (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  label      text,
  used       boolean not null default false,
  used_by    uuid references profiles(id),
  created_at timestamptz not null default now(),
  used_at    timestamptz
);

CREATE OR REPLACE FUNCTION public.claim_dm_invite(invite_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  claimed_id uuid;
  rows_affected int;
begin
  -- Atomically check-and-claim in a single UPDATE. The WHERE clause
  -- (used = false) and the write happen as one indivisible operation
  -- at the row level. If a second caller races on the same code,
  -- Postgres makes their UPDATE wait for a row lock until the first
  -- one commits -- then re-evaluates WHERE used = false against the
  -- now-current row, sees used = true, and matches zero rows.
  update dm_invites
  set used = true,
      used_by = auth.uid(),
      used_at = now()
  where code = invite_code
    and used = false
  returning id into claimed_id;

  if claimed_id is null then
    raise exception 'Invalid or already-used invite code';
  end if;

  update profiles
  set role = 'dm'
  where id = auth.uid();

  get diagnostics rows_affected = row_count;
  if rows_affected = 0 then
    raise exception 'No profile found for this account';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_dm_invite(invite_label text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_code text;
begin
  -- Only an existing DM may generate new invites.
  -- This check has to happen explicitly, in code, because
  -- security definer bypasses RLS entirely — there's no
  -- policy silently protecting this insert for us.
  if not exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'dm'
  ) then
    raise exception 'Only DMs can generate invites';
  end if;

  new_code := gen_random_uuid()::text;

  insert into dm_invites (code, label)
  values (new_code, invite_label);

  return new_code;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_display_name(new_display_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Reject null, empty, or whitespace-only names.
  -- trim() strips leading/trailing whitespace; a name of "   "
  -- would otherwise pass a plain "is not null" check.
  if new_display_name is null or trim(new_display_name) = '' then
    raise exception 'Display name cannot be empty';
  end if;

  -- Cap length so nobody (accidentally or otherwise) stores a
  -- 10,000-character string in a column meant for a short name.
  if length(new_display_name) > 50 then
    raise exception 'Display name cannot exceed 50 characters';
  end if;

  update profiles
  set display_name = trim(new_display_name)
  where id = auth.uid();
end;
$function$
;

alter table public.items    enable row level security;
alter table public.profiles enable row level security;
alter table public.dm_invites enable row level security;

create policy "insert own profile" on public.profiles for INSERT to public with check ((auth.uid() = id));

create policy "select own profile" on public.profiles for SELECT to public using ((auth.uid() = id));

create policy "dms can view invites" on public.dm_invites for SELECT to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'dm'::text)))));

create policy "Authenticated users can read items" on public.items for SELECT to authenticated using (true);

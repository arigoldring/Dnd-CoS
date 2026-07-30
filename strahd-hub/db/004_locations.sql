-- Map locations and their DM-only notes.
-- The reveal gate lives here, in RLS, not in the UI: players see only
-- revealed locations; DMs see everything, plus a private notes block.
-- Maps.tsx therefore renders whatever comes back without re-filtering.

create table locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  x           numeric not null check (x >= 0 and x <= 100),  -- percent across the map image
  y           numeric not null check (y >= 0 and y <= 100),  -- percent down the map image
  description text,
  is_revealed boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Notes kept out of the base table so they can never leak through a
-- locations SELECT policy: this table is DM-only at the RLS level.
-- One row per location (location_id is both PK and the FK), so a note
-- is deleted automatically when its location is.
create table location_dm_notes (
  location_id uuid primary key references locations(id) on delete cascade,
  notes       text not null default 'no notes yet'
);

alter table public.locations         enable row level security;
alter table public.location_dm_notes enable row level security;

-- Reusable predicate: is the current user a DM?
create or replace function public.is_dm()
 returns boolean
 language sql
 security invoker
 set search_path to 'public'
 stable
as $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'dm'
  );
$function$
;

-- Players read only revealed locations; DMs read all of them.
create policy "read revealed locations" on public.locations
  for SELECT to authenticated
  using (is_revealed or public.is_dm());

-- DM notes are visible only to DMs.
create policy "dms read location notes" on public.location_dm_notes
  for SELECT to authenticated
  using (public.is_dm());

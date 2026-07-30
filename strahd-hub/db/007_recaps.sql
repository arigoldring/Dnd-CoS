create table session_recaps (
  id             uuid primary key default gen_random_uuid(),
  session_number int not null unique,   -- assigned explicitly by the DM, never generated
  title          text,
  body           text not null default '',
  created_at     timestamptz not null default now(),
  -- last_edited_at is the authoritative "has this been edited yet" signal:
  -- nothing but the trigger below ever writes it. Do NOT read last_edited_by
  -- for that -- it is null both before the first edit AND after an editor's
  -- profile is deleted (on delete set null), so on its own it can't tell
  -- "never edited" apart from "edited by someone since gone".
  last_edited_by uuid references profiles(id) on delete set null,
  last_edited_at timestamptz
);

-- Fires on UPDATE only: an insert has nothing to stamp. session_number and
-- created_at arrive from the DM's insert and last_edited_* stay null until
-- someone actually edits, so there is no INSERT branch left to write.
create or replace function public.stamp_session_recap()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
begin
  -- Identity from the JWT, never the payload.
  new.last_edited_by := auth.uid();
  new.last_edited_at := now();
  -- Pin the immutable facts so an edit can't renumber, re-date, or re-key.
  -- RLS can't restrict columns, so this -- not the UPDATE policy -- is what
  -- keeps "any player may edit" from meaning "any player may rewrite anything".
  new.id             := old.id;
  new.session_number := old.session_number;
  new.created_at     := old.created_at;
  return new;
end;
$function$
;

create trigger stamp_session_recap
  before update on public.session_recaps
  for each row execute function public.stamp_session_recap();

alter table public.session_recaps enable row level security;

create policy "authenticated read recaps" on public.session_recaps
  for SELECT to authenticated using (true);

-- Creation is the DM's alone.
create policy "dms create recaps" on public.session_recaps
  for INSERT to authenticated with check (public.is_dm());

-- Editing stays open to every authenticated player.
create policy "authenticated edit recaps" on public.session_recaps
  for UPDATE to authenticated using (true) with check (true);

create policy "dms delete recaps" on public.session_recaps
  for DELETE to authenticated using (public.is_dm());

create policy "authenticated read profiles" on public.profiles
  for SELECT to authenticated
  using (true);
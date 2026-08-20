-- db/044_location_dm_notes_edit.sql
--
-- Let a DM write location_dm_notes from the client, the way 033 did for
-- npc_dm_notes. 018 gave this table a SELECT policy only, so until now a DM
-- could read a location's private note but never create or change one -- the
-- MapView drawer has always rendered selected.dmNotes, but nothing on it could
-- write the field it was reading.
--
-- Both INSERT and UPDATE are required, not just one. The client saves through
-- an upsert on location_id (the primary key, so it is also the default
-- conflict target): the first note on a location with no row yet is an
-- INSERT, every save after it is an UPDATE, from the same button. 033 already
-- learned this the hard way on npc_dm_notes -- "with only the insert policy
-- the feature works once and then starts refusing" -- and 042 hit the same
-- shape again on campaign_map_reveals. Same lesson, third table.
--
-- Both policies reuse the exact subquery 018's read policy runs, rather than a
-- shortcut like `is_campaign_dm((select campaign_id from locations where
-- id = location_id))`. The subquery runs as the invoking user, so it answers
-- through locations' own SELECT policy and fails CLOSED: a DM of another
-- campaign, or a player, gets an empty exists and the write is refused,
-- whatever the row itself says. INSERT has no existing row to test, so `with
-- check` alone is what an insert policy gets; UPDATE gets both clauses, so an
-- edit cannot be aimed at a location the editor does not run.

begin;

create policy "dms create location notes" on public.location_dm_notes
  for INSERT to authenticated
  with check (
    exists (
      select 1 from locations
      where locations.id = location_dm_notes.location_id
        and public.is_campaign_dm(locations.campaign_id)
    )
  );

create policy "dms update location notes" on public.location_dm_notes
  for UPDATE to authenticated
  using (
    exists (
      select 1 from locations
      where locations.id = location_dm_notes.location_id
        and public.is_campaign_dm(locations.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from locations
      where locations.id = location_dm_notes.location_id
        and public.is_campaign_dm(locations.campaign_id)
    )
  );

-- No DELETE policy, for the reason npc_dm_notes gives: clearing a note is
-- `notes = ''`, an update like any other, and the row's lifetime is already
-- tied to its location by the on delete cascade in 004.

-- RLS decides which ROWS a policy admits; it has nothing to say about columns.
-- Without this trigger, both clauses of "dms update location notes" pass for a
-- DM re-keying a note from one of their own locations to another -- both
-- exists checks only ask "does this DM run the campaign", not "is this the row
-- the client meant to touch". The only thing that would ever actually send a
-- different location_id is a client bug, and the result would be one
-- location's note silently overwriting another's. Pinned, so that bug is a
-- no-op instead -- verbatim npc_dm_notes' pin_npc_note_row (033).
create or replace function public.pin_location_note_row()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
begin
  new.location_id := old.location_id;
  return new;
end;
$function$
;

create trigger pin_location_note_row
  before update on public.location_dm_notes
  for each row execute function public.pin_location_note_row();

insert into public.schema_migrations (version) values ('044');

commit;

-- ---------------------------------------------------------------------------
-- verification -- run as a DM who is a member of the campaign a test location
-- belongs to
--
--   -- first save on a location with no note row yet: exercises INSERT
--   insert into location_dm_notes (location_id, notes) values ('<id>', 'test')
--   on conflict (location_id) do update set notes = excluded.notes;
--
--   -- second save on the same location: exercises UPDATE, must not refuse
--   insert into location_dm_notes (location_id, notes) values ('<id>', 'test 2')
--   on conflict (location_id) do update set notes = excluded.notes;
--
--   -- re-keying attempt, expect location_id unchanged (pinned, not an error)
--   update location_dm_notes set location_id = '<other-id>' where location_id = '<id>';
--   select location_id from location_dm_notes where notes = 'test 2'; -- still '<id>'
-- ---------------------------------------------------------------------------

-- Campaign NPCs and their DM-only notes.
--
-- The reveal gate lives in RLS, not in the UI: a player's SELECT returns only
-- the revealed NPCs of campaigns they belong to, so the page renders whatever
-- comes back without re-filtering. Notes are a second table so they can never
-- leak through an npcs SELECT, and they are reachable only through a join that
-- fails closed.
--
-- REQUIRES POSTGRESQL 15 OR LATER. The composite FK below uses the column-list
-- form of ON DELETE SET NULL, which does not exist before 15. Check first --
-- expect 15.0 or higher:
--
--   show server_version;
--
-- Pre-flight, because the composite FK needs a unique or primary key covering
-- exactly (campaign_id, id) on locations and there isn't one yet. This file adds
-- it in the same transaction; the query is here so a failure is a known quantity
-- rather than a surprise:
--
--   select conname, contype, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.locations'::regclass and contype in ('p','u');

begin;

-- ---------------------------------------------------------------------------
-- locations -- the key the composite FK has to point at
-- ---------------------------------------------------------------------------

-- Redundant as a constraint: id is already the primary key, so (campaign_id, id)
-- cannot collide for any reason id alone could not. It exists to be REFERENCED.
-- A foreign key must name a unique or primary key covering exactly its target
-- columns, and this is the one that lets npcs point at "this location, in this
-- campaign" as a single fact instead of two independent ones.
alter table public.locations
  add constraint locations_campaign_id_id_key unique (campaign_id, id);

-- ---------------------------------------------------------------------------
-- npcs
-- ---------------------------------------------------------------------------

create table public.npcs (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,

  -- `name = trim(name)` is the clause doing the real work: without it a
  -- "  Rahadin " pasted out of a PDF stores its padding and then sorts and
  -- compares wrong against "Rahadin" forever after. It also makes the length cap
  -- post-trim for free, so 60 characters plus padding cannot squeak through.
  -- The update trigger trims on the way in, so in practice this is the backstop
  -- for inserts rather than the first line of defence.
  name         text not null check (name = trim(name) and name <> '' and length(name) <= 60),
  description  text,

  -- Nullable: an NPC need not have a known home. A wanderer is an answer, not a
  -- gap waiting to be filled.
  location_id  uuid,

  -- A bare uuid naming a file the client ships, never a path and never a URL.
  -- The row stores an identifier and nothing about where the file lives; the
  -- client owns the layout on disk, so either side can be rearranged without
  -- rewriting the other. Pinned against updates by the trigger below.
  portrait_key text,

  -- false, and the default is load-bearing. The whole roster is seeded before
  -- the campaign starts and revealed session by session, so a default of true
  -- would hand the party every NPC in the book the moment the rows land.
  is_revealed  boolean not null default false,
  created_at   timestamptz not null default now(),

  -- One composite FK, not two separate ones. `campaign_id references campaigns`
  -- plus `location_id references locations` would both be satisfied by an NPC in
  -- campaign A standing in a location that belongs to campaign B -- each half is
  -- valid alone and the combination is nonsense. Naming the pair makes that row
  -- unrepresentable.
  --
  -- The column list on SET NULL is not optional. Bare `on delete set null` nulls
  -- every referencing column, campaign_id included, and campaign_id is NOT NULL
  -- -- so deleting a location would fail with a not-null violation instead of
  -- orphaning the NPC, and deleting a campaign (which cascades into locations)
  -- would fail with it. Listing location_id says what was meant: the NPC stays,
  -- and has no known home again.
  foreign key (campaign_id, location_id)
    references public.locations (campaign_id, id)
    on delete set null (location_id)
);

alter table public.npcs enable row level security;

-- One DM branch and one player branch, rather than one expression sharing a
-- term. The DM branch is what returns UNREVEALED rows, which membership alone
-- never does; a player needs both halves, and the `and` says so.
create policy "read revealed npcs in your campaigns" on public.npcs
  for select to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or (is_revealed and public.is_campaign_member(campaign_id))
  );

-- Both clauses: `using` picks the rows a DM may touch, `with check` says what
-- they may look like afterwards. Same expression in each, so an edit cannot
-- carry an NPC out of a campaign the editor runs and into one they don't -- and
-- the trigger below pins campaign_id on top of that, which is what stops a DM of
-- two campaigns moving an NPC between them.
create policy "dms update npcs" on public.npcs
  for update to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- There is deliberately no INSERT policy and no DELETE policy on this table.
-- NPCs are seeded through psql before the campaign and between sessions, which
-- is where the portrait files and the notes are prepared anyway; creating them
-- from the client is its own piece of work and is deferred, not forgotten. The
-- absence is the decision -- do not add either policy for symmetry.

-- ---------------------------------------------------------------------------
-- npc_dm_notes
-- ---------------------------------------------------------------------------

-- No campaign_id, on the same argument location_dm_notes settles: one row per
-- NPC, keyed by the id it references, so the campaign is one join away and a
-- second copy could only ever disagree with the first. The cascade means a note
-- cannot outlive the NPC that answers the question anyway.
create table public.npc_dm_notes (
  npc_id uuid primary key references public.npcs(id) on delete cascade,
  -- No default. An empty string is an empty note; a sentinel that means
  -- "nothing" has to be recognised and special-cased at every point the value is
  -- read, and one of those points always gets missed.
  notes  text not null
);

alter table public.npc_dm_notes enable row level security;

-- Two gates in one expression, and the outer one is the interesting half. The
-- subquery runs as the invoking user, so it answers through npcs' own SELECT
-- policy: a caller who cannot see the NPC gets a false exists and the note is
-- unreachable, whatever the inner check would have said. That is what makes this
-- fail CLOSED. A DM of another campaign fails both halves; a player looking at a
-- revealed NPC passes the outer gate and is stopped by the inner one.
--
-- npc_dm_notes.npc_id is written out rather than left bare. Bare, it would
-- resolve to the outer relation only because npcs has no column of that name --
-- correct by accident, and silently wrong the day npcs gains one.
create policy "dms read npc notes" on public.npc_dm_notes
  for select to authenticated
  using (
    exists (
      select 1 from npcs
      where npcs.id = npc_dm_notes.npc_id
        and public.is_campaign_dm(npcs.campaign_id)
    )
  );

-- with check only: an insert has no existing row to test, so the NPC being asked
-- about is the one the new row names.
create policy "dms create npc notes" on public.npc_dm_notes
  for insert to authenticated
  with check (
    exists (
      select 1 from npcs
      where npcs.id = npc_dm_notes.npc_id
        and public.is_campaign_dm(npcs.campaign_id)
    )
  );

-- INSERT and UPDATE are both required because the client saves through an
-- upsert: the first save on an NPC with no note row is an insert and every save
-- after it is an update, from the same button. With only the insert policy the
-- feature works once per NPC and then starts refusing, which is the shape of bug
-- that reaches a session before it reaches a test.
create policy "dms update npc notes" on public.npc_dm_notes
  for update to authenticated
  using (
    exists (
      select 1 from npcs
      where npcs.id = npc_dm_notes.npc_id
        and public.is_campaign_dm(npcs.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from npcs
      where npcs.id = npc_dm_notes.npc_id
        and public.is_campaign_dm(npcs.campaign_id)
    )
  );

-- No DELETE policy. Clearing a note is `notes = ''`, and the row's lifetime is
-- tied to its NPC by the cascade above, so there is nothing a delete would do
-- that an update does not do better.

-- ---------------------------------------------------------------------------
-- triggers -- the column restriction RLS cannot express
-- ---------------------------------------------------------------------------

-- RLS decides which ROWS a policy admits; it has nothing to say about columns.
-- This trigger is what turns "dms update npcs" from "a DM may rewrite this row"
-- into "a DM may edit these fields". After it, the writable set is exactly
-- name, description, location_id and is_revealed.
--
-- It is a BLOCKLIST, not an allowlist. It names the columns an update may not
-- touch, so every column added to npcs from here on is writable by default and
-- has to be pinned here deliberately, by someone who remembers this file exists.
-- It fails open, and that is worth knowing before adding a column.
create or replace function public.pin_npc_row()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
begin
  -- Normalised, not rejected. The CHECK on the column would refuse a trailing
  -- space outright, and this is a field the DM edits repeatedly mid-session --
  -- a space pasted off the end of a name should not surface as a raw 23514 in
  -- the middle of a game. The constraint stays as the backstop for anything that
  -- reaches the table without passing through here.
  new.name := trim(new.name);

  -- The immutable facts, pinned so an edit cannot re-key the NPC, rehome it into
  -- another campaign, or re-date it.
  new.id          := old.id;
  new.campaign_id := old.campaign_id;
  new.created_at  := old.created_at;

  -- portrait_key is pinned because portraits are seed-only and a wrong key fails
  -- silently: it names no file, resolves to nothing, and produces no build error
  -- and no runtime exception -- just an NPC that quietly has no picture. A value
  -- that can only be set by a migration written next to the file it names is a
  -- value that has been looked at by someone.
  new.portrait_key := old.portrait_key;

  return new;
end;
$function$
;

create trigger pin_npc_row
  before update on public.npcs
  for each row execute function public.pin_npc_row();

-- Both clauses of "dms update npc notes" pass for a DM moving a note from one of
-- their own NPCs to another of them, so re-keying a note is permitted as far as
-- RLS is concerned. The only thing that ever actually does it is a client bug
-- writing the wrong id, and the result is one NPC's notes silently overwriting
-- another's. Pinned, so that bug is a no-op instead.
create or replace function public.pin_npc_note_row()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
begin
  new.npc_id := old.npc_id;
  return new;
end;
$function$
;

create trigger pin_npc_note_row
  before update on public.npc_dm_notes
  for each row execute function public.pin_npc_note_row();

commit;

-- ---------------------------------------------------------------------------
-- One consequence of the FK worth knowing rather than discovering: npcs now
-- references locations, so `truncate locations cascade` empties npcs as well.
-- TRUNCATE CASCADE follows every foreign key that points at the table, whatever
-- that key's ON DELETE action says. Reseeding the map takes the roster with it.
-- ---------------------------------------------------------------------------

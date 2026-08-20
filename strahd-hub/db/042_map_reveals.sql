-- db/042_map_reveals.sql
--
-- Multi-map support. Which maps a campaign has revealed to its players, and
-- which map each location's pin belongs to.
--
-- Map DEFINITIONS live in code (src/data/maps.ts), not here. Adding a map
-- always means committing an image file, so it is a code change regardless --
-- a maps table would buy no deploy-free flexibility. Reveal STATE is the one
-- thing that genuinely varies per campaign, so that alone gets a table.
--
-- ---------------------------------------------------------------------------
-- campaign_map_reveals -- absences, stated so nobody "fixes" one back in
-- ---------------------------------------------------------------------------
--
--   no surrogate id     (campaign_id, map_key) is the identity and is also the
--                        default upsert conflict target the client relies on --
--                        same reasoning as npc_dm_notes (033).
--
--   no default on
--   is_revealed          absence of a row already means "use the registry
--                        default" (see src/data/maps.ts). A defaulted row would
--                        be a second way to say the same thing, and the two can
--                        disagree the moment the registry default changes.
--
--   no timestamps        nothing here is ever displayed or ordered by when it
--                        changed.
--
--   no FK / enum on
--   map_key               that constraint is the whole content of the registry
--                        decision above. A hand-written seed can still typo one
--                        in (see the risk note at the bottom); the mitigation is
--                        the coordinate-finder in MapView logging the exact key,
--                        not a list here.
--
--   no index              the composite PK's implicit index already leads on
--                        campaign_id, which is the only filter this table will
--                        ever serve (getMapReveals does exactly one
--                        .eq("campaign_id", ...)).
--
--   no backfill            deliberate, and covered below.
--
-- RLS -- two things here are the highest-risk part of this whole migration.
--
-- (a) The read policy is PLAIN MEMBERSHIP, not the two-branch shape 018 gives
-- locations (`is_campaign_dm(...) or (is_revealed and is_campaign_member(...))`).
-- Copying that shape here would be an inversion bug. On locations, hiding the
-- row hides the THING -- an unrevealed location simply isn't in a player's
-- response, which is correct. Here, hiding the row would UNHIDE the map: the
-- client falls back to defaultRevealed when no row comes back (mergeReveals in
-- useMaps.ts), so an is_revealed-gated read would take the DM's
-- is_revealed = false row away from exactly the player it was written to
-- affect, and that player would see whatever the registry defaults to instead
-- of what the DM chose. So this table asks membership alone, on purpose. The
-- DM branch locations needs is unnecessary rather than omitted here: 014 gives
-- a campaign's creator a 'dm' membership row in the same transaction the
-- campaign is created, so is_campaign_member is already true for them -- 018's
-- own argument for dropping a redundant branch, reused.
--
-- (b) Both INSERT and UPDATE are required. The client toggles a map's reveal
-- through one upsert button: the first toggle on a given map is an INSERT,
-- every one after it is an UPDATE, from the same click handler. 033 already
-- learned this the hard way on npc_dm_notes -- "with only the insert policy the
-- feature works once per NPC and then starts refusing" -- and that lesson
-- carries over verbatim. Contrast locations, which has no INSERT policy and
-- needs none: nothing on the client ever creates a location.
--
-- No DELETE policy. "Revert to whatever the registry currently defaults to" is
-- a third state nothing in this feature offers, and it would be confusing if it
-- did -- do not add one for symmetry with other tables.
--
-- ---------------------------------------------------------------------------
-- locations.map_key
-- ---------------------------------------------------------------------------
--
-- `not null default 'barovia'` backfills every existing row in the same
-- statement -- that default assignment IS the backfill, there is no separate
-- update. No index: getLocations filters on campaign_id alone, and 033 already
-- added locations_campaign_id_id_key leading on it; six-ish rows per campaign
-- makes a second index pure overhead.
--
-- The tension worth naming: 'barovia' is the FAIL-OPEN direction for this
-- column. A hand-written village pin whose insert forgets map_key silently
-- lands on the region map instead of erroring or vanishing -- which is much
-- harder to notice than the alternative. seed_campaign_locations naming
-- 'barovia' explicitly below is what makes the column default vestigial for the
-- app's own path; the default exists only to make the ALTER TABLE legal against
-- existing rows and to catch the one write path (the SQL editor) that doesn't
-- go through the seed function.
--
-- ---------------------------------------------------------------------------
-- no campaign_map_reveals backfill -- deliberate
-- ---------------------------------------------------------------------------
--
-- Every existing campaign gets the right answer already, from defaultRevealed
-- in the registry (src/data/maps.ts). Backfilling a row per campaign per map
-- would freeze today's registry defaults into rows that then silently stop
-- tracking the registry the day a default changes -- exactly the disagreement
-- the "no default on is_revealed" note above exists to prevent. The absence of
-- a row is the design; it is not a step that got skipped.
--
-- RUN THE MIGRATION BLOCK BELOW ON ITS OWN, then the verification blocks one at
-- a time. Per 036 the ledger insert is unguarded, so a second run of the
-- migration fails on the primary key and rolls back -- which is the point.


-- ===========================================================================
-- MIGRATION
-- ===========================================================================
--
-- CORRECT OUTPUT: "Success. No rows returned."

begin;

create table public.campaign_map_reveals (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  map_key     text not null,
  is_revealed boolean not null,

  primary key (campaign_id, map_key),

  -- Trimmed, non-empty, capped -- the same shape 033 gives npcs.name, minus the
  -- trim-on-write trigger: nothing here is user-typed free text, it is always a
  -- literal MapDef.id from the registry, so a raw 23514 on a padded string is
  -- not a case that should ever reach a real user.
  constraint campaign_map_reveals_map_key_check
    check (map_key = trim(map_key) and map_key <> '' and length(map_key) <= 40)
);

alter table public.campaign_map_reveals enable row level security;

-- (a) above. Plain membership, no reveal term -- see the header before changing
-- this to match locations' shape.
create policy "members read map reveals"
  on public.campaign_map_reveals for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "dms create map reveals"
  on public.campaign_map_reveals for insert to authenticated
  with check (public.is_campaign_dm(campaign_id));

-- (b) above. Both clauses the same expression: an update must not be able to
-- carry a reveal row into a campaign the editor doesn't run.
create policy "dms update map reveals"
  on public.campaign_map_reveals for update to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- No DELETE policy -- see the header.

alter table public.locations
  add column map_key text not null default 'barovia';

alter table public.locations
  add constraint locations_map_key_check
    check (map_key = trim(map_key) and map_key <> '' and length(map_key) <= 40);

-- create or replace, not a fresh create trigger -- 027's trigger already binds
-- this function by name, and re-running its `create trigger` statement errors
-- against the one that's already there. Only the function body changes here.
create or replace function public.seed_campaign_locations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Insert the standard Curse of Strahd locations for the new campaign
  with seeded as (
    insert into locations (name, x, y, description, is_revealed, campaign_id, map_key) values
      ('Village of Barovia',      78.5, 61.3, 'Cursed Town',                                                     true,  NEW.id, 'barovia'),
      ('Tser Falls',              56.8, 55.9, 'Thundering falls above the Vistani camp at Tser Pool.',            true,  NEW.id, 'barovia'),
      ('Vallaki',                 39.8, 33.4, 'Walled town ruled by a paranoid baron.',                           true,  NEW.id, 'barovia'),
      ('Krezk',                   11.2, 29.9, 'Remote walled village guarding the Abbey of Saint Markovia.',      true,  NEW.id, 'barovia'),
      ('Castle Ravenloft',        71.0, 51.2, 'Strahd''s mountaintop fortress, seat of the land''s curse.',       true,  NEW.id, 'barovia'),
      ('Abbey of Saint Markovia',  8.4, 22.6, 'Ruined abbey on the heights above Krezk.',                        false, NEW.id, 'barovia')
    returning id, name
  )
  insert into location_dm_notes (location_id, notes)
  select id, notes
  from seeded
  join (values
    ('Castle Ravenloft',        'Strahd is home. The Heart of Sorrow beats in the north tower.'),
    ('Abbey of Saint Markovia', 'The Abbot dwells here with his mongrelfolk flock.')
  ) as dm_notes(name, notes) using (name);

  return NEW;
end;
$function$;

insert into public.schema_migrations (version) values ('042');

commit;


-- ===========================================================================
-- VERIFICATION -- run before touching client code
-- ===========================================================================
--
-- Live SQL, not a narrated checklist: every block below runs in its own
-- explicit transaction and ends in ROLLBACK, so it can be run against the live
-- database as many times as you like and leaves nothing behind.
--
-- Run ONE BLOCK AT A TIME. The Supabase SQL editor renders only the last result
-- set of a run, so pasting the whole section would show block 6 and silently
-- discard the six before it.
--
-- The uuids are 037's and 041's, unchanged:
--
--   campaign A   d721b412-2750-492e-bddd-7387fc464bba   The cool kids
--   player of A  1313672b-6990-45a6-8a28-c448ca116d2d   Nat
--   DM of A      ea74d56b-8f45-4e4c-80f8-90a6d29b5adf   Dlizard72
--   DM of B      a52bba44-8278-47d3-8d91-5b47f1fe73cc   PeacefulCow  (not in A)
--
-- Distrust blocks 2 and 5 the most: they are the executable form of (a) and (b)
-- above, and in the browser both failure directions look exactly like "the map
-- I hid is showing" or "the second toggle silently does nothing" -- nothing
-- about either failure shows up as a wrong answer, only as a missing one.


-- ===========================================================================
-- BLOCK 0 -- the migration landed, and it landed with three policies
-- ===========================================================================
--
-- The policy count is the half that is easy to get wrong: four means an extra
-- policy crept in (a DELETE, or a locations-shaped read with two branches),
-- either of which is a bug this migration is explicit about not having.
--
-- CORRECT OUTPUT: three rows.
--   check 0a  table_exists, rls_enabled, ledger_row all true.
--   check 0b  policies holding exactly three entries -- SELECT, INSERT, UPDATE
--             (cmd 'r', 'a', 'w'). Any DELETE ('d') entry is a bug.
--   check 0c  locations.map_key exists, is not nullable, and defaults 'barovia'.

select 'check 0a: table and ledger' as check,
       jsonb_build_object(
         'table_exists', to_regclass('public.campaign_map_reveals') is not null,
         'rls_enabled',  (select relrowsecurity from pg_class
                          where oid = to_regclass('public.campaign_map_reveals')),
         'ledger_row',   exists (select 1 from public.schema_migrations
                                 where version = '042')
       ) as result
union all
select 'check 0b: policies',
       (select jsonb_agg(jsonb_build_object('name', polname, 'cmd', polcmd)
                         order by polname)
        from pg_policy
        where polrelid = to_regclass('public.campaign_map_reveals'))
union all
select 'check 0c: locations.map_key',
       (select jsonb_build_object(
                 'is_nullable', is_nullable,
                 'column_default', column_default
               )
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'locations'
          and column_name = 'map_key');


-- ===========================================================================
-- BLOCK 1 -- the campaign DM upserts a reveal row -> lands, reads back
-- ===========================================================================
--
-- The baseline. If this fails, nothing below means anything.
--
-- CORRECT OUTPUT: one row. rows_for_campaign = 1, is_revealed = true.

begin;

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  insert into campaign_map_reveals (campaign_id, map_key, is_revealed)
  values ('d721b412-2750-492e-bddd-7387fc464bba', 'village-of-barovia', true)
  on conflict (campaign_id, map_key) do update set is_revealed = excluded.is_revealed;

  select 'case 1: the campaign DM upserts a reveal row' as check,
         jsonb_build_object(
           'rows_for_campaign',
             (select count(*) from campaign_map_reveals
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'),
           'is_revealed',
             (select is_revealed from campaign_map_reveals
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                and map_key = 'village-of-barovia')
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 2 -- a plain player of that campaign reads the HIDDEN row -> 1 row
-- ===========================================================================
--
-- This block exists solely to catch (a), the inversion. The DM writes a
-- HIDDEN reveal (is_revealed = false) -- the exact row a locations-shaped
-- `is_revealed and is_campaign_member` policy would take away from the player
-- it was written to affect. Nat is campaign A's existing player fixture (from
-- 037/041), not inserted here, the same way 041's block 1 finds her without
-- writing a campaign_members row.
--
-- CORRECT OUTPUT: one row. rows_visible = 1, is_revealed = false. A zero here
-- means the read policy is gated on is_revealed and this migration has the
-- exact bug its header warns about.

begin;

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  insert into campaign_map_reveals (campaign_id, map_key, is_revealed)
  values ('d721b412-2750-492e-bddd-7387fc464bba', 'village-of-barovia', false)
  on conflict (campaign_id, map_key) do update set is_revealed = excluded.is_revealed;

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select 'case 2: a plain player reads a map the DM hid' as check,
         jsonb_build_object(
           'rows_visible',
             (select count(*) from campaign_map_reveals
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                and map_key = 'village-of-barovia'),
           'is_revealed',
             (select is_revealed from campaign_map_reveals
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                and map_key = 'village-of-barovia')
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 3 -- a player attempts to upsert a reveal -> denied
-- ===========================================================================
--
-- The insert is wrapped so the RLS denial is reported rather than aborting the
-- block, matching 041 block 3's shape.
--
-- CORRECT OUTPUT: one row. outcome = 'denied by RLS (42501)'.

begin;

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  do $$
  begin
    insert into campaign_map_reveals (campaign_id, map_key, is_revealed)
    values ('d721b412-2750-492e-bddd-7387fc464bba', 'village-of-barovia', true);
    perform set_config('verification.outcome', 'INSERT SUCCEEDED -- LEAK', true);
  exception
    when insufficient_privilege then
      perform set_config('verification.outcome', 'denied by RLS (42501)', true);
  end
  $$;

  select 'case 3: a player attempts to upsert a reveal' as check,
         jsonb_build_object(
           'outcome', current_setting('verification.outcome')
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 4 -- a signed-in non-member selects unfiltered -> zero rows
-- ===========================================================================
--
-- A decoy row is written as the DM first, so the zero has force -- against an
-- empty table this check passes with no policy at all. PeacefulCow is left OUT
-- of campaign A here, which is the difference between this block and block 3.
--
-- CORRECT OUTPUT: one row, rows_visible_unfiltered = 0.

begin;

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  insert into campaign_map_reveals (campaign_id, map_key, is_revealed)
  values ('d721b412-2750-492e-bddd-7387fc464bba', 'village-of-barovia', true)
  on conflict (campaign_id, map_key) do update set is_revealed = excluded.is_revealed;

  select set_config(
           'request.jwt.claims',
           '{"sub":"a52bba44-8278-47d3-8d91-5b47f1fe73cc","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select 'case 4: a signed-in non-member reads the table' as check,
         jsonb_build_object(
           'rows_visible_unfiltered', (select count(*) from campaign_map_reveals)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 5 -- the campaign DM toggles the same map twice -> insert, then update
-- ===========================================================================
--
-- (b) above, made executable. The first upsert on a fresh map_key has nothing
-- to conflict with and is a plain INSERT; the second names the same key and
-- becomes an ON CONFLICT DO UPDATE, which needs the UPDATE policy to succeed.
-- With only the INSERT policy this block's second upsert fails with 42501 --
-- the exact "works once, then refuses" shape 033 already hit on npc_dm_notes.
--
-- CORRECT OUTPUT: one row. after_insert = true, after_update = false.

begin;

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  -- First toggle: no existing row, so this is the INSERT branch.
  insert into campaign_map_reveals (campaign_id, map_key, is_revealed)
  values ('d721b412-2750-492e-bddd-7387fc464bba', 'village-of-barovia', true)
  on conflict (campaign_id, map_key) do update set is_revealed = excluded.is_revealed;

  -- Second toggle: same key, so this is the UPDATE branch.
  insert into campaign_map_reveals (campaign_id, map_key, is_revealed)
  values ('d721b412-2750-492e-bddd-7387fc464bba', 'village-of-barovia', false)
  on conflict (campaign_id, map_key) do update set is_revealed = excluded.is_revealed;

  select 'case 5: the same map toggled twice' as check,
         jsonb_build_object(
           'rows_for_map',
             (select count(*) from campaign_map_reveals
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                and map_key = 'village-of-barovia'),
           'is_revealed_after_both_toggles',
             (select is_revealed from campaign_map_reveals
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                and map_key = 'village-of-barovia')
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 6 -- a fresh campaign seeds every location with map_key = 'barovia'
-- ===========================================================================
--
-- Exercises the updated seed_campaign_locations() end to end, and then checks
-- the whole locations table, not just the new campaign's rows -- the second
-- half is what proves the NOT NULL default actually backfilled every existing
-- row rather than only covering inserts from here on. Run as the table owner
-- (no role switch) -- this block is about the trigger, not about RLS.
--
-- CORRECT OUTPUT: two rows. check 6a: location_count = 6, map_keys = ["barovia"].
-- check 6b: null_or_blank_map_keys = 0, table-wide.

begin;

  insert into campaigns (name) values ('Verification Campaign 042');

  select set_config('verification.campaign',
                    (select id::text from campaigns
                     where name = 'Verification Campaign 042'),
                    true);

  select 'check 6a: seeded locations for the new campaign' as check,
         jsonb_build_object(
           'location_count',
             (select count(*) from locations
              where campaign_id = current_setting('verification.campaign')::uuid),
           'map_keys',
             (select jsonb_agg(distinct map_key) from locations
              where campaign_id = current_setting('verification.campaign')::uuid)
         ) as result
  union all
  select 'check 6b: table-wide map_key backfill',
         jsonb_build_object(
           'null_or_blank_map_keys',
             (select count(*) from locations
              where map_key is null or map_key = '')
         );

rollback;


-- ---------------------------------------------------------------------------
-- Blocks 2 and 5 are the ones to distrust. They are the executable form of (a)
-- and (b) from the header, and in the browser both failure directions look
-- exactly like "the map I hid is showing" or "the second toggle silently does
-- nothing" -- neither shows up as a wrong answer, only as a missing one.
--
-- If the client gets a 404/PGRST202 reading campaign_map_reveals or locations
-- after this runs, that is the schema cache, not a missing grant --
-- `notify pgrst, 'reload schema';`. A missing grant reads as 401/42501 instead.
--
-- Then regenerate the client types: npm run gen:types
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';

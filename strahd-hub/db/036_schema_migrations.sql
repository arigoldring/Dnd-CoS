-- db/036_schema_migrations.sql
--
-- The ledger from KNOWN_ISSUES ("Nothing records which migrations have been
-- applied"), plus the one-time backfill of 000-036 that entry calls for.
--
-- Safe to re-run: the create is `if not exists` and the backfill is
-- `on conflict do nothing`, so a half-pasted run can simply be pasted again.
-- That leniency is for THIS file only. Every migration from 037 on inserts its
-- version bare, so a re-run fails on the primary key instead of quietly
-- re-applying -- see the note at the bottom.
--
-- RUN THE THREE BLOCKS BELOW ONE AT A TIME, in order, in the Supabase SQL
-- editor. They are split rather than pasted as one run because the editor
-- renders only the last result set of a run, and an error in an early statement
-- is easily hidden behind the failure of a later one that depended on it. Block
-- 1 in particular exists to print a message, and that message is worth nothing
-- if the thing you actually see is block 3 complaining that the table it wanted
-- to read does not exist.


-- ===========================================================================
-- BLOCK 1 -- Guard: refuse to backfill a migration that visibly did not land
-- ===========================================================================
--
-- A backfill is an assertion about the past, and an assertion is exactly what
-- the ledger exists to replace. So every migration that created a durable,
-- checkable object is checked for it here, and a missing one raises rather than
-- letting block 2 record a claim the database contradicts. 030 and 032 are the
-- ones with genuine doubt attached (the 2026-08-13 PGRST202 episode); the rest
-- are cheap to check while we are here.
--
-- Writes nothing and opens no transaction, which is why it goes first and alone:
-- there is no partial state for a failure here to leave behind, and the raise is
-- the only thing on screen.
--
-- Data-only migrations -- the seeds and fixups, 002 003 005 017 023 024 026 034
-- 035 -- have no object to look for. Those are recorded on the word of whoever
-- runs this file, which is the best that can be done retroactively and is the
-- whole reason the ledger starts here.
--
-- Checked against the catalog rather than through PostgREST, deliberately:
-- PGRST202 means "not in the schema cache", not "does not exist", and telling
-- those apart from the outside is what cost a day in August.
--
-- CORRECT OUTPUT: "Success. No rows returned." Anything else is the exception,
-- and it names the migrations to run before coming back here.

do $$
declare
  missing text;
begin
  select string_agg(format('%s -- expected %s %s', v.version, v.kind, v.obj),
                    E'\n  ' order by v.version)
  into missing
  from (values
    ('000'::text, 'table'::text,    'public.items'::text),
    ('001',       'column',         'items.kind'),
    ('004',       'table',          'public.locations'),
    ('007',       'table',          'public.session_recaps'),
    ('010',       'table',          'public.campaigns'),
    ('013',       'table',          'public.campaign_members'),
    ('014',       'function',       'create_campaign'),
    ('015',       'column',         'items.campaign_id'),
    ('021',       'table',          'public.party_inventory'),
    ('022',       'table',          'public.spells'),
    ('027',       'function',       'seed_campaign_locations'),
    ('028',       'table',          'public.characters'),
    ('028',       'table',          'public.character_inventory'),
    ('029',       'column',         'character_inventory.added_by'),
    ('030',       'function',       'add_character_inventory_item'),
    ('031',       'function',       'add_party_inventory_item'),
    ('032',       'function',       'decrement_character_inventory_item'),
    ('032',       'function',       'decrement_party_inventory_item'),
    ('033',       'table',          'public.npcs'),
    ('033',       'table',          'public.npc_dm_notes'),
    ('033',       'column',         'npcs.is_revealed')
  ) as v(version, kind, obj)
  where case v.kind
          when 'table' then
            to_regclass(v.obj) is null
          when 'function' then
            not exists (
              select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = v.obj
            )
          when 'column' then
            not exists (
              select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name  = split_part(v.obj, '.', 1)
                and column_name = split_part(v.obj, '.', 2)
            )
          -- A kind this CASE does not recognise is a typo in the list above, and
          -- without this arm it would fall out as null, which WHERE reads as
          -- false -- the row would be silently unchecked. That is the fail-open
          -- direction, and on a guard it is the wrong one. `true` reports the
          -- typo'd row as missing, which is noisy and gets fixed.
          else true
        end;

  if missing is not null then
    raise exception
      E'Backfill refused: the database is missing objects from these migrations.\n  %\nRun the named files, then run this one again. Nothing has been written.',
      missing;
  end if;
end
$$;


-- ===========================================================================
-- BLOCK 2 -- the ledger, and the backfill of 000-036
-- ===========================================================================
--
-- Every .sql file in db/ through this one, in order, with one absence by
-- decision: 033_npcs_verification.sql is not a migration. It says so in its own
-- first line -- every block ends in ROLLBACK and it is meant to be run
-- repeatedly against the live database. It shares 033's prefix with
-- 033_npcs.sql, which is also why the version column could not simply be the
-- filename stem.
--
-- 011 is here despite being superseded in part by 013. The ledger records what
-- ran, not what is still true; a file that ran and was later undone is still a
-- file that must not run again.
--
-- CORRECT OUTPUT: "Success. No rows returned." Block 3 is what reads it back.

begin;

create table if not exists public.schema_migrations (
  -- text, not int: matches the filename prefix exactly, and zero-padded text
  -- sorts correctly where '10' < '9' would not.
  version    text primary key,
  -- The backfilled rows below all take the default, so 000-036 share one
  -- timestamp: the moment the ledger was created, not the moment each migration
  -- ran. Nothing recorded the latter, and this file cannot invent it. Read a
  -- cluster of identical timestamps at the bottom of the table as "everything
  -- before the ledger". Rows written by 037 onwards are real.
  applied_at timestamptz not null default now()
);

-- Nothing in the app reads this and nothing should. RLS on with zero policies
-- means authenticated and anon get an empty table through PostgREST; the SQL
-- editor connects as the owner and bypasses it.
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

insert into public.schema_migrations (version) values
  ('000'),  -- baseline: items, profiles
  ('001'),  -- items.kind
  ('002'),  -- items reclassification
  ('003'),  -- general item seed
  ('004'),  -- locations + DM notes
  ('005'),  -- location seed
  ('006'),  -- location edit (DM UPDATE policy)
  ('007'),  -- session_recaps
  ('008'),  -- function grants: revoke EXECUTE from anon
  ('009'),  -- profile role lock
  ('010'),  -- campaigns
  ('011'),  -- campaigns fixup (campaign_players; superseded by 013)
  ('012'),  -- campaign rename
  ('013'),  -- campaign_members replaces campaign_players
  ('014'),  -- create_campaign()
  ('015'),  -- campaign_id on the content tables
  ('016'),  -- campaign-scoped RLS reads
  ('017'),  -- remove untracked legacy campaigns
  ('018'),  -- per-campaign DM on the content writes
  ('019'),  -- per-campaign DM on invites
  ('020'),  -- campaign delete
  ('021'),  -- party_inventory
  ('022'),  -- spells
  ('023'),  -- spell seed
  ('024'),  -- spell catalogue expansion
  ('025'),  -- homebrew items INSERT policy
  ('026'),  -- locations reseed, campaign-scoped
  ('027'),  -- auto-seed locations on campaign creation
  ('028'),  -- characters + character_inventory
  ('029'),  -- character_inventory.added_by from the JWT
  ('030'),  -- character inventory stacks (atomic increment)
  ('031'),  -- party inventory stacks
  ('032'),  -- atomic decrement on both inventories
  ('033'),  -- npcs + npc_dm_notes
  ('034'),  -- npc seed
  ('035'),  -- npc blank-description cleanup
  ('036')   -- this file: the ledger itself
on conflict (version) do nothing;

commit;


-- ===========================================================================
-- BLOCK 3 -- read the ledger back
-- ===========================================================================
--
-- Separate from block 2 so that a block 2 that failed shows its own error
-- rather than this select's complaint about a table that was rolled back.
--
-- CORRECT OUTPUT: 37 rows, '000' through '036', every applied_at within a second
-- of every other.

select version, applied_at
from public.schema_migrations
order by version;


-- ---------------------------------------------------------------------------
-- The convention from here on
-- ---------------------------------------------------------------------------
--
-- Every migration from 037 wraps its whole body in a transaction and ends with
-- its own version, unguarded:
--
--   begin;
--     ... the migration ...
--     insert into public.schema_migrations (version) values ('037');
--   commit;
--
-- No `on conflict` -- that is the point. A re-run fails on the primary key and
-- rolls back, and a half-run leaves no entry, so the table never claims a
-- migration landed that did not.

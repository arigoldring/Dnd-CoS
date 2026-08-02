-- Hangs the content tables off campaigns: items, locations, session_recaps each
-- gain a campaign_id. Until now there was one implicit campaign and no column
-- said so.
--
-- The column means two different things, and that is the whole design rather
-- than an inconsistency. items is a shared SRD catalogue that belongs to no
-- single campaign, so its column is nullable and the ~100 rows already there are
-- left null: null reads as "every campaign", and a value marks one campaign's
-- homebrew. locations and recaps are content that means nothing outside the
-- campaign it was written for, so theirs is not null and every row is stamped
-- with the campaign in step 0.
--
-- What this migration does NOT do is make the column mean anything to RLS --
-- see the note at the bottom before assuming a player can't read across it.

begin;

-- ---------------------------------------------------------------------------
-- step 0 -- the campaign everything already here belongs to
-- ---------------------------------------------------------------------------

-- A fixed uuid rather than gen_random_uuid(): it is written into the column
-- defaults below, which are DDL and cannot read a value out of a query. Pinning
-- it also makes this file re-runnable and the id greppable -- an all-zeros-but-
-- one uuid is visibly hand-placed, so nobody mistakes it for a real one later.
insert into campaigns (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Curse of Strahd')
on conflict (id) do nothing;

-- 014 makes a campaign's creator a dm member of it in the same transaction as
-- the campaign itself. This campaign is not created through 014, so that has to
-- happen by hand or the invariant is false for exactly one row.
--
-- The DM is named outright because there is nobody to ask: auth.uid() is null in
-- a migration, so "the caller" doesn't exist here. That uuid has to already be a
-- profiles row -- campaign_members.user_id references it, and a wrong id fails
-- the FK and rolls the whole file back rather than inserting a dangling member.
--
-- Nothing reads campaign_members.role yet (013), and is_dm() would let a DM in
-- regardless -- this is here so the row is not missing when something does.
insert into campaign_members (campaign_id, user_id, role)
values ('00000000-0000-0000-0000-000000000001', 'ea74d56b-8f45-4e4c-80f8-90a6d29b5adf', 'dm')
on conflict (campaign_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- items -- nullable, because null is an answer here rather than a gap
-- ---------------------------------------------------------------------------

-- The one nullable campaign_id in this file. Everywhere else a null would mean
-- "nobody filled this in"; here it means "shared", which is why there is no
-- default, no backfill, and no truncate. The rows already in this table are the
-- SRD catalogue, and leaving them null is not a step being skipped -- it is the
-- migration. A DM's homebrew arrives later carrying the campaign it was made
-- for, and is the only kind of row that ever sets this column.
--
-- on delete cascade still reads correctly under that split: deleting a campaign
-- takes its homebrew with it and cannot touch a shared row, because a shared row
-- names no campaign to cascade from.
alter table items
  add column campaign_id uuid references campaigns(id) on delete cascade;

create index on items (campaign_id);

-- ---------------------------------------------------------------------------
-- locations + location_dm_notes -- truncated and reseeded
-- ---------------------------------------------------------------------------

-- cascade because location_dm_notes references locations: a plain truncate of a
-- referenced table is refused outright rather than silently orphaning the notes.
-- This empties both, which is why the reseed below writes both.
truncate locations cascade;

-- No default needed here, unlike items: the table is empty, so `not null` has no
-- existing row to be false for.
alter table locations
  add column campaign_id uuid not null references campaigns(id) on delete cascade;

create index on locations (campaign_id);

-- location_dm_notes deliberately does not get a campaign_id. It is one row per
-- location, keyed by the same id it references, so its campaign is already
-- reachable in one join -- a second copy would be a value that can disagree with
-- the first, and the on delete cascade means a note cannot outlive the location
-- that answers the question anyway.

-- 005's seed, now campaign-scoped. Same shape as it had: ids are left to the
-- default and the notes are tied back by name through RETURNING, so no uuid is
-- hardcoded and locations are necessarily inserted before the notes that
-- reference them -- one statement, so the order is not something to remember.
with seeded as (
  insert into locations (name, x, y, description, is_revealed, campaign_id) values
    ('Village of Barovia',      78.5, 61.3, 'Cursed Town',                                                     true,  '00000000-0000-0000-0000-000000000001'),
    ('Tser Falls',              56.8, 55.9, 'Thundering falls above the Vistani camp at Tser Pool.',            true,  '00000000-0000-0000-0000-000000000001'),
    ('Vallaki',                 39.8, 33.4, 'Walled town ruled by a paranoid baron.',                           true,  '00000000-0000-0000-0000-000000000001'),
    ('Krezk',                   11.2, 29.9, 'Remote walled village guarding the Abbey of Saint Markovia.',      true,  '00000000-0000-0000-0000-000000000001'),
    ('Castle Ravenloft',        71.0, 51.2, 'Strahd''s mountaintop fortress, seat of the land''s curse.',       true,  '00000000-0000-0000-0000-000000000001'),
    ('Abbey of Saint Markovia',  8.4, 22.6, 'Ruined abbey on the heights above Krezk.',                        false,  '00000000-0000-0000-0000-000000000001')
  returning id, name
)
insert into location_dm_notes (location_id, notes)
select id, notes
from seeded
join (values
  ('Castle Ravenloft',        'Strahd is home. The Heart of Sorrow beats in the north tower.'),
  ('Abbey of Saint Markovia', 'The Abbot dwells here with his mongrelfolk flock.')
) as dm_notes(name, notes) using (name);

-- ---------------------------------------------------------------------------
-- session_recaps -- truncated, and renumbered per campaign
-- ---------------------------------------------------------------------------

-- Nothing to reseed: recaps are written by the DM in the app, so there has never
-- been a seed file for them. Truncated rather than filled in place only because
-- the rows that exist are test writing.
truncate session_recaps;

alter table session_recaps
  add column campaign_id uuid not null references campaigns(id) on delete cascade;

-- 007 made session_number unique across the whole table, which was right when
-- there was one campaign and is wrong now: it means the second campaign to run
-- can never have a session 1. The uniqueness that was actually meant is "one
-- session 1 per campaign", which is the pair.
--
-- Named by the convention Postgres itself uses for the implicit constraint being
-- dropped -- table_column(s)_key -- so the two read as the same kind of object.
alter table session_recaps drop constraint session_recaps_session_number_key;

alter table session_recaps
  add constraint session_recaps_campaign_id_session_number_key
  unique (campaign_id, session_number);

-- No `create index on session_recaps (campaign_id)` to go with the other two:
-- the unique constraint above is backed by an index on (campaign_id,
-- session_number), and campaign_id is its leading column, so a lookup by
-- campaign alone already uses it. A separate index would be a second copy of the
-- same answer for the planner to maintain and never prefer.

commit;

-- ---------------------------------------------------------------------------
-- what is still open after this
--
-- The column exists; no policy reads it. Every SELECT policy on these tables
-- still predates campaigns -- "Authenticated users can read items" and
-- "authenticated read recaps" are `using (true)`, and "read revealed locations"
-- asks only `is_revealed or is_dm()`. What that leaves open is not the same
-- problem in all three places, and treating it as one is the mistake to avoid.
--
-- locations and recaps are leaking, plainly: a player in one campaign reads
-- every other campaign's map and session history. Both want the same fix, a
-- policy scoped to the campaigns you are a member of, and both are strictly
-- better off for it.
--
-- items is not leaking, mostly. Reading across campaigns is what the shared
-- catalogue is FOR -- the null rows are meant to reach everyone, and a policy
-- scoped the way locations and recaps need would hide the entire SRD list from
-- every player, which is a worse bug than the one it fixes. The only wrong read
-- here is one DM's homebrew turning up in another campaign's shop, so the shape
-- that fits is
--
--   campaign_id is null or <caller is a member of campaign_id>
--
-- letting the catalogue through and walling off the homebrew. Scoping items like
-- the other two is the over-correction to watch for.
-- ---------------------------------------------------------------------------

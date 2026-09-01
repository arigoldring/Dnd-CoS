-- db/fixtures/demo_campaign_reset.sql
--
-- Resets the public demo campaign to a known state: six authored seats with
-- gear, spells, feats, purses and player-written descriptions, plus three
-- recaps with bodies. Run it whenever the demo needs to go back to how it
-- looked before strangers touched it.
--
-- NOT a migration, and deliberately not numbered into db/*.sql. This writes no
-- schema and takes no schema_migrations row, for the reason 036 built that
-- ledger: it answers "which migrations have been applied", and a fixture in the
-- sequence would put a lie in the answer. Same argument, same directory, as
-- test_campaign_seed.sql.
--
-- ---------------------------------------------------------------------------
-- why this is a separate file from test_campaign_seed.sql
-- ---------------------------------------------------------------------------
--
-- That file and test_campaign_teardown.sql are a matched pair: the seed keys on
-- `name = 'Test Roster'` in nine places and the teardown guards on that same
-- name plus '%@fake.invalid'. Re-pointing the seed at this campaign would have
-- left the teardown aimed at a campaign the seed no longer touches -- a worse
-- failure than a duplicated file, because the guard would still pass while
-- protecting nothing. That pair is left alone. This file is its own thing, and
-- has no teardown: the demo campaign is meant to outlive every reset.
--
-- ---------------------------------------------------------------------------
-- why it keys on an id and not a name
-- ---------------------------------------------------------------------------
--
-- test_campaign_seed.sql selects its campaign by name, and needs two assertions
-- to make that safe: one for zero matches, one for duplicates, because nothing
-- stops a DM creating two campaigns with the same name.
--
-- A public demo cannot afford that shape at all. `campaigns` has an UPDATE
-- policy (018, is_campaign_dm), so the name is editable from the app -- and the
-- day someone renames this campaign, a name-keyed reset stops finding it and
-- starts raising instead of resetting, at exactly the moment it is needed. The
-- id cannot be edited: it is the primary key, and 020 is the only path that
-- removes it. So the id is the key, it appears exactly once below, and every
-- statement reads it from there.
--
-- ---------------------------------------------------------------------------
-- why delete-then-insert, and not `on conflict do nothing`
-- ---------------------------------------------------------------------------
--
-- test_campaign_seed.sql ends every insert in `on conflict do nothing`, which
-- makes a re-run a no-op. That is right for a fixture you look at yourself and
-- wrong for the recovery path of a link posted in public, because "no-op" and
-- "reset" are different operations and only one of them is a safety net:
--
--   deleted a character   do-nothing restores it        (looks like it works)
--   renamed a character   do-nothing keeps the new name (silently does not)
--   added junk gear       do-nothing keeps the junk     (silently does not)
--   rewrote a recap body  do-nothing keeps the rewrite  (silently does not)
--
-- Three of those four are the ones a stranger actually does, and all three fail
-- quietly -- the file reports success and the demo stays vandalised. So the
-- character rows and the recaps are deleted first and written fresh.
--
-- ---------------------------------------------------------------------------
-- what the delete reaches, and what it deliberately does not
-- ---------------------------------------------------------------------------
--
-- One statement removes every character in this campaign, and the schema takes
-- the rest with it. Every FK below is ON DELETE CASCADE, confirmed against the
-- live database rather than assumed:
--
--   characters
--     -> character_inventory            (028/029)
--     -> character_spells               (037)
--     -> character_feats                (041)
--     -> character_item_descriptions    (047)
--     -> character_spell_descriptions   (046)
--
-- Scoped to `campaign_id = <the demo campaign>` and nothing wider. The other
-- campaigns in this database, and the shared item/spell/feat catalogues (all
-- `campaign_id is null`), are untouched and unreferenced.
--
-- NOT deleted, each for its own reason:
--
--   campaign_members   The roster survives, including the real accounts that
--                      have rows here. They lose the characters they made in
--                      this campaign -- that is what a reset means -- but keep
--                      their access. Deleting a membership cascades much wider
--                      (see KNOWN_ISSUES.md) and is not this file's job.
--
--   the DM's row       Untouched, and load-bearing: after 018 every path into a
--                      campaign goes through a member with role 'dm', so a
--                      campaign that loses it is invisible to everyone and
--                      editable by no one. Nothing here writes to a row whose
--                      role is 'dm'.
--
--   locations, npcs    Reveal state is DM-only to change (018), so a demo
--   map reveals        visitor cannot vandalise any of it. Nothing to restore.
--
--   party_inventory    KNOWN GAP, written down rather than quietly closed: both
--   party_currency     are is_campaign_member for read AND write, so a visitor
--                      can add to and spend from the party hoard and purse, and
--                      this file does not put either back. See KNOWN_ISSUES.md.
--
-- ---------------------------------------------------------------------------
-- PREREQS
-- ---------------------------------------------------------------------------
--
--   1. The campaign at the id below exists and has a member with role 'dm'.
--      Both are asserted before anything is written.
--
--   2. Six confirmed users at the emails in `roster`, made in Authentication ->
--      Users -> Add user with Auto Confirm on.
--
-- The five non-demo accounts do not need working passwords and never sign in.
-- They are written here by the table owner, and the one place this file cares
-- about their identity is a GUC, not a session -- see the gear insert. Only the
-- demo seat authenticates, and only through /demo.
--
-- ---------------------------------------------------------------------------
-- RE-RUNNABLE
-- ---------------------------------------------------------------------------
--
-- Yes, and that is the point: the second run produces the same six sheets as
-- the first, whatever happened in between. Assertions run before the delete, so
-- a failure costs nothing and leaves the campaign exactly as it was.
--
-- CORRECT OUTPUT: one result set, six rows, one per seat. no_byline must be 0
-- on every row -- see the gear insert. Recap and roster counts arrive as
-- notices in the Messages pane, because the SQL editor renders only the last
-- result set of a run and the six sheets are the more useful one to see.


begin;

-- ===========================================================================
-- THE TARGET -- the only place the campaign id appears
-- ===========================================================================

-- A temp table rather than a repeated literal: every statement below reads the
-- id from here, so re-pointing this file at a different campaign is a one-line
-- edit with no chance of half of it moving. `on commit drop` means it cannot
-- outlive the transaction, including one that rolls back on a failed assertion.
create temp table target (campaign_id uuid primary key) on commit drop;

insert into target (campaign_id) values ('d721b412-2750-492e-bddd-7387fc464bba');


-- ===========================================================================
-- THE CAST -- everything editable is in this section
-- ===========================================================================

-- is_demo marks the seat the public link signs into. Exactly one row may carry
-- it, and the assertion block checks that: it is the character a visitor owns
-- and can edit, so it is the one worth stocking best.
--
-- Emails are matched to seats by hand and the pairing is arbitrary -- these
-- accounts differ only in their addresses. It is written down rather than
-- derived so a re-run cannot shuffle who plays whom.
--
-- display_name is the player, character_name is who they play: the two halves
-- of the "Aldric Thorne / played by Marek Dral" line the dashboard renders.
-- Character names must arrive trimmed and under 50 characters or 028's check
-- constraint rejects them.
create temp table roster (
  email          text primary key,
  display_name   text not null,
  character_name text not null,
  is_demo        boolean not null default false
) on commit drop;

insert into roster (email, display_name, character_name, is_demo) values
  ('test@demo.fake',   'Demo Guest',  'Anika Stroh',     true),
  ('test@demo1.fake',  'Marek Dral',  'Aldric Thorne',   false),
  ('test@demo2.fake',  'Sable Whit',  'Brother Ilyan',   false),
  ('test@demo3.fake',  'Tove Rask',   'Vasha Ridewind',  false),
  ('test1@false.fake', 'Corin Ashe',  'Nym Quickfinger', false),
  ('test4@demo.fake',  'Perrin Vale', 'Ysolde Karth',    false);

-- ---------------------------------------------------------------------------
-- purses (045)
-- ---------------------------------------------------------------------------

-- Five denominations, stored separately, with no conversion between them -- so
-- a purse holding only gold cannot pay a copper price. That is 045's accepted
-- trade-off and KNOWN_ISSUES.md documents it. The spread here exists so the
-- Character page shows all five columns populated on at least one sheet rather
-- than a row of zeroes.
create temp table purse (
  character_name text primary key,
  copper   int not null default 0,
  silver   int not null default 0,
  electrum int not null default 0,
  gold     int not null default 0,
  platinum int not null default 0
) on commit drop;

insert into purse (character_name, copper, silver, electrum, gold, platinum) values
  ('Anika Stroh',     84, 31, 4, 22, 2),
  ('Aldric Thorne',   12,  8, 0, 15, 0),
  ('Brother Ilyan',   40, 22, 0,  9, 1),
  ('Vasha Ridewind',  63, 14, 2, 11, 0),
  ('Nym Quickfinger', 27, 45, 1, 38, 0),
  ('Ysolde Karth',     5, 19, 0, 27, 3);

-- ---------------------------------------------------------------------------
-- gear
-- ---------------------------------------------------------------------------

-- from_dm decides whose name appears in the "added by" line: false stamps the
-- owner (they bought it), true stamps this campaign's DM (they were handed it).
-- 029 added that column because DM-granted and player-bought loot are genuinely
-- different things on a shared sheet, and a fixture where every row said the
-- same thing would never show the difference. Every seat here has at least one
-- of each.
--
-- item_name is joined against the shared catalogue, so these must match the
-- seeded rows exactly -- 'Lantern, Hooded' and 'Studded leather Armor' are the
-- catalogue's spellings, odd as the second one reads. Every name below was
-- checked against the live catalogue before this file was written, and the
-- assertion block re-checks them on every run.
create temp table gear (
  character_name text not null,
  item_name      text not null,
  quantity       int  not null,
  from_dm        boolean not null default false
) on commit drop;

insert into gear (character_name, item_name, quantity, from_dm) values
  -- Anika Stroh -- the demo seat, and the widest kit on the page, because it is
  -- the only sheet a visitor can edit: enough stacks to try a decrement, a stow
  -- and a give-away without running the sheet empty.
  ('Anika Stroh',     'Studded leather Armor', 1,  false),
  ('Anika Stroh',     'Quarterstaff',          1,  false),
  ('Anika Stroh',     'Dagger',                2,  false),
  ('Anika Stroh',     'Spellbook',             1,  false),
  ('Anika Stroh',     'Component Pouch',       1,  false),
  ('Anika Stroh',     'Lantern, Hooded',       1,  false),
  ('Anika Stroh',     'Oil',                   3,  false),
  ('Anika Stroh',     'Rope',                  1,  false),
  ('Anika Stroh',     'Rations',               4,  false),
  ('Anika Stroh',     'Healer''s Kit',         1,  true),
  ('Anika Stroh',     'Potion of Healing',     2,  true),
  ('Anika Stroh',     'Holy Water',            1,  true),

  -- Aldric Thorne -- the front line. No spells at all, which is the point of
  -- him: he is the seat that proves a sheet drops its empty half rather than
  -- printing a zero.
  ('Aldric Thorne',   'Greatsword',            1,  false),
  ('Aldric Thorne',   'Chain Mail',            1,  false),
  ('Aldric Thorne',   'Handaxe',               2,  false),
  ('Aldric Thorne',   'Rations',               5,  false),
  ('Aldric Thorne',   'Torch',                 10, false),
  ('Aldric Thorne',   'Potion of Healing',     2,  true),

  -- Brother Ilyan -- the cleric, and the reason Holy Water is on the sheet.
  ('Brother Ilyan',   'Mace',                  1,  false),
  ('Brother Ilyan',   'Chain Shirt',           1,  false),
  ('Brother Ilyan',   'Shield',                1,  false),
  ('Brother Ilyan',   'Holy Symbol',           1,  false),
  ('Brother Ilyan',   'Holy Water',            3,  true),
  ('Brother Ilyan',   'Healer''s Kit',         1,  false),
  ('Brother Ilyan',   'Rations',               4,  false),

  ('Vasha Ridewind',  'Longbow',               1,  false),
  ('Vasha Ridewind',  'Quiver',                1,  false),
  ('Vasha Ridewind',  'Studded leather Armor', 1,  false),
  ('Vasha Ridewind',  'Dagger',                2,  false),
  ('Vasha Ridewind',  'Hunting Trap',          1,  false),
  ('Vasha Ridewind',  'Rope',                  1,  false),
  ('Vasha Ridewind',  'Rations',               6,  false),
  ('Vasha Ridewind',  'Potion of Healing',     1,  true),

  ('Nym Quickfinger', 'Dagger',                2,  false),
  ('Nym Quickfinger', 'Leather Armor',         1,  false),
  ('Nym Quickfinger', 'Crowbar',               1,  false),
  ('Nym Quickfinger', 'Caltrops',              2,  false),
  ('Nym Quickfinger', 'Lantern, Hooded',       1,  false),
  ('Nym Quickfinger', 'Oil',                   4,  false),
  ('Nym Quickfinger', 'Ball Bearings',         1,  true),

  -- Ysolde Karth -- the deep caster. Light on gear on purpose: her panel is
  -- carried by the spell list, which is the widest one on the page.
  ('Ysolde Karth',    'Quarterstaff',          1,  false),
  ('Ysolde Karth',    'Spellbook',             1,  false),
  ('Ysolde Karth',    'Arcane Focus',          1,  false),
  ('Ysolde Karth',    'Component Pouch',       1,  false),
  ('Ysolde Karth',    'Potion of Healing',     1,  true);

-- ---------------------------------------------------------------------------
-- spells
-- ---------------------------------------------------------------------------

-- Spread across levels rather than piled at one, because a spell list groups
-- under a header per level (spellsByLevel in services/spells.ts) and a
-- single-level list never shows that the grouping works. Ysolde reaches level
-- 5, which is what makes her panel the tall one; Anika spans cantrip to 3.
--
-- Aldric is absent from this table entirely -- see the note on his gear above.
create temp table spellbook (
  character_name text not null,
  spell_name     text not null
) on commit drop;

insert into spellbook (character_name, spell_name) values
  ('Anika Stroh',     'Fire Bolt'),
  ('Anika Stroh',     'Guidance'),
  ('Anika Stroh',     'Mage Armor'),
  ('Anika Stroh',     'Magic Missile'),
  ('Anika Stroh',     'Feather Fall'),
  ('Anika Stroh',     'Misty Step'),
  ('Anika Stroh',     'Mirror Image'),
  ('Anika Stroh',     'Web'),
  ('Anika Stroh',     'Fly'),
  ('Anika Stroh',     'Counterspell'),

  ('Brother Ilyan',   'Sacred Flame'),
  ('Brother Ilyan',   'Guidance'),
  ('Brother Ilyan',   'Bless'),
  ('Brother Ilyan',   'Cure Wounds'),
  ('Brother Ilyan',   'Healing Word'),
  ('Brother Ilyan',   'Command'),
  ('Brother Ilyan',   'Aid'),
  ('Brother Ilyan',   'Spiritual Weapon'),
  ('Brother Ilyan',   'Revivify'),
  ('Brother Ilyan',   'Daylight'),

  ('Vasha Ridewind',  'Longstrider'),
  ('Vasha Ridewind',  'Jump'),
  ('Vasha Ridewind',  'Pass Without Trace'),
  ('Vasha Ridewind',  'Barkskin'),
  ('Vasha Ridewind',  'Conjure Animals'),

  -- Two, and both level 1: enough to put a spell panel on the rogue's seat
  -- without pretending he is a caster.
  ('Nym Quickfinger', 'Disguise Self'),
  ('Nym Quickfinger', 'Grease'),

  ('Ysolde Karth',    'Fire Bolt'),
  ('Ysolde Karth',    'Mage Armor'),
  ('Ysolde Karth',    'Magic Missile'),
  ('Ysolde Karth',    'Shield'),
  ('Ysolde Karth',    'Feather Fall'),
  ('Ysolde Karth',    'Misty Step'),
  ('Ysolde Karth',    'Mirror Image'),
  ('Ysolde Karth',    'Web'),
  ('Ysolde Karth',    'Fireball'),
  ('Ysolde Karth',    'Counterspell'),
  ('Ysolde Karth',    'Fly'),
  ('Ysolde Karth',    'Greater Invisibility'),
  ('Ysolde Karth',    'Polymorph'),
  ('Ysolde Karth',    'Cone of Cold'),
  ('Ysolde Karth',    'Telekinesis');

-- ---------------------------------------------------------------------------
-- feats
-- ---------------------------------------------------------------------------

-- Spread across categories for the reason the spell list is spread across
-- levels: the sheet groups them under a header per category (featsByCategory in
-- services/feats.ts), and a list that lands in one bucket never shows the
-- grouping works. The shared catalogue has six categories -- combat, defense,
-- general, magic, skill, social -- and between them these seats reach all six.
--
-- Aldric is in this table even though he is absent from `spellbook`: the point
-- of him is a character with no magic, not a character with nothing.
create temp table featbook (
  character_name text not null,
  feat_name      text not null
) on commit drop;

insert into featbook (character_name, feat_name) values
  -- Anika reaches four categories on her own, so the demo seat demonstrates the
  -- grouping without a visitor having to open anyone else's sheet.
  ('Anika Stroh',     'Dungeon Delver'),
  ('Anika Stroh',     'Actor'),
  ('Anika Stroh',     'Magic Initiate'),
  ('Anika Stroh',     'Durable'),

  ('Aldric Thorne',   'Great Weapon Master'),
  ('Aldric Thorne',   'Sentinel'),
  ('Aldric Thorne',   'Heavy Armor Master'),
  ('Aldric Thorne',   'Tough'),

  ('Brother Ilyan',   'War Caster'),
  ('Brother Ilyan',   'Inspiring Leader'),
  ('Brother Ilyan',   'Moderately Armored'),

  ('Vasha Ridewind',  'Sharpshooter'),
  ('Vasha Ridewind',  'Mobile'),
  ('Vasha Ridewind',  'Alert'),

  -- Skulker is the one seeded feat with a Dexterity prerequisite, so at least
  -- one row on one sheet exercises the prerequisite line under a name.
  ('Nym Quickfinger', 'Skulker'),
  ('Nym Quickfinger', 'Observant'),
  ('Nym Quickfinger', 'Lucky'),

  -- Elemental Adept is here to put a `repeatable` tag on screen. The sheet can
  -- still only hold it once -- see KNOWN_ISSUES.md.
  ('Ysolde Karth',    'Elemental Adept'),
  ('Ysolde Karth',    'Spell Sniper'),
  ('Ysolde Karth',    'Resilient');

-- ---------------------------------------------------------------------------
-- player-authored descriptions (046, 047)
-- ---------------------------------------------------------------------------

-- Both tables need rows or the feature is invisible on a fresh demo. Both carry
-- the same constraints: custom_name is 1-60 characters trimmed,
-- custom_description is 1-2000, and `_not_empty` refuses a row where both are
-- null -- a row that overrides nothing is unrepresentable by design.
--
-- All three shapes are exercised on purpose, because they render differently
-- and a fixture that only wrote one would never show the other two: name and
-- prose together, prose alone (the catalogue name stays), and a name alone.
create temp table item_desc (
  character_name     text not null,
  item_name          text not null,
  custom_name        text,
  custom_description text
) on commit drop;

insert into item_desc (character_name, item_name, custom_name, custom_description) values
  ('Anika Stroh', 'Lantern, Hooded', 'Sarn''s Lantern',
   'Taken from the wagon on the road in. The shutter sticks halfway, so it throws a bar of light instead of a circle -- useless for reading by, better for not being seen reading.'),
  ('Anika Stroh', 'Dagger', null,
   'Plain, balanced for throwing, and the only thing she brought from home that she has not had to explain to anybody.'),
  ('Nym Quickfinger', 'Crowbar', 'The Persuader', null);

create temp table spell_desc (
  character_name     text not null,
  spell_name         text not null,
  custom_name        text,
  custom_description text
) on commit drop;

insert into spell_desc (character_name, spell_name, custom_name, custom_description) values
  ('Anika Stroh', 'Fire Bolt', 'Emberflick',
   'Barely a spell. A snap of the fingers, and something the size of a wasp goes where she points and keeps going until it hits.'),
  ('Ysolde Karth', 'Fireball', null,
   'She has stopped calling it by its name in front of the others, on the grounds that saying it out loud makes them duck.');

-- ---------------------------------------------------------------------------
-- recaps
-- ---------------------------------------------------------------------------

-- Bodies, not just titles. Recaps is the one screen in this app that is pure
-- prose, so three empty recaps demonstrate nothing -- which is exactly what
-- this campaign held before this file existed.
--
-- session_number is unique per campaign, and these are rewritten from scratch
-- on every run rather than updated: a fresh insert leaves last_edited_by/at
-- null, so a visitor's edit does not leave their name on a recap after the
-- reset. Deleting also sidesteps stamp_session_recap entirely -- it is a BEFORE
-- UPDATE trigger and never sees an insert.
create temp table recap (
  session_number int primary key,
  title          text not null,
  body           text not null
) on commit drop;

insert into recap (session_number, title, body) values
  (1, 'The Mists Take the Road',
   'The road to Daggerford never arrived. Fog closed over the party somewhere past the last waystone, and when it thinned there were gates -- iron, open, and shutting behind them with nobody''s hand on them. A wagon sat abandoned on the verge, horses gone, traces still buckled. Aldric found the driver a hundred paces into the trees, arranged rather than fallen. Nobody slept.'),
  (2, 'The House on Old Svalich Road',
   'Two children stood in the road and asked for help with a monster in the basement. The house was warm, well kept, and entirely empty of the family whose portraits lined the stair. Nym found the nursery first, then the door behind the wardrobe. What waited below was not the monster the children had described, and neither child was in the road when the party climbed back out.'),
  (3, 'Barovia, and the Burgomaster''s Door',
   'The village keeps its shutters closed in daylight. Ismark Kolyanovich opened his to strangers because there was nobody left in Barovia to open it to, and asked the party to carry his sister out of the valley before dark. Brother Ilyan agreed before the rest had finished hearing the terms. Ysolde was the one who noticed the coffin in the front room was already occupied.');


-- ===========================================================================
-- ASSERTIONS -- before anything is deleted, not after
-- ===========================================================================

-- The inserts below all resolve a name to an id through a join, and a join that
-- finds nothing does not error -- it contributes no row. So a single mistyped
-- item name would leave one stack quietly missing from one sheet, and the only
-- symptom would be a tally that looks a bit low.
--
-- Running before the writes matters more here than it did in
-- test_campaign_seed.sql, because this file DELETES first. A failure caught
-- here costs nothing and the campaign is left exactly as it was; the same
-- failure caught afterwards would mean the demo had been emptied and not
-- refilled.

do $$
declare
  target_campaign uuid;
  missing         text;
  demo_seats      int;
begin
  select campaign_id into target_campaign from target;

  -- The campaign itself. Keyed by id, so "wrong name" and "two of them" -- the
  -- two cases test_campaign_seed.sql has to guard -- cannot arise. Only
  -- "deleted" can, and that is what this catches.
  if not exists (select 1 from campaigns where id = target_campaign) then
    raise exception
      'No campaign with id %. It was deleted, or this file is pointed at the wrong database.', target_campaign;
  end if;

  -- The DM row. 018 makes this the difference between a campaign and an
  -- orphan, and this file relies on it twice: for the from_dm byline below, and
  -- for the campaign being readable at all afterwards.
  if not exists (
    select 1 from campaign_members
    where campaign_id = target_campaign and role = 'dm'
  ) then
    raise exception
      'Campaign % has no member with role ''dm''. Adopt it before resetting -- after 018 nobody can read it.', target_campaign;
  end if;

  -- The six dashboard users, reported as one list rather than one at a time, so
  -- a half-finished round of clicking takes one run to diagnose instead of six.
  select string_agg(r.email, ', ' order by r.email) into missing
  from roster r
  where not exists (select 1 from auth.users u where u.email = r.email);

  if missing is not null then
    raise exception
      'No auth user for: %. Create them in Authentication -> Users -> Add user, with Auto Confirm on (see PREREQS).', missing;
  end if;

  -- Exactly one demo seat. Zero means the public link signs in as somebody with
  -- no character; two means the sheet a visitor lands on depends on which row
  -- the planner reached first.
  select count(*) into demo_seats from roster where is_demo;

  if demo_seats <> 1 then
    raise exception 'Expected exactly one is_demo seat in `roster`, found %.', demo_seats;
  end if;

  -- The demo seat is the only account here that ever authenticates, so it is
  -- the only one whose confirmation state matters. Unconfirmed, GoTrue refuses
  -- the password grant and /demo shows a sign-in failure with nothing on screen
  -- explaining why.
  if exists (
    select 1 from roster r
    join auth.users u on u.email = r.email
    where r.is_demo and u.email_confirmed_at is null
  ) then
    raise exception
      'The demo seat''s auth user is unconfirmed. Turn on Auto Confirm for it, or /demo cannot sign in.';
  end if;

  -- The other five never sign in, so unconfirmed is harmless there -- worth a
  -- notice rather than a raise, because forgetting the toggle is easy and the
  -- symptom is nothing at all.
  select string_agg(u.email, ', ' order by u.email) into missing
  from roster r join auth.users u on u.email = r.email
  where not r.is_demo and u.email_confirmed_at is null;

  if missing is not null then
    raise notice 'Unconfirmed (harmless, these never sign in): %', missing;
  end if;

  -- Every gear, spell, feat, purse and description row has to name a character
  -- in `roster`, or it is addressed to nobody.
  select string_agg(distinct character_name, ', ') into missing
  from (select character_name from gear
        union select character_name from spellbook
        union select character_name from featbook
        union select character_name from purse
        union select character_name from item_desc
        union select character_name from spell_desc) g
  where character_name not in (select character_name from roster);

  if missing is not null then
    raise exception 'Rows assigned to a character not in `roster`: %', missing;
  end if;

  -- `campaign_id is null` on the three catalogue lookups below, and it is
  -- load-bearing rather than tidy: it is what makes these the shared SRD rows.
  -- A homebrew row of the same name belonging to another campaign would resolve
  -- here and then read back null through 016's SELECT policy in the app --
  -- visible as a stack with no name on it, which is a bad way to find out.
  select string_agg(distinct n, ', ') into missing
  from (select item_name as n from gear
        union select item_name from item_desc) g
  where not exists (
    select 1 from items i where i.name = g.n and i.campaign_id is null
  );

  if missing is not null then
    raise exception 'Not in the shared item catalogue: %', missing;
  end if;

  select string_agg(distinct n, ', ') into missing
  from (select spell_name as n from spellbook
        union select spell_name from spell_desc) s
  where not exists (
    select 1 from spells sp where sp.name = s.n and sp.campaign_id is null
  );

  if missing is not null then
    raise exception 'Not in the shared spell catalogue: %', missing;
  end if;

  -- Same clause, and it matters more here than for spells: 039 shipped an
  -- INSERT policy with the table, so a campaign's homebrew feat of the same
  -- name is not hypothetical. Resolving one would attach a feat this campaign
  -- cannot read, which the sheet renders by throwing -- see 041's BLOCK 6.
  select string_agg(distinct f.feat_name, ', ') into missing
  from featbook f
  where not exists (
    select 1 from feats ft where ft.name = f.feat_name and ft.campaign_id is null
  );

  if missing is not null then
    raise exception 'Not in the shared feat catalogue: %', missing;
  end if;

  -- A description keys on (character, item) independently of whether that
  -- character owns the item -- 046/047 did that deliberately, so flavour
  -- survives a stow-and-take. It also means nothing in the schema would stop
  -- this fixture describing gear nobody is carrying, which would render as
  -- prose attached to an item absent from the sheet. Checked here instead.
  select string_agg(d.character_name || '/' || d.item_name, ', ') into missing
  from item_desc d
  where not exists (
    select 1 from gear g
    where g.character_name = d.character_name and g.item_name = d.item_name
  );

  if missing is not null then
    raise exception 'Item description for gear the character does not carry: %', missing;
  end if;

  select string_agg(d.character_name || '/' || d.spell_name, ', ') into missing
  from spell_desc d
  where not exists (
    select 1 from spellbook s
    where s.character_name = d.character_name and s.spell_name = d.spell_name
  );

  if missing is not null then
    raise exception 'Spell description for a spell the character does not know: %', missing;
  end if;

  -- Every seat needs a purse row, or 045's five columns fall to their defaults
  -- on that sheet and the reset is not reproducing what it claims to.
  select string_agg(r.character_name, ', ' order by r.character_name) into missing
  from roster r
  where not exists (select 1 from purse p where p.character_name = r.character_name);

  if missing is not null then
    raise exception 'No purse row for: %', missing;
  end if;
end
$$;


-- ===========================================================================
-- THE DELETE -- scoped to one campaign_id, and nothing wider
-- ===========================================================================

-- Everything hanging off a character goes with it by cascade: inventory,
-- spells, feats, and both description tables. See the header for the full list
-- and for what is deliberately left alone.
--
-- This takes the DM's own character too, if they made one. That is correct --
-- the reset restores the six seats below and nothing else -- and it is why the
-- DM's campaign_members row is never touched: their access comes from the
-- membership, not from having a PC.
delete from characters
where campaign_id = (select campaign_id from target);

-- Deleted rather than updated, so last_edited_by/at come back null and a
-- visitor's name does not survive the reset on a recap they rewrote.
delete from session_recaps
where campaign_id = (select campaign_id from target);


-- ===========================================================================
-- THE WRITES
-- ===========================================================================

-- profiles, first, because campaign_members references it.
--
-- role is left at its 'player' default and never named. That is not cosmetic:
-- profiles.role is the global flag is_dm() reads, and the demo account is
-- posted in public -- holding it would let any visitor create campaigns
-- anywhere in this database. Never naming the column means neither a fresh
-- insert nor a re-run can set it, and 009 makes set_display_name the only
-- client path that writes this table at all.
--
-- The conflict clause updates display_name rather than doing nothing, and here
-- that is the reset doing its job: set_display_name is available to any
-- authenticated user, so a visitor can rename the demo seat, and do-nothing
-- would keep whatever they chose.
insert into profiles (id, display_name)
select u.id, r.display_name
from roster r
join auth.users u on u.email = r.email
on conflict (id) do update set display_name = excluded.display_name;

-- campaign_members. role defaults to 'player' and is named explicitly here
-- because the value matters: 018 reads this column, not profiles.role, for
-- every content policy, and 'player' is what keeps a visitor out of the DM
-- branches.
--
-- do-nothing rather than an update, and deliberately: the only row this could
-- collide with is one of these six, and re-running must never rewrite a role.
-- The DM's row is not in `roster` and is never reached by this statement.
insert into campaign_members (campaign_id, user_id, role)
select t.campaign_id, u.id, 'player'
from roster r
join auth.users u on u.email = r.email
cross join target t
on conflict (campaign_id, user_id) do nothing;

-- characters, with 045's purse columns in the same statement -- one row per
-- seat, one write.
--
-- No conflict clause, on purpose. The delete above removed every character in
-- this campaign, so a conflict here would mean something wrote one between the
-- delete and now, and that is worth an error rather than a silent skip.
insert into characters (campaign_id, user_id, name,
                        copper, silver, electrum, gold, platinum)
select t.campaign_id, u.id, r.character_name,
       p.copper, p.silver, p.electrum, p.gold, p.platinum
from roster r
join auth.users u on u.email = r.email
join purse p on p.character_name = r.character_name
cross join target t;

-- character_inventory, in two parts, and the reason is a trigger that is not
-- currently there.
--
-- 029 defines a BEFORE INSERT trigger assigning `new.added_by := auth.uid()` --
-- identity from the JWT, never the payload, which is what stops a player filing
-- their own find under the DM's name. test_campaign_seed.sql is written for
-- that world: it sets request.jwt.claims per adder, omits added_by from the
-- column list entirely, and says naming it "would only be a value for the
-- trigger to discard."
--
-- **029 has not been applied to this database.** Checked directly rather than
-- inferred: `stamp_character_inventory_added_by` exists in neither pg_proc nor
-- pg_trigger, while every other trigger the migrations define is present. So
-- added_by has no trigger, no default, and is plain client-supplied today.
--
-- That makes the GUC technique a silent no-op on its own -- the first run of
-- this file produced null bylines on all 45 stacks, because nothing was reading
-- the claim it went to the trouble of setting. So this file does BOTH, and is
-- correct either way round:
--
--   029 not applied (today)   added_by is named in the insert, and the named
--                             value lands.
--   029 applied (later)       the trigger overwrites added_by with auth.uid(),
--                             which the GUC has already set to that same
--                             adder_id. Identical rows, no edit needed here.
--
-- Naming the column is therefore not the mistake test_campaign_seed.sql warns
-- about; belt and braces are what make the file survive 029 landing without
-- anyone remembering this fixture exists.
--
-- Note what is NOT done here: no `set local role`. auth.uid() reads
-- request.jwt.claims->>'sub', which set_config supplies on its own, and
-- switching role would re-enable RLS -- at which point 028's INSERT policy
-- (`user_id = auth.uid()`) refuses every row for a character that is not the
-- current claim's. The GUC is the whole technique; the role must stay owner.
--
-- Hence the resolved table: the identity has to be constant across an INSERT
-- (one GUC, one statement), so rows are grouped by adder and inserted a group
-- at a time.

create temp table gear_resolved (
  character_id uuid not null,
  item_id      uuid not null,
  quantity     int  not null,
  adder_id     uuid not null,
  primary key (character_id, item_id)
) on commit drop;

-- The join to characters goes through roster.email -> auth.users -> user_id,
-- NOT through characters.name. That mattered in test_campaign_seed.sql because
-- a rename would break a name join; here the characters were just inserted from
-- these same rows, so it is the owner that is stable either way. Kept for the
-- same reason it was written: character_name is the key inside this file's own
-- tables, where it is only ever compared against itself.
insert into gear_resolved (character_id, item_id, quantity, adder_id)
select ch.id,
       i.id,
       g.quantity,
       case when g.from_dm then dm.user_id else ch.user_id end
from gear g
join roster r     on r.character_name = g.character_name
join auth.users u on u.email = r.email
cross join target t
join characters ch on ch.campaign_id = t.campaign_id and ch.user_id = u.id
join items i       on i.name = g.item_name and i.campaign_id is null
cross join lateral (
  select cm.user_id from campaign_members cm
  where cm.campaign_id = t.campaign_id and cm.role = 'dm'
  limit 1
) dm;

do $$
declare
  adder uuid;
begin
  -- Seven passes: one per seat's owner, plus the DM. Grouped rather than looped
  -- row by row because the GUC is the only thing that has to change between
  -- them, and it changes once per adder.
  for adder in select distinct adder_id from gear_resolved loop
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', adder, 'role', 'authenticated')::text,
      true  -- transaction-local, so it cannot outlive this file
    );

    -- added_by IS named, unlike test_campaign_seed.sql -- see the block above.
    -- With 029 unapplied this value is what lands; with 029 applied the trigger
    -- replaces it with auth.uid(), which the set_config above has just set to
    -- the same adder. The GUC and the column agree by construction, so the row
    -- is the same under either regime.
    insert into character_inventory (character_id, item_id, quantity, added_by)
    select gr.character_id, gr.item_id, gr.quantity, gr.adder_id
    from gear_resolved gr
    where gr.adder_id = adder;
  end loop;

  -- Cleared rather than left set. Nothing after this point reads auth.uid(),
  -- but leaving the last adder's identity in the session is the kind of thing
  -- that makes a later statement in the same editor tab behave oddly for a
  -- reason nobody would look for.
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- character_spells. No conflict clause for the reason the characters insert has
-- none: the cascade emptied this table for these characters moments ago.
insert into character_spells (character_id, spell_id)
select ch.id, sp.id
from spellbook s
join roster r     on r.character_name = s.character_name
join auth.users u on u.email = r.email
cross join target t
join characters ch on ch.campaign_id = t.campaign_id and ch.user_id = u.id
join spells sp     on sp.name = s.spell_name and sp.campaign_id is null;

-- character_feats, 037's table one over and written the same way.
insert into character_feats (character_id, feat_id)
select ch.id, ft.id
from featbook f
join roster r     on r.character_name = f.character_name
join auth.users u on u.email = r.email
cross join target t
join characters ch on ch.campaign_id = t.campaign_id and ch.user_id = u.id
join feats ft      on ft.name = f.feat_name and ft.campaign_id is null;

-- The description tables (047, 046). Both key on the character's idea of the
-- thing rather than on the row that says they have it, which is why neither
-- join touches character_inventory or character_spells.
insert into character_item_descriptions
  (character_id, item_id, custom_name, custom_description)
select ch.id, i.id, d.custom_name, d.custom_description
from item_desc d
join roster r     on r.character_name = d.character_name
join auth.users u on u.email = r.email
cross join target t
join characters ch on ch.campaign_id = t.campaign_id and ch.user_id = u.id
join items i       on i.name = d.item_name and i.campaign_id is null;

insert into character_spell_descriptions
  (character_id, spell_id, custom_name, custom_description)
select ch.id, sp.id, d.custom_name, d.custom_description
from spell_desc d
join roster r     on r.character_name = d.character_name
join auth.users u on u.email = r.email
cross join target t
join characters ch on ch.campaign_id = t.campaign_id and ch.user_id = u.id
join spells sp     on sp.name = d.spell_name and sp.campaign_id is null;

-- Recaps. last_edited_by/at are left unset rather than stamped: they are the
-- app's record of who touched a recap last, and after a reset the honest answer
-- is nobody.
insert into session_recaps (campaign_id, session_number, title, body)
select t.campaign_id, rc.session_number, rc.title, rc.body
from recap rc
cross join target t;


-- ===========================================================================
-- WHAT LANDED
-- ===========================================================================

-- The counts that do not fit on the per-character result set arrive as notices,
-- because the SQL editor renders only the LAST result set of a run -- a second
-- select here would silently replace the six sheets below, which are the more
-- useful thing to see.
do $$
declare
  target_campaign uuid;
  n_recaps  int;
  n_members int;
  n_chars   int;
begin
  select campaign_id into target_campaign from target;

  select count(*) into n_recaps  from session_recaps  where campaign_id = target_campaign;
  select count(*) into n_members from campaign_members where campaign_id = target_campaign;
  select count(*) into n_chars   from characters       where campaign_id = target_campaign;

  raise notice 'recaps: % (expect 3)', n_recaps;
  raise notice 'characters: % (expect 6)', n_chars;
  raise notice 'campaign_members: % (6 seeded seats + the DM + anyone else already on the roster)', n_members;
end
$$;

-- Counted from the tables rather than from this file's own lists, so this
-- reports what the database holds and not what the file meant to put there.
--
-- Aldric Thorne showing spells = 0 is correct and is the point of him.
--
-- no_byline is the column that checks the trigger workaround above actually
-- worked, and it must be 0 on every row. Any other number means added_by came
-- back null -- the request.jwt.claims loop did not take -- and those stacks
-- render with no "added by" name in the app. Not fatal, and nothing else on
-- screen would tell you.
select ch.name        as character,
       p.display_name as played_by,
       (select count(*) from character_inventory ci
        where ci.character_id = ch.id) as gear,
       (select coalesce(sum(ci.quantity), 0) from character_inventory ci
        where ci.character_id = ch.id) as carried,
       (select count(*) from character_spells cs
        where cs.character_id = ch.id) as spells,
       (select count(*) from character_feats cf
        where cf.character_id = ch.id) as feats,
       (select count(*) from character_item_descriptions d
        where d.character_id = ch.id)
       + (select count(*) from character_spell_descriptions d
          where d.character_id = ch.id) as descriptions,
       ch.copper || '/' || ch.silver || '/' || ch.electrum || '/'
         || ch.gold || '/' || ch.platinum as purse_cp_sp_ep_gp_pp,
       (select count(*) from character_inventory ci
        where ci.character_id = ch.id and ci.added_by is null) as no_byline
from characters ch
join target t on t.campaign_id = ch.campaign_id
left join profiles p on p.id = ch.user_id
order by ch.name;

commit;


-- ===========================================================================
-- AFTERWARDS
-- ===========================================================================
--
-- No `notify pgrst, 'reload schema'` needed: this file creates no table, column
-- or function, and the schema cache does not track rows. Nothing to regenerate
-- either -- npm run gen:types reads the schema, which is unchanged.
--
-- There is no teardown counterpart. test_campaign_teardown.sql exists to remove
-- a campaign that was only ever a fixture; this one is a live demo that should
-- outlive every reset, and the six auth users behind it are reused rather than
-- recreated. To retire the demo entirely, delete the campaign from the app
-- (020) and the six users from the dashboard, in that order -- the ordering
-- argument in test_campaign_teardown.sql's header applies here unchanged.

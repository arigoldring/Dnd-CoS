-- db/fixtures/test_campaign_seed.sql
--
-- Fills a campaign with a six-seat roster so the layout can be looked at with a
-- full table behind it -- At the Table on the dashboard, the Party page's seat
-- panels, and the per-character gear and spell lists.
--
-- NOT a migration, and deliberately not numbered into db/*.sql. This writes no
-- schema and takes no schema_migrations row: 036 built that ledger to answer
-- "which migrations have been applied", and a fixture numbered into the
-- sequence would put a lie in the answer. It lives in fixtures/ for the same
-- reason, and its counterpart is test_campaign_teardown.sql in this directory.
--
-- ---------------------------------------------------------------------------
-- why this file exists at all
-- ---------------------------------------------------------------------------
--
-- A roster seat cannot be faked. 028 gave characters a COMPOSITE foreign key to
-- campaign_members (campaign_id, user_id) precisely so that "a character for a
-- non-member" is unrepresentable, and campaign_members.user_id references
-- profiles, which references auth.users. There is no nullable link anywhere on
-- that chain, so every character on the roster is chained to a real auth user:
--
--   characters (campaign_id, user_id)  ->  campaign_members (campaign_id, user_id)
--                                            user_id -> profiles (id)
--                                                         id -> auth.users (id)
--
-- Sign-in is Google OAuth and nothing else (services/auth.ts), so the five
-- users this file expects cannot be produced by signing up, and plus-addressed
-- aliases buy nothing -- they make a deliverable address, not a Google account.
-- They are made in the dashboard instead, and they never sign in. See PREREQS.
--
-- ---------------------------------------------------------------------------
-- why it runs as the table owner, and why that is not a shortcut
-- ---------------------------------------------------------------------------
--
-- Every insert below would be refused if it went through RLS, and correctly so:
-- 028's INSERT policy on characters is `user_id = auth.uid()`, which can never
-- hold for a user who is not you. So this runs in the SQL editor as postgres,
-- which owns these tables and is exempt from their policies -- no table here
-- uses FORCE ROW LEVEL SECURITY, as 018 notes -- the same move 037's
-- verification blocks make when they build a fixture before switching role.
-- Nothing here weakens a policy; it steps around them for data that could not
-- exist otherwise, and the app still reads that data through them unchanged.
--
-- Owning a table exempts you from its RLS. It does NOT exempt you from its
-- triggers, and one trigger on character_inventory decides a column this file
-- cares about. That is dealt with where it bites, not here -- see the note above
-- the character_inventory insert.
--
-- ---------------------------------------------------------------------------
-- PREREQS -- both, or this file raises rather than half-seeding
-- ---------------------------------------------------------------------------
--
--   1. A campaign named exactly 'Test Roster', created from the app by your DM
--      account. Created there rather than here on purpose: create_campaign (014)
--      is what writes your campaign_members row with role 'dm', and that row is
--      what makes is_campaign_member true for you -- which is what lets you read
--      the roster at all. It also fires 027's trigger, so the campaign arrives
--      with its six locations and their DM notes already seeded.
--
--   2. Five confirmed users in Authentication -> Users -> Add user, with Auto
--      Confirm on, at the emails in the `roster` table below. `.invalid` is
--      reserved by RFC 2606 and can never route, so these cannot collide with a
--      real address. If the dashboard refuses that TLD, use @example.com and
--      change the domain in both this file and the teardown.
--
-- Your second Google account is the sixth seat, and should join through the real
-- invite flow before or after this runs. This file never touches it: everything
-- below is scoped to the five emails in `roster`.
--
-- ---------------------------------------------------------------------------
-- RE-RUNNABLE
-- ---------------------------------------------------------------------------
--
-- Every insert ends in on conflict, so running this twice is a no-op rather than
-- an error -- which matters, because the SQL editor invites exactly that. The
-- one exception is deliberate: profiles' conflict clause updates display_name,
-- so editing a name in `roster` and re-running fixes it.
--
-- CORRECT OUTPUT: one result set, six rows -- five seeded characters plus your
-- second account's, with a gear and spell count each.


begin;

-- ===========================================================================
-- THE CAST -- everything editable is in this section
-- ===========================================================================

-- Temp tables rather than CTEs because three separate statements below need to
-- read the same lists, and `on commit drop` means they cannot outlive the
-- transaction that made them -- including a transaction that rolls back on a
-- failed assertion.

create temp table roster (
  email          text primary key,
  display_name   text not null,
  character_name text not null
) on commit drop;

-- display_name is the player, character_name is who they play -- the two halves
-- of the "Aldric Thorne / played by Marek Dral" line the dashboard band renders.
-- Character names must arrive trimmed and under 50 characters or 028's check
-- constraint rejects them; there is no definer function trimming on the way in.
insert into roster (email, display_name, character_name) values
  ('marek@fake.invalid',  'Marek Dral',  'Aldric Thorne'),
  ('sable@fake.invalid',  'Sable Whit',  'Brother Ilyan'),
  ('tove@fake.invalid',   'Tove Rask',   'Vasha Ridewind'),
  ('corin@fake.invalid',  'Corin Ashe',  'Nym Quickfinger'),
  ('perrin@fake.invalid', 'Perrin Vale', 'Ysolde Karth');

-- ---------------------------------------------------------------------------
-- gear
-- ---------------------------------------------------------------------------

-- from_dm decides whose name appears in the "added by" line: false stamps the
-- owner (they bought it), true stamps the campaign's DM (they were handed it).
-- 029 added that column because DM-granted and player-bought loot are genuinely
-- different things on a shared sheet, and a fixture where every row said the
-- same thing would never show the difference.
--
-- item_name is joined against the shared catalogue, so these must match the
-- seeded rows exactly -- 'Lantern, Hooded' and 'Studded leather Armor' are the
-- catalogue's spellings, odd as the second one reads. The assertion block below
-- is what turns a typo into a named error instead of a silently missing stack.
--
-- One class of name here could not be checked against this repo before it was
-- written, and it is worth knowing which. The adventuring gear is all from 003,
-- which is in version control. The weapons and armour are not: no file in db/
-- ever inserts them -- 002 only UPDATEs rows it expects to find -- so they were
-- seeded into the live database from somewhere outside the repo. Every weapon
-- and armour name below is therefore taken from 002's `where name =` clauses,
-- on the reasoning that 002 ran successfully against them. If one of them turns
-- out not to exist, the assertion block names it and nothing is written; fix is
-- to swap it for a name that does.
create temp table gear (
  character_name text not null,
  item_name      text not null,
  quantity       int  not null,
  from_dm        boolean not null default false
) on commit drop;

insert into gear (character_name, item_name, quantity, from_dm) values
  -- Aldric Thorne -- the front line. No spells at all, which is the point of
  -- him: he is the seat that proves sheetTally drops its empty half rather than
  -- printing a zero.
  ('Aldric Thorne',   'Greatsword',            1,  false),
  ('Aldric Thorne',   'Chain Mail',            1,  false),
  ('Aldric Thorne',   'Handaxe',               2,  false),
  ('Aldric Thorne',   'Rations',               5,  false),
  ('Aldric Thorne',   'Torch',                10, false),
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

-- Spread across levels rather than piled at one, because the Party page groups
-- a spell list under a header per level (spellsByLevel in services/spells.ts)
-- and a single-level list never shows that the grouping works. Ysolde reaches
-- level 5, which is what makes her panel the tall one.
--
-- Aldric is absent from this table entirely -- see the note on his gear above.
create temp table spellbook (
  character_name text not null,
  spell_name     text not null
) on commit drop;

insert into spellbook (character_name, spell_name) values
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
  -- without pretending he is a caster. Mage Hand would be the obvious third and
  -- is not here -- 023 seeds exactly four cantrips (Fire Bolt, Guidance, Sacred
  -- Flame, Eldritch Blast) and that is not one of them.
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


-- Feats, spread across categories for the reason the spell list is spread
-- across levels: the sheet groups them under a header per category
-- (featsByCategory in services/feats.ts), and a list that lands in one bucket
-- never shows that the grouping works.
--
-- Aldric is in this table even though he is absent from `spellbook` -- the
-- point of him is a character with no magic, not a character with nothing, and
-- two feats give his sheet something in the panel below the empty one.
create temp table featbook (
  character_name text not null,
  feat_name      text not null
) on commit drop;

insert into featbook (character_name, feat_name) values
  -- combat and defense: the fighter, who has no spells to show
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

  -- The rogue gets the two that read as his job, plus Skulker, which is the one
  -- seeded feat with a Dexterity prerequisite -- so at least one row on one
  -- sheet exercises the prerequisite line under a name.
  ('Nym Quickfinger', 'Skulker'),
  ('Nym Quickfinger', 'Observant'),
  ('Nym Quickfinger', 'Lucky'),

  -- Elemental Adept is here to put a `repeatable` tag on screen. The sheet can
  -- still only hold it once -- see KNOWN_ISSUES.md.
  ('Ysolde Karth',    'Elemental Adept'),
  ('Ysolde Karth',    'Spell Sniper'),
  ('Ysolde Karth',    'Resilient');


-- ===========================================================================
-- ASSERTIONS -- before anything is written, not after
-- ===========================================================================

-- The three inserts below all resolve a name to an id through a join, and a
-- join that finds nothing does not error -- it contributes no row. So a single
-- mistyped item name would leave one stack quietly missing from one sheet, and
-- the only symptom would be a tally that looks a bit low. Every lookup this file
-- depends on is checked here first, and each failure names the thing it could
-- not find.
--
-- Running before the writes rather than after them is what makes a failure cost
-- nothing: the raise aborts the transaction with the database untouched.

do $$
declare
  target_campaign uuid;
  campaign_count  int;
  missing         text;
begin
  -- The campaign, and both ways it can be wrong. Two campaigns of the same name
  -- is not hypothetical -- nothing stops a DM creating 'Test Roster' twice --
  -- and picking one at random would seed a table nobody is looking at.
  select count(*) into campaign_count from campaigns where name = 'Test Roster';

  if campaign_count = 0 then
    raise exception
      'No campaign named ''Test Roster''. Create it from the app as your DM account first (see PREREQS).';
  elsif campaign_count > 1 then
    raise exception
      'Found % campaigns named ''Test Roster''. Delete the spares, or edit this file to select by id.', campaign_count;
  end if;

  select id into target_campaign from campaigns where name = 'Test Roster';

  -- The five dashboard users. Reported as one list rather than one at a time, so
  -- a half-finished round of clicking takes one run to diagnose instead of five.
  select string_agg(r.email, ', ' order by r.email) into missing
  from roster r
  where not exists (select 1 from auth.users u where u.email = r.email);

  if missing is not null then
    raise exception
      'No auth user for: %. Create them in Authentication -> Users -> Add user, with Auto Confirm on (see PREREQS).', missing;
  end if;

  -- An unconfirmed user is not an error here -- nothing about this fixture reads
  -- email_confirmed_at, and these accounts never sign in -- so it is a notice
  -- rather than a raise. Worth saying out loud anyway, because forgetting the
  -- Auto Confirm toggle is the easiest step to miss.
  select string_agg(u.email, ', ' order by u.email) into missing
  from roster r join auth.users u on u.email = r.email
  where u.email_confirmed_at is null;

  if missing is not null then
    raise notice 'Unconfirmed (harmless, these never sign in): %', missing;
  end if;

  -- Every gear, spell and feat row has to name a character in `roster`, or it
  -- is addressed to nobody.
  select string_agg(distinct character_name, ', ') into missing
  from (select character_name from gear
        union select character_name from spellbook
        union select character_name from featbook) g
  where character_name not in (select character_name from roster);

  if missing is not null then
    raise exception 'Gear, spells or feats assigned to a character not in `roster`: %', missing;
  end if;

  -- `campaign_id is null` on both lookups below, and it is load-bearing rather
  -- than tidy: it is what makes these the shared SRD rows. A homebrew item of
  -- the same name belonging to some other campaign would resolve here and then
  -- read back null through 016's SELECT policy in the app -- visible as a stack
  -- with no name on it, which is a bad way to find out.
  select string_agg(distinct g.item_name, ', ') into missing
  from gear g
  where not exists (
    select 1 from items i where i.name = g.item_name and i.campaign_id is null
  );

  if missing is not null then
    raise exception 'Not in the shared item catalogue: %', missing;
  end if;

  select string_agg(distinct s.spell_name, ', ') into missing
  from spellbook s
  where not exists (
    select 1 from spells sp where sp.name = s.spell_name and sp.campaign_id is null
  );

  if missing is not null then
    raise exception 'Not in the shared spell catalogue: %', missing;
  end if;

  -- Same `campaign_id is null` for the same reason, and it matters more here
  -- than it does for spells: 039 shipped an INSERT policy with the table, so a
  -- campaign's homebrew feat of the same name is not hypothetical. Resolving one
  -- would attach a feat this campaign cannot read, which the sheet renders by
  -- throwing -- see KNOWN_ISSUES.md and 041's BLOCK 6.
  select string_agg(distinct f.feat_name, ', ') into missing
  from featbook f
  where not exists (
    select 1 from feats ft where ft.name = f.feat_name and ft.campaign_id is null
  );

  if missing is not null then
    raise exception 'Not in the shared feat catalogue: %', missing;
  end if;

  -- The DM, who from_dm stamps as the giver. Absent only if the campaign was
  -- made by hand instead of through create_campaign, which would mean the DM
  -- cannot read the roster either -- worth catching here rather than letting it
  -- surface as an empty page.
  if not exists (
    select 1 from campaign_members
    where campaign_id = target_campaign and role = 'dm'
  ) then
    raise exception
      'Campaign ''Test Roster'' has no member with role ''dm''. Create it from the app rather than by hand.';
  end if;
end
$$;


-- ===========================================================================
-- THE WRITES
-- ===========================================================================

-- profiles, first, because campaign_members references it.
--
-- role is left at its 'player' default and never set to 'dm'. That is not
-- cosmetic: profiles.role is the global flag is_dm() reads, and a fixture user
-- holding it could create campaigns anywhere in the database.
--
-- The one conflict clause here that updates rather than doing nothing: editing a
-- display_name in `roster` and re-running should fix the name, and do-nothing
-- would silently keep the old one.
insert into profiles (id, display_name)
select u.id, r.display_name
from roster r
join auth.users u on u.email = r.email
on conflict (id) do update set display_name = excluded.display_name;

-- campaign_members. role defaults to 'player'; the check constraint on that
-- column is what keeps anything else out of it.
insert into campaign_members (campaign_id, user_id, role)
select c.id, u.id, 'player'
from roster r
join auth.users u on u.email = r.email
cross join (select id from campaigns where name = 'Test Roster') c
on conflict (campaign_id, user_id) do nothing;

-- characters. The unique constraint 028 put on (campaign_id, user_id) is what
-- makes do-nothing the right clause: one character per player per campaign, and
-- a re-run must not try for a second.
insert into characters (campaign_id, user_id, name)
select c.id, u.id, r.character_name
from roster r
join auth.users u on u.email = r.email
cross join (select id from campaigns where name = 'Test Roster') c
on conflict (campaign_id, user_id) do nothing;

-- character_inventory, in two parts, and the reason is a trigger.
--
-- 029 puts a BEFORE INSERT trigger on this table that assigns
-- `new.added_by := auth.uid()` -- identity from the JWT, never the payload,
-- which is exactly right and is what stops a player filing their own find under
-- the DM's name. Triggers are not RLS, though: owning the table does not skip
-- them. So a plain owner insert naming added_by would have it silently replaced
-- by auth.uid(), which is NULL in the SQL editor -- and every stack in the
-- fixture would come back with no byline at all, rendering as a missing "added
-- by" line on every sheet.
--
-- Disabling the trigger for the duration would work and is not what this does.
-- Setting request.jwt.claims per adder and letting the trigger read it produces
-- the same rows through the same code path the app uses, so what lands here is
-- what would have landed had these people really added this gear. It is also
-- 037's verification technique, used for its own purpose rather than a test's.
--
-- Hence the resolved table: the identity has to be constant across an INSERT
-- (one GUC, one statement), so the rows are grouped by adder and inserted one
-- group at a time.

create temp table gear_resolved (
  character_id uuid not null,
  item_id      uuid not null,
  quantity     int  not null,
  adder_id     uuid not null,
  primary key (character_id, item_id)
) on commit drop;

-- The join to characters goes through roster.email -> auth.users -> user_id, NOT
-- through characters.name. Deliberate: on a re-run after somebody renamed a
-- character in the app, a name join would find nothing and quietly skip that
-- sheet, while the owner is stable. character_name stays as the key inside the
-- fixture's own tables, where it is only ever compared against itself.
insert into gear_resolved (character_id, item_id, quantity, adder_id)
select ch.id,
       i.id,
       g.quantity,
       case when g.from_dm then dm.user_id else ch.user_id end
from gear g
join roster r     on r.character_name = g.character_name
join auth.users u on u.email = r.email
cross join (select id from campaigns where name = 'Test Roster') c
join characters ch on ch.campaign_id = c.id and ch.user_id = u.id
join items i       on i.name = g.item_name and i.campaign_id is null
cross join lateral (
  select cm.user_id from campaign_members cm
  where cm.campaign_id = c.id and cm.role = 'dm'
  limit 1
) dm;

do $$
declare
  adder uuid;
begin
  -- Six passes: one per character's owner, plus the DM. Grouped rather than
  -- looped row by row because the GUC is the only thing that has to change
  -- between them, and it changes once per adder.
  for adder in select distinct adder_id from gear_resolved loop
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', adder, 'role', 'authenticated')::text,
      true  -- transaction-local, so it cannot outlive this file
    );

    -- added_by is deliberately NOT in the column list: the trigger is what sets
    -- it, and naming it here would only be a value for the trigger to discard.
    -- on conflict names the constraint 030 added, which is also what the app's
    -- own add path arbitrates against.
    insert into character_inventory (character_id, item_id, quantity)
    select gr.character_id, gr.item_id, gr.quantity
    from gear_resolved gr
    where gr.adder_id = adder
    on conflict (character_id, item_id) do nothing;
  end loop;

  -- Cleared rather than left set. Nothing after this point reads auth.uid(), but
  -- leaving the last adder's identity lying around in the session is the kind of
  -- thing that makes a later statement in the same editor tab behave oddly for a
  -- reason nobody would look for.
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- character_spells. 037's unique (character_id, spell_id) is the same shape as
-- the constraint above and takes the same clause -- and it is the one the app
-- itself leans on, via the upsert's ignoreDuplicates.
insert into character_spells (character_id, spell_id)
select ch.id, sp.id
from spellbook s
join roster r     on r.character_name = s.character_name
join auth.users u on u.email = r.email
cross join (select id from campaigns where name = 'Test Roster') c
join characters ch on ch.campaign_id = c.id and ch.user_id = u.id
join spells sp     on sp.name = s.spell_name and sp.campaign_id is null
on conflict (character_id, spell_id) do nothing;

-- character_feats. 041's unique (character_id, feat_id) is 037's constraint one
-- table over and takes the same clause, for the same reason: it is the one the
-- app itself leans on, via the upsert's ignoreDuplicates.
insert into character_feats (character_id, feat_id)
select ch.id, ft.id
from featbook f
join roster r     on r.character_name = f.character_name
join auth.users u on u.email = r.email
cross join (select id from campaigns where name = 'Test Roster') c
join characters ch on ch.campaign_id = c.id and ch.user_id = u.id
join feats ft      on ft.name = f.feat_name and ft.campaign_id is null
on conflict (character_id, feat_id) do nothing;


-- ===========================================================================
-- WHAT LANDED
-- ===========================================================================

-- Counted from the tables rather than from the fixture's own lists, so this
-- reports what the database holds and not what this file meant to put there.
--
-- Six rows expected: the five above plus your second Google account's character.
-- That sixth row is the one to read closely -- if it is missing, the invite was
-- never claimed, and if its display_name is null, that account has not set a
-- name yet (NamePrompt), which the app renders as "someone since departed".
--
-- Aldric Thorne showing spells = 0 is correct and is the point of him. He has
-- the most feats of anyone for the same reason.
--
-- no_byline is the column that checks the trigger workaround above actually
-- worked, and it should be 0 on every row. Any other number means added_by came
-- back null -- the request.jwt.claims loop did not take, and those stacks will
-- render with no "added by" name in the app. Not fatal, and not worth raising
-- over: the roster is still perfectly good to look at. Worth seeing, though,
-- because nothing else on screen would tell you.

select ch.name          as character,
       p.display_name   as played_by,
       (select count(*) from character_inventory ci where ci.character_id = ch.id) as gear,
       (select coalesce(sum(ci.quantity), 0) from character_inventory ci where ci.character_id = ch.id) as carried,
       (select count(*) from character_spells cs where cs.character_id = ch.id) as spells,
       (select count(*) from character_feats cf where cf.character_id = ch.id) as feats,
       (select count(*) from character_inventory ci
        where ci.character_id = ch.id and ci.added_by is null) as no_byline
from characters ch
join campaigns c on c.id = ch.campaign_id
left join profiles p on p.id = ch.user_id
where c.name = 'Test Roster'
order by ch.name;

commit;


-- ===========================================================================
-- AFTERWARDS
-- ===========================================================================
--
-- No `notify pgrst, 'reload schema'` needed: this file creates no table,
-- column or function, and the schema cache does not track rows. Nothing to
-- regenerate either -- npm run gen:types reads the schema, which is unchanged.
--
-- To undo all of it, run test_campaign_teardown.sql in this directory. Do not
-- delete the auth users by hand first -- the order matters, and that file
-- explains why.

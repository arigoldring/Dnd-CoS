-- db/048_auto_seed_npcs.sql
--
-- NPCs get the same auto-seed-on-campaign-creation treatment locations have had
-- since 027: a brand new campaign now gets the standard roster (Strahd,
-- Rahadin, Rose and Thorn) without a trip to the SQL editor, the same way it
-- already gets the standard locations. 034's copy-paste template is superseded
-- by this for every NEW campaign; it remains correct advice for backfilling an
-- EXISTING one -- npcs still has no INSERT policy, on purpose (KNOWN_ISSUES).
--
-- Two things happen here, in one transaction:
--
--   1. seed_campaign_locations() (027, 042, 043) is extended once more, in
--      place, to add Death House -- Rose and Thorn's home, not currently seeded
--      on any map. Fourth version of this function; the trigger binding from
--      027 is untouched.
--
--   2. A NEW function and trigger, seed_campaign_npcs() /
--      seed_npcs_on_campaign_create, shaped exactly like 027's original:
--      resolves each NPC's location_id by name, scoped to the new campaign, the
--      same lookup 034's manual template has always done by hand.
--
-- ORDERING, and why this is safe rather than lucky: Postgres fires multiple
-- AFTER triggers for the same event on the same table in alphabetical order by
-- trigger name -- documented behaviour, not an accident of creation order.
-- 'seed_locations_on_campaign_create' sorts before 'seed_npcs_on_campaign_create'
-- ('l' < 'n'), so every location this file adds already exists by the time the
-- NPC trigger's by-name lookups run. DO NOT rename either trigger without
-- preserving that ordering, and check where its name sorts before adding a
-- third campaign-creation trigger.
--
-- PORTRAIT_KEY IS SET IN THE INSERT, NOT AN UPDATE AFTERWARDS. pin_npc_row (033)
-- pins that column against UPDATE specifically because a wrong key fails
-- silently -- but it is a BEFORE UPDATE trigger and has nothing to say about
-- INSERT. Setting it as a fifth value in the same insert that creates the row
-- sidesteps the pin entirely; a separate UPDATE step here would silently no-op,
-- the exact gotcha CLAUDE.md documents.
--
-- PLACEHOLDER COORDINATES: Death House's (x, y) below are NOT real map
-- coordinates -- I have not seen the village-of-barovia image. Before running
-- this file, open Maps as DM, click roughly where Death House should sit (the
-- edge of the village, per the module), and read the logged
-- `MAP COORDS [village-of-barovia]: X.X Y.Y` from the browser console
-- (MapView.tsx's DM-only coordinate finder -- the same tool 043 used). Replace
-- the two numbers below with the real ones before running this migration.
--
-- NO BACKFILL BLOCK. Unlike 034/043, the target campaign does not exist yet --
-- this migration is written for campaign creation going forward, not for
-- d721b412-2750-492e-bddd-7387fc464bba. If Rose and Thorn and Death House
-- should also appear in that existing campaign, that is a separate, explicit
-- decision -- copy 034's backfill-block pattern, not this file.
--
-- is_revealed, both new rows: false. Death House matches Abbey of Saint
-- Markovia -- an optional location the party does not see from the road.
-- Rose and Thorn matches every NPC 034 seeds that isn't immediately known --
-- revealed session by session. Both are judgment calls, not derived facts;
-- flip them here if wrong.
--
-- Rose and Thorn's dm_notes text is player-hidden by construction (npc_dm_notes
-- is a separate, DM-only-readable table -- see 033) -- it will never reach a
-- player's screen the way the public `description` does.

begin;

-- ---------------------------------------------------------------------------
-- 1. seed_campaign_locations() -- fourth version (027, 042, 043, now this).
--    Only the body changes.
-- ---------------------------------------------------------------------------

create or replace function public.seed_campaign_locations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  with seeded as (
    insert into locations (name, x, y, description, is_revealed, campaign_id, map_key) values
      -- the region map (barovia), unchanged since 042
      ('Village of Barovia',      78.5, 61.3, 'Cursed Town',                                                     true,  NEW.id, 'barovia'),
      ('Tser Falls',              56.8, 55.9, 'Thundering falls above the Vistani camp at Tser Pool.',            true,  NEW.id, 'barovia'),
      ('Vallaki',                 39.8, 33.4, 'Walled town ruled by a paranoid baron.',                           true,  NEW.id, 'barovia'),
      ('Krezk',                   11.2, 29.9, 'Remote walled village guarding the Abbey of Saint Markovia.',      true,  NEW.id, 'barovia'),
      ('Castle Ravenloft',        71.0, 51.2, 'Strahd''s mountaintop fortress, seat of the land''s curse.',       true,  NEW.id, 'barovia'),
      ('Abbey of Saint Markovia',  8.4, 22.6, 'Ruined abbey on the heights above Krezk.',                        false, NEW.id, 'barovia'),
      -- the Village of Barovia map (Area E), unchanged since 043
      ('Bildrath''s Mercantile',  48.6, 61.0, 'The village''s general store, sparsely stocked and expensive.',           true, NEW.id, 'village-of-barovia'),
      ('Blood of the Vine Tavern',49.2, 50.2, 'The village tavern and inn, run by the Martikov family.',                 true, NEW.id, 'village-of-barovia'),
      ('Mad Mary''s Townhouse',   44.1, 66.8, 'A modest home near the village square, kept by a reclusive widow.',       true, NEW.id, 'village-of-barovia'),
      ('Burgomaster''s Mansion',  43.3, 88.6, 'Home of the late Burgomaster Kolyan Indirovich and his children.',        true, NEW.id, 'village-of-barovia'),
      ('Church',                  26.2, 29.7, 'A small, weathered church at the edge of the village.',                   true, NEW.id, 'village-of-barovia'),
      ('Cemetery',                28.5, 15.5, 'The village burial ground, overgrown and often shrouded in mist.',        true, NEW.id, 'village-of-barovia'),
      -- new in 048 -- PLACEHOLDER (x, y), see header. Not revealed by default.
      ('Death House',             20.0, 70.0, 'A dilapidated old house at the edge of the village.',                    false, NEW.id, 'village-of-barovia')
    returning id, name
  )
  insert into location_dm_notes (location_id, notes)
  select id, notes
  from seeded
  join (values
    ('Castle Ravenloft',        'Strahd is home. The Heart of Sorrow beats in the north tower.'),
    ('Abbey of Saint Markovia', 'The Abbot dwells here with his mongrelfolk flock.'),
    ('Blood of the Vine Tavern','The Martikovs are Wildhunt shifters, secretly working against Strahd. They shelter refugees and pass along information to allies of the party.'),
    ('Mad Mary''s Townhouse',   'Mary Wistoft (''Mad Mary'') keeps the reanimated corpses of her two dead children as zombies locked in the attic.'),
    ('Burgomaster''s Mansion',  'Kolyan died the night the party likely arrives. His daughter Ireena is Strahd''s obsession -- the reincarnation of his lost love Tatyana -- and his son Ismark now leads the village.'),
    ('Church',                  'Father Donavich has lost his faith and keeps the reanimated corpse of his son Doru chained in the crypt below.')
  ) as dm_notes(name, notes) using (name);

  return NEW;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. seed_campaign_npcs() -- new. Same shape as seed_campaign_locations (027):
--    a security-definer trigger function bypassing npcs' missing INSERT policy
--    the same way 027 always bypassed locations' missing one.
-- ---------------------------------------------------------------------------

create or replace function public.seed_campaign_npcs()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  with seeded as (
    insert into npcs (campaign_id, name, description, location_id, is_revealed, portrait_key)
    select NEW.id,
           v.name,
           v.description,
           (select l.id from locations l
            where l.campaign_id = NEW.id and l.name = v.location_name),
           v.is_revealed,
           v.portrait_key
    from (values
      (
        'Strahd von Zarovich',
        'The vampire lord who rules Barovia, ancient and cursed to relive his tragic love story forever.',
        'Castle Ravenloft',
        true,
        null::text
      ),
      (
        'Rahadin',
        'Strahd''s Dusk Elf chamberlain and executioner, fiercely loyal and centuries old.',
        'Castle Ravenloft',
        false,
        null::text
      ),
      (
        'Rose and Thorn',
        'A young girl and her little brother.',
        'Death House',
        false,
        'rose-and-thorn'
      )
    ) as v(name, description, location_name, is_revealed, portrait_key)
    returning id, name
  )
  insert into npc_dm_notes (npc_id, notes)
  select id, notes
  from seeded
  join (values
    ('Rose and Thorn', 'Ghosts. Illusions when outside the house -- do not appear on Sense Undead or similar abilities out there.')
  ) as dm_notes(name, notes) using (name);

  return NEW;
end;
$function$;

create trigger seed_npcs_on_campaign_create
after insert on campaigns
for each row
execute function public.seed_campaign_npcs();

insert into public.schema_migrations (version) values ('048');

commit;

-- ---------------------------------------------------------------------------
-- Confirm, after commit -- create a test campaign through the app, then:
--
--   select name, location_id is not null as has_home, is_revealed, portrait_key
--   from npcs
--   where campaign_id = '<the new campaign''s id>'
--   order by name;
--
-- Expect 3 rows: Rahadin and Rose and Thorn with has_home = true and
-- is_revealed = false, Strahd with has_home = true and is_revealed = true, and
-- only Rose and Thorn carrying a portrait_key. Then in the browser: the NPC
-- roster page shows a picture on Rose and Thorn's (still-hidden) card for the
-- DM, and Death House appears as a pin on the Village of Barovia map at
-- whatever (x, y) you replaced the placeholder with.
-- ---------------------------------------------------------------------------

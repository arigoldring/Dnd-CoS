-- db/043_village_of_barovia_seed.sql
--
-- The Village of Barovia's first six pins, collected with the DM-only
-- coordinate finder 042/MapView.tsx shipped for exactly this. 042 deliberately
-- seeded none -- "the coordinates don't exist" -- and they now do.
--
-- Two things happen here, in one transaction:
--
--   1. seed_campaign_locations() (027, updated for map_key by 042) is updated
--      again to also seed these six on every NEW campaign from here on, the
--      same way it already does for the six region locations. Standard module
--      content, same treatment.
--
--   2. The one EXISTING campaign is backfilled by hand, because the trigger
--      only fires on INSERT into campaigns -- it does nothing for a campaign
--      that already exists. This is 034's move, not 026's: a targeted content
--      seed for one named campaign, not a truncate-and-reseed.
--
-- Like 034, THIS FILE IS A TEMPLATE AS MUCH AS A MIGRATION, and for the same
-- reason: locations has no INSERT policy either, so the only way a second
-- campaign gets these six rows is copying block 2 below and changing the one
-- campaign id in its CTE.
--
-- NOT IDEMPOTENT, and not easily made so -- 034's caveat, unchanged. There is
-- no unique key on (campaign_id, name, map_key), because nothing stops two
-- locations sharing a name across two maps in the same campaign (there could
-- someday be a "Church" on more than one map). Running block 2 twice against
-- the same campaign inserts the six rows twice. Pre-flight, expect zero rows:
--
--   select id, name from locations
--   where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
--     and map_key = 'village-of-barovia';
--
-- REVEAL DEFAULT: all six are seeded is_revealed = true, not false. Unlike the
-- region's Abbey of Saint Markovia, none of these six is a secret location --
-- the module's own box text has the party seeing Bildrath's, the tavern, the
-- church, the cemetery, Mad Mary's and the Burgomaster's mansion from the
-- street the moment they walk into the village. What is secret about several
-- of them (the Martikovs, Mary's attic, Kolyan's death, Father Donavich's
-- crypt) is exactly what dm_notes is for, and is written there instead of in
-- the player-facing description -- the same split Castle Ravenloft and the
-- Abbey already use. This is a game-content judgment call, not a derived fact
-- -- revisit per campaign if a table wants to discover any of these instead.
--
-- Note this is a SECOND reveal layer on top of the map's own gate: the
-- village map itself still defaults to hidden (VILLAGE_MAP.defaultRevealed in
-- src/data/maps.ts) until its campaign's DM reveals the map card, independent
-- of any one pin's is_revealed here.

begin;

-- ---------------------------------------------------------------------------
-- 1. seed_campaign_locations() -- third version of this function (027, 042,
--    now this). Only the body changes; 027's trigger binding is untouched.
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
      -- the region map (barovia), unchanged from 042
      ('Village of Barovia',      78.5, 61.3, 'Cursed Town',                                                     true,  NEW.id, 'barovia'),
      ('Tser Falls',              56.8, 55.9, 'Thundering falls above the Vistani camp at Tser Pool.',            true,  NEW.id, 'barovia'),
      ('Vallaki',                 39.8, 33.4, 'Walled town ruled by a paranoid baron.',                           true,  NEW.id, 'barovia'),
      ('Krezk',                   11.2, 29.9, 'Remote walled village guarding the Abbey of Saint Markovia.',      true,  NEW.id, 'barovia'),
      ('Castle Ravenloft',        71.0, 51.2, 'Strahd''s mountaintop fortress, seat of the land''s curse.',       true,  NEW.id, 'barovia'),
      ('Abbey of Saint Markovia',  8.4, 22.6, 'Ruined abbey on the heights above Krezk.',                        false, NEW.id, 'barovia'),
      -- the Village of Barovia map (Area E), new in 043
      ('Bildrath''s Mercantile',  48.6, 61.0, 'The village''s general store, sparsely stocked and expensive.',           true, NEW.id, 'village-of-barovia'),
      ('Blood of the Vine Tavern',49.2, 50.2, 'The village tavern and inn, run by the Martikov family.',                 true, NEW.id, 'village-of-barovia'),
      ('Mad Mary''s Townhouse',   44.1, 66.8, 'A modest home near the village square, kept by a reclusive widow.',       true, NEW.id, 'village-of-barovia'),
      ('Burgomaster''s Mansion',  43.3, 88.6, 'Home of the late Burgomaster Kolyan Indirovich and his children.',        true, NEW.id, 'village-of-barovia'),
      ('Church',                  26.2, 29.7, 'A small, weathered church at the edge of the village.',                   true, NEW.id, 'village-of-barovia'),
      ('Cemetery',                28.5, 15.5, 'The village burial ground, overgrown and often shrouded in mist.',        true, NEW.id, 'village-of-barovia')
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
-- 2. Backfill the one existing campaign. Copy this block, with a new campaign
--    id, for any other campaign that wants the village pinned too.
-- ---------------------------------------------------------------------------

with seeded as (
  insert into locations (name, x, y, description, is_revealed, campaign_id, map_key)
  select v.name, v.x, v.y, v.description, v.is_revealed, c.id, 'village-of-barovia'
  from (select 'd721b412-2750-492e-bddd-7387fc464bba'::uuid as id) c
  cross join (values
    ('Bildrath''s Mercantile',   48.6, 61.0, 'The village''s general store, sparsely stocked and expensive.',     true),
    ('Blood of the Vine Tavern', 49.2, 50.2, 'The village tavern and inn, run by the Martikov family.',           true),
    ('Mad Mary''s Townhouse',    44.1, 66.8, 'A modest home near the village square, kept by a reclusive widow.', true),
    ('Burgomaster''s Mansion',   43.3, 88.6, 'Home of the late Burgomaster Kolyan Indirovich and his children.',  true),
    ('Church',                   26.2, 29.7, 'A small, weathered church at the edge of the village.',             true),
    ('Cemetery',                 28.5, 15.5, 'The village burial ground, overgrown and often shrouded in mist.',  true)
  ) as v(name, x, y, description, is_revealed)
  returning id, name
)
insert into location_dm_notes (location_id, notes)
select id, notes
from seeded
join (values
  ('Blood of the Vine Tavern','The Martikovs are Wildhunt shifters, secretly working against Strahd. They shelter refugees and pass along information to allies of the party.'),
  ('Mad Mary''s Townhouse',   'Mary Wistoft (''Mad Mary'') keeps the reanimated corpses of her two dead children as zombies locked in the attic.'),
  ('Burgomaster''s Mansion',  'Kolyan died the night the party likely arrives. His daughter Ireena is Strahd''s obsession -- the reincarnation of his lost love Tatyana -- and his son Ismark now leads the village.'),
  ('Church',                  'Father Donavich has lost his faith and keeps the reanimated corpse of his son Doru chained in the crypt below.')
) as dm_notes(name, notes) using (name);

insert into public.schema_migrations (version) values ('043');

commit;


-- ---------------------------------------------------------------------------
-- Confirm, after commit --
--
--   select name, x, y, is_revealed,
--          exists (select 1 from location_dm_notes n where n.location_id = l.id) as has_dm_note
--   from locations l
--   where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
--     and map_key = 'village-of-barovia'
--   order by name;
--
-- Expect 6 rows, all is_revealed = true, has_dm_note = true on Blood of the
-- Vine Tavern, Burgomaster's Mansion, Church and Mad Mary's Townhouse only.
--
-- Then in the browser: DM view of the Village of Barovia map now shows six
-- hotspots at the coordinates above. Toggle the map itself to Shown from the
-- index if it's still hidden -- these pins existing does not reveal the map
-- they're on.
-- ---------------------------------------------------------------------------

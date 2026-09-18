-- db/050_lancelot.sql
--
-- AS RUN, THIS FILE'S BLOCKS 3 AND 4 DID NOTHING -- see 051, which repairs it.
-- The campaign is named "Not Curse of Strahd" and this file was written with
-- "Not Course of Strahd", a misspelling now corrected throughout. The block 2
-- guard below did not catch it, and the reason is worth reading before writing
-- another file shaped like this one: the name appears THREE times in executable
-- SQL and the guard only ever checks the first. Correcting that one occurrence
-- at the SQL editor satisfied the guard and left blocks 3 and 4 matching zero
-- rows -- the exact silent no-op the guard exists to prevent, walked around by
-- the guard itself. A literal that must agree across statements belongs in one
-- place; 051 resolves it once into a variable and does both inserts from there,
-- which is the shape to copy.
--
-- Lancelot, a dog, joins the roster with a portrait. Third portrait the app has
-- shipped, so 049's two-step recipe again, unchanged:
--
--   1. the .webp goes in the client's portraits folder named <key>.webp
--      -- src/assets/portraits/lancelot.webp, committed alongside
--   2. this migration sets portrait_key to that same key
--
-- THE KEY MUST MATCH THE FILENAME EXACTLY, minus the extension: `lancelot` ->
-- `src/assets/portraits/lancelot.webp`. Lowercase, because the glob in NPC.tsx
-- is a literal string lookup and `Lancelot` would miss. A key naming no file
-- resolves to `undefined` and renders as the empty portrait band -- no 404, no
-- build error, no exception -- which is why this is worth a paragraph every
-- time.
--
-- THE SOURCE FILE WAS RE-EXPORTED, not just renamed. It arrived as
-- `Lancelot.jpeg`: a 4.3 MB phone photo, 4284x5712 with an EXIF rotation tag,
-- of a dog on a living-room floor. Committed as-is it would have been ~150x the
-- other two portraits' weight in the bundle for an image the page never
-- displays above 360px wide. It is now a 340x529 webp (11 KB), cropped to the
-- dog and sized to sit between rose-and-thorn (330x514) and
-- strahd-von-zarovich (376x527) so it inherits the same card geometry.
--
-- The crop was chosen against npc.css's `object-position: 50% 22%` rather than
-- on its own merits -- that rule is shared by every portrait, and the file's
-- comment asks that a new one be checked against it instead of assumed. Checked:
-- covering the 360x240 card band shows rows 12.5%-55% of the image, which on
-- this crop is the top of the head down through the tongue. No CSS change, which
-- is the point of framing the file this way.
--
-- Three things happen here, in one transaction:
--
--   1. seed_campaign_npcs() (048, 049) is re-created with a fourth row, so every
--      NEW campaign gets Lancelot. Third version of this function; 048's trigger
--      binding is untouched, and so is the locations seed it shares a file with.
--
--   2. The ongoing campaign gets Death House, if it does not have it already --
--      see below. This is a prerequisite, not a bonus.
--
--   3. The ongoing campaign gets Lancelot, because the trigger only fires on
--      INSERT into campaigns.
--
-- THE CAMPAIGN IS RESOLVED BY NAME, not by the uuid every migration since 033
-- has hardcoded. That uuid belongs to the campaign those files call "The cool
-- kids"; whether it is also the campaign now called "Not Curse of Strahd" is
-- not something this repo records, and guessing wrong would seed a dog into
-- someone else's game. The name below is the one thing to check before running
-- this file -- it is `campaigns.name`, matched exactly, case and all. Block 2
-- raises rather than matching zero rows, because every insert here is a
-- `where exists` against that lookup and a typo would otherwise commit cleanly
-- having done nothing at all.
--
-- DEATH HOUSE HAD TO COME FIRST. 048 added it to the seed function and
-- deliberately shipped NO BACKFILL -- "that is a separate, explicit decision" --
-- so the ongoing campaign, created before 048, very likely has no Death House.
-- Lancelot's home is resolved by name the way 034's template always has, and a
-- name that matches nothing yields NULL rather than an error: the dog would land
-- homeless and nothing would say so. Block 3 is that explicit decision, made
-- now because block 4 depends on it.
--
-- Its (x, y) are 048's, carried over verbatim -- AND 048 SHIPPED THEM AS
-- PLACEHOLDERS. If the real coordinates were substituted by hand when 048 was
-- run, this block re-introduces the placeholder for this one campaign and the
-- pin will sit in the wrong place on the village map. Compare against another
-- campaign's Death House row (BLOCK 1 below) before running, and drag it right
-- afterwards if they differ.
--
-- IDEMPOTENT, unlike 034 and 043 and like 049. Both inserts are guarded by
-- `not exists`, so a second run inserts nothing rather than giving the campaign
-- two dogs -- there is still no unique key on (campaign_id, name), by design
-- (two NPCs may legitimately share a name), so the guard has to be written out.
-- The ledger insert below refuses the re-run first; this is belt and braces, for
-- the blocks that get copied out and run on their own against a second campaign.
--
-- is_revealed: false, the convention every seeded NPC but Strahd follows -- the
-- party has not met this dog. One click in the NPC page's visibility panel flips
-- it mid-session.
--
-- The description is a placeholder and is meant to be. name, description,
-- location_id and is_revealed are all editable from the DM's editor (pin_npc_row
-- pins id, campaign_id, created_at and portrait_key, and nothing else), so the
-- real text can be typed at the table. Only the portrait is seed-only.

begin;

-- ---------------------------------------------------------------------------
-- 1. seed_campaign_npcs() -- third version (048, 049, now this).
--    Only the new fourth row differs; the other three are 049's, verbatim.
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
        'strahd-von-zarovich'
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
      ),
      -- new in 050. Names src/assets/portraits/lancelot.webp.
      (
        'Lancelot',
        'A dog.',
        'Death House',
        false,
        'lancelot'
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

-- ---------------------------------------------------------------------------
-- 2. Guard. Everything below keys off this name; without this block a typo in
--    it is a migration that commits, writes the ledger row, and inserts nothing.
--    `into strict` is what turns both "no such campaign" and "two campaigns
--    share this name" into a rollback; the handlers only replace the terse
--    built-in messages with ones that say what to do about it.
-- ---------------------------------------------------------------------------

do $$
declare
  v_campaign uuid;
begin
  select id into strict v_campaign
  from public.campaigns
  where name = 'Not Curse of Strahd';
exception
  when no_data_found then
    raise exception
      'No campaign is named "Not Curse of Strahd". Run: select id, name from campaigns order by name; then correct the three occurrences of the name in this file.';
  when too_many_rows then
    raise exception
      'More than one campaign is named "Not Curse of Strahd". Name is not unique -- switch blocks 3 and 4 to the campaign''s uuid instead.';
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Death House for the ongoing campaign, if missing. Prerequisite for block 4
--    -- see the header on the placeholder coordinates before running.
--
--    The `not exists` is scoped by map_key as well as name: nothing stops a
--    campaign having a "Death House" on a second map someday, and this block is
--    only asking about the village one.
-- ---------------------------------------------------------------------------

insert into public.locations (name, x, y, description, is_revealed, campaign_id, map_key)
select 'Death House',
       20.0,
       70.0,
       'A dilapidated old house at the edge of the village.',
       false,
       c.id,
       'village-of-barovia'
from public.campaigns c
where c.name = 'Not Curse of Strahd'
  and not exists (
    select 1 from public.locations l
    where l.campaign_id = c.id
      and l.name = 'Death House'
      and l.map_key = 'village-of-barovia'
  );

-- ---------------------------------------------------------------------------
-- 4. Lancelot for the ongoing campaign.
--
--    portrait_key is set in this INSERT, not by an UPDATE afterwards. 049 had to
--    disable pin_npc_row to write the column on rows that already existed; a new
--    row sidesteps the pin entirely, because pin_npc_row is BEFORE UPDATE and
--    has nothing to say about INSERT. Do not split this into insert-then-update
--    -- the update half would report "UPDATE 1" and change nothing.
--
--    The home lookup is scoped by campaign, not by map_key, matching the seed
--    function above. Block 3 has just guaranteed it resolves.
-- ---------------------------------------------------------------------------

insert into public.npcs (campaign_id, name, description, location_id, is_revealed, portrait_key)
select c.id,
       'Lancelot',
       'A dog.',
       (select l.id from public.locations l
        where l.campaign_id = c.id and l.name = 'Death House'),
       false,
       'lancelot'
from public.campaigns c
where c.name = 'Not Curse of Strahd'
  and not exists (
    select 1 from public.npcs n
    where n.campaign_id = c.id and n.name = 'Lancelot'
  );

insert into public.schema_migrations (version) values ('050');

commit;

-- ---------------------------------------------------------------------------
-- VERIFICATION -- run one block at a time. The SQL editor renders only the last
-- result set of a run, so pasting the whole section shows BLOCK 3 and silently
-- discards the two before it. No ledger rows; each block ends in rollback.
--
-- BLOCK 1 is the only one worth running BEFORE the migration -- it is the
-- coordinate check the header asks for.
-- ---------------------------------------------------------------------------

-- BLOCK 1 -- what (x, y) does Death House actually have elsewhere? Run this
-- BEFORE the migration. Every existing Death House row, one per campaign that
-- has one. Expect either zero rows (no campaign has been created since 048, so
-- 20.0/70.0 is all there is and block 3's placeholder is as good as anything) or
-- rows agreeing with each other. If they show something other than 20.0/70.0,
-- those are the real coordinates someone substituted when running 048 -- put
-- them into block 3 before running this file, and into 048's seed function in a
-- follow-up migration, because new campaigns are still getting the placeholder.
begin;
  select c.name as campaign, l.x, l.y, l.is_revealed
  from locations l
  join campaigns c on c.id = l.campaign_id
  where l.name = 'Death House'
  order by c.name;
rollback;

-- BLOCK 2 -- the backfill landed on the right campaign, and only there.
-- Expect exactly one row: campaign 'Not Curse of Strahd', home 'Death House',
-- portrait_key 'lancelot', is_revealed false. Zero rows means the name in this
-- file does not match the database's -- but block 2 of the migration would have
-- raised, so that cannot be why. A null home means block 3 did not run or the
-- name lookup missed.
begin;
  select c.name as campaign,
         n.name,
         n.description,
         l.name as home,
         n.is_revealed,
         n.portrait_key
  from npcs n
  join campaigns c on c.id = n.campaign_id
  left join locations l on l.id = n.location_id
  where n.name = 'Lancelot'
  order by c.name;
rollback;

-- BLOCK 3 -- a new campaign gets Lancelot from the seed function, not merely
-- from the backfill. Creates a throwaway campaign, reads its roster back, rolls
-- it away. Expect 4 rows, all with has_home = true: Lancelot hidden with
-- 'lancelot', Rahadin hidden with a null key, Rose and Thorn hidden with
-- 'rose-and-thorn', Strahd revealed with 'strahd-von-zarovich'.
--
-- has_home = false on Lancelot or Rose and Thorn would mean the two campaign
-- triggers fired out of order -- see 048's header on why
-- seed_locations_on_campaign_create must keep sorting before
-- seed_npcs_on_campaign_create.
--
-- Runs as whoever the SQL editor connects as, which bypasses campaigns' RLS.
-- `name` is the only column to supply.
begin;
  with new_campaign as (
    insert into campaigns (name) values ('050 verification')
    returning id
  )
  select n.name,
         n.is_revealed,
         n.portrait_key,
         n.location_id is not null as has_home
  from npcs n
  join new_campaign c on c.id = n.campaign_id
  order by n.name;
rollback;

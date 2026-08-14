-- The starting roster, lifted out of the page that used to hold it in an array.
--
-- This file is a template as much as a migration: NPCs have no INSERT policy, so
-- every addition to the roster arrives through the SQL editor, and the way that
-- happens is copying this file and adding rows to the VALUES list. The campaign
-- is named once in the `campaign` CTE for that reason -- a weekly copy should be
-- one line to change, not one per NPC.
--
-- Written for the Supabase SQL editor: psql's \set is a client-side
-- meta-command and there is no equivalent there, so the id lives in a CTE that
-- the insert cross joins against. Same single point of change, and it works
-- everywhere the editor does.
--
-- Not idempotent, and cannot easily be made so: there is no unique key on
-- (campaign_id, name), because two NPCs in one campaign may legitimately share a
-- name. Running this file twice inserts the roster twice.
--
-- Pre-flight. The location lookup matches by name, and a name that matches
-- nothing yields NULL rather than an error -- the NPC lands with no home and
-- nothing says so. Confirm the location exists in this campaign first; expect
-- one row:
--
--   select id, name from locations
--   where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
--     and name = 'Castle Ravenloft';
--
-- Zero rows means this campaign has no standard Barovia locations, and both
-- NPCs would arrive homeless. Seed the locations first, or accept that and fix
-- it from the UI afterwards.

begin;

-- location_id is resolved by name rather than hardcoded, because locations are
-- seeded per campaign with generated ids -- there is no uuid to write down. The
-- lookup is scoped by campaign as well as by name: names repeat across
-- campaigns, and an unscoped one would either point at another campaign's Castle
-- Ravenloft, which the composite FK then rejects, or fail outright with more
-- than one row returned.
--
-- is_revealed is true for Strahd and false for Rahadin, reproducing exactly what
-- the hardcoded array showed: the party knows who rules Barovia and has not met
-- his chamberlain. New NPCs added to this list should almost always be false --
-- the column defaults that way, and the roster is meant to be revealed session
-- by session rather than handed over at once.
insert into npcs (campaign_id, name, description, location_id, is_revealed)
select c.id,
       v.name,
       v.description,
       (select l.id from locations l
        where l.campaign_id = c.id and l.name = v.location_name),
       v.is_revealed
from (select 'd721b412-2750-492e-bddd-7387fc464bba'::uuid as id) c
cross join (values
  (
    'Strahd von Zarovich',
    'The vampire lord who rules Barovia, ancient and cursed to relive his tragic love story forever.',
    'Castle Ravenloft',
    true
  ),
  (
    'Rahadin',
    'Strahd''s Dusk Elf chamberlain and executioner, fiercely loyal and centuries old.',
    'Castle Ravenloft',
    false
  )
) as v(name, description, location_name, is_revealed);

-- Both rows land without a portrait_key. The only portrait this app has ever
-- shipped is a PNG served from a public path, and this column names a file in
-- the client's bundled portrait folder instead -- so there is nothing yet for a
-- key to point at. A key naming no file fails silently, which is why the update
-- trigger pins the column, and it is why one is not invented here. Adding a
-- portrait is two steps in this order: put the .webp in the client's portraits
-- folder named <uuid>.webp, then write a migration setting portrait_key to that
-- same uuid.

-- No npc_dm_notes rows. Strahd carried a note in the array and it was
-- placeholder keystrokes, not content. The shape, for the copy that does have
-- notes to seed -- keyed by name in the same scoped way, since the ids are
-- generated here too:
--
--   insert into npc_dm_notes (npc_id, notes)
--   select n.id, v.notes
--   from npcs n
--   join (values
--     ('Rahadin', 'Hears the Dirge of the Dusk Elves. Loyal past reason.')
--   ) as v(name, notes) on v.name = n.name
--   where n.campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba';

commit;

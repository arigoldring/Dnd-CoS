-- db/051_lancelot_backfill.sql
--
-- 050's backfill, run against the campaign's actual name. 050 committed, so its
-- block 1 landed and every NEW campaign already gets Lancelot -- confirmed at
-- the SQL editor. Its blocks 3 and 4 matched zero rows and inserted nothing, so
-- the ongoing campaign still has no dog. This file is only those two blocks,
-- rewritten so the failure that produced this file cannot recur.
--
-- WHY A NEW FILE RATHER THAN A FIX TO 050. 050's ledger insert is unguarded, by
-- the convention 036 set: re-running it fails on schema_migrations' primary key
-- and rolls back. That is working as intended and is not to be worked around --
-- the ledger's whole value is that it records what actually ran, and 050 did
-- actually run. The correction is a new numbered file. 050's own text has been
-- fixed in place so a second database gets the right name on the first pass;
-- against THIS database 050 is spent, and 051 is the repair.
--
-- WHAT WENT WRONG, because the shape is worth not repeating. 050 named the
-- campaign in three separate executable statements -- the guard's lookup, the
-- locations insert, the npcs insert -- and guarded only the first. Correcting
-- the misspelling in the guard alone satisfied the guard and left the two
-- inserts pointed at a name that matches nothing, which is precisely the silent
-- no-op the guard was added to prevent. A `where` clause that matches zero rows
-- is not an error in SQL; it is a successful statement that did nothing, and a
-- migration made of them commits and writes its ledger row looking exactly like
-- one that worked.
--
-- The fix is structural, not more comments: THE NAME APPEARS ONCE IN THE
-- MIGRATION, in c_name below, resolved once into v_campaign, and every statement
-- -- the raise messages included -- reads from there. Nothing downstream can
-- disagree with what the guard checked, because there is nothing downstream to
-- disagree. Copy this block, not 050's, for the next campaign that wants the
-- roster: one line to change.
--
-- (The verification blocks at the foot of the file name it again. They are read
-- only and roll back, so a stale name there shows zero rows and misleads nobody
-- into thinking a write happened.)
--
-- DEATH HOUSE IS ALREADY THERE. 050 BLOCK 1 run against this database returned
-- exactly one row -- "Not Curse of Strahd", 20.0/70.0, is_revealed false -- so
-- this campaign was created after 048 ran and its trigger seeded the location.
-- The insert below is kept anyway and guarded on absence: it costs a lookup that
-- has to happen regardless (Lancelot needs the id), and it is what makes this
-- block copyable to a campaign created before 048. Expect it to reuse, not
-- insert.
--
-- SEPARATELY, AND NOT ABOUT THE DOG: those are 048's PLACEHOLDER coordinates.
-- 048's header asked for the real ones off MapView's DM coordinate finder before
-- running and they were never substituted, so Death House's pin sits at a made-up
-- spot on the village map -- in this campaign and in every campaign created from
-- here on, since the seed function still carries 20.0/70.0. Pre-existing, out of
-- scope here, worth its own one-line migration.
--
-- NO SEED-FUNCTION CHANGE. 050 block 1 is correct and live; touching it again
-- would be a third identical copy of the same function body for nothing.
--
-- IDEMPOTENT. Both inserts are guarded on absence, and the closing assertion
-- describes the end state rather than the work done, so a second run passes
-- having inserted nothing. The ledger insert still refuses the re-run first.

begin;

-- ---------------------------------------------------------------------------
-- The whole backfill, as one block, so the campaign is named once.
--
-- A DO block rather than 050's pair of CTE inserts for exactly that reason: two
-- statements cannot share a CTE, so two statements meant one literal written
-- twice. plpgsql buys a variable, and the variable is the point.
--
-- `into strict` on the campaign lookup still turns "no such campaign" and "two
-- campaigns share this name" into a rollback -- kept from 050, where it worked;
-- it was never the guard that failed.
-- ---------------------------------------------------------------------------

do $$
declare
  -- The one place this campaign is named. Nothing below repeats it.
  c_name constant text := 'Not Curse of Strahd';

  v_campaign uuid;
  v_location uuid;
  v_npc      uuid;

  -- Read back for the closing assertion, not for the inserts.
  v_npc_home uuid;
  v_npc_key  text;
begin
  select id into strict v_campaign
  from public.campaigns
  where name = c_name;

  -- ---- Death House. Expected to reuse; see the header. --------------------
  --
  -- Scoped by map_key as well as name: nothing stops a campaign having a
  -- "Death House" on a second map someday, and this is asking about the village
  -- one. Plain `into`, not `into strict` -- a miss here means "insert it", not
  -- "stop".
  select id into v_location
  from public.locations
  where campaign_id = v_campaign
    and name = 'Death House'
    and map_key = 'village-of-barovia';

  if v_location is null then
    insert into public.locations
      (name, x, y, description, is_revealed, campaign_id, map_key)
    values
      ('Death House', 20.0, 70.0,
       'A dilapidated old house at the edge of the village.',
       false, v_campaign, 'village-of-barovia')
    returning id into v_location;

    raise notice 'Death House inserted at PLACEHOLDER 20.0/70.0 -- fix the pin.';
  else
    raise notice 'Death House already present; reusing it.';
  end if;

  -- ---- Lancelot. ----------------------------------------------------------
  --
  -- portrait_key is set in the INSERT, never by an UPDATE afterwards.
  -- pin_npc_row is BEFORE UPDATE and assigns `new.portrait_key :=
  -- old.portrait_key`, so an insert-then-update split would report "UPDATE 1"
  -- and change nothing -- 049 had to disable the trigger to get around that on
  -- rows that already existed. A new row never meets it.
  select id into v_npc
  from public.npcs
  where campaign_id = v_campaign and name = 'Lancelot';

  if v_npc is null then
    insert into public.npcs
      (campaign_id, name, description, location_id, is_revealed, portrait_key)
    values
      (v_campaign, 'Lancelot', 'A dog.', v_location, false, 'lancelot')
    returning id into v_npc;

    raise notice 'Lancelot inserted.';
  else
    raise notice 'Lancelot already present; nothing inserted.';
  end if;

  -- ---- Assert the end state, not the work. --------------------------------
  --
  -- This is the part 050 did not have, and the reason it could commit having
  -- done nothing. It describes what must be true when this file is finished,
  -- so it catches a no-op branch, a home that did not resolve, and a Lancelot
  -- someone had already added by hand without the portrait. Any of those roll
  -- the whole file back, ledger row included.
  --
  -- Notices are the running commentary and may not render in the SQL editor at
  -- all; this raise is the load-bearing check. Do not demote it to a notice.
  select location_id, portrait_key into v_npc_home, v_npc_key
  from public.npcs
  where id = v_npc;

  if v_npc_home is distinct from v_location or v_npc_key is distinct from 'lancelot' then
    raise exception
      'Lancelot is wrong in campaign "%": home = %, expected %; portrait_key = %, expected ''lancelot''. Rolled back -- an NPC added by hand cannot be repaired by UPDATE either, since pin_npc_row pins portrait_key; delete the row and re-run.',
      c_name, v_npc_home, v_location, coalesce(v_npc_key, 'null');
  end if;
exception
  -- c_name interpolated rather than spelled out again, so these messages cannot
  -- come to describe a different name than the one the lookup used -- which is
  -- the same failure, in miniature, that this file exists to repair.
  when no_data_found then
    raise exception
      'No campaign is named "%". Run: select id, name from campaigns order by name; then correct c_name -- it is the only occurrence.',
      c_name;
  when too_many_rows then
    raise exception
      'More than one campaign is named "%". Name is not unique -- replace the c_name lookup with the campaign''s uuid.',
      c_name;
end
$$;

insert into public.schema_migrations (version) values ('051');

commit;

-- ---------------------------------------------------------------------------
-- VERIFICATION -- run one block at a time. The SQL editor renders only the last
-- result set of a run, so pasting both shows BLOCK 2 and silently discards
-- BLOCK 1. No ledger rows; each block ends in rollback.
--
-- 050's BLOCK 3 (a new campaign gets Lancelot from the seed function) still
-- applies unchanged and is not repeated here -- nothing in this file touches
-- that function.
-- ---------------------------------------------------------------------------

-- BLOCK 1 -- the dog is in the ongoing campaign, with a home and a portrait.
-- Expect exactly one row: campaign 'Not Curse of Strahd', home 'Death House',
-- portrait_key 'lancelot', is_revealed false.
--
-- Zero rows cannot happen if this file committed -- the assertion above would
-- have rolled it back -- so zero rows means the file did not run. Two rows
-- means two Lancelots; the guards make that impossible from this file, so it
-- would be one added by hand as well.
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

-- BLOCK 2 -- the ongoing campaign's full roster, which is what the NPC page
-- will show. Expect 4 rows, all with has_home = true: Lancelot, Rahadin and
-- Rose and Thorn hidden, Strahd revealed, and a portrait on everyone but
-- Rahadin.
--
-- In the browser afterwards: the NPC page shows the dog's card, hidden, with
-- his picture in the band. Nothing renders it for players until the visibility
-- panel flips him -- one click, mid-session.
begin;
  select n.name,
         n.is_revealed,
         n.portrait_key,
         l.name as home
  from npcs n
  join campaigns c on c.id = n.campaign_id
  left join locations l on l.id = n.location_id
  where c.name = 'Not Curse of Strahd'
  order by n.name;
rollback;

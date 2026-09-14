-- db/049_strahd_portrait.sql
--
-- Strahd gets a portrait. Second file this app has ever shipped, and the first
-- since the glob in NPC.tsx replaced the old public-path PNG, so this is 034's
-- two-step recipe run for real for the second time:
--
--   1. the .webp goes in the client's portraits folder named <key>.webp
--      -- src/assets/portraits/strahd-von-zarovich.webp, committed alongside
--   2. this migration sets portrait_key to that same key
--
-- THE KEY MUST MATCH THE FILENAME EXACTLY, minus the extension.
-- `strahd-von-zarovich` -> `src/assets/portraits/strahd-von-zarovich.webp`.
-- Note the spelling: Zarovich, matching the seeded NPC name and the module, not
-- the Zerovich in the filename the art arrived under. import.meta.glob turns a
-- key naming no file into `undefined`, which the page renders as the empty
-- portrait band -- no 404, no build error, no exception. A typo here is a
-- picture that silently never appears, which is the whole reason 033 pinned the
-- column in the first place.
--
-- Two things happen here, in one transaction:
--
--   1. seed_campaign_npcs() (048) is re-created with the key in Strahd's row of
--      the VALUES list, so every NEW campaign gets it. Second version of this
--      function; 048's trigger binding is untouched, and so is the locations
--      seed it shares a file with.
--
--   2. Every EXISTING campaign's Strahd row is backfilled, because the trigger
--      only fires on INSERT into campaigns. Unlike 034 and 043 this is NOT
--      scoped to one named campaign id: the key names one bundled file that is
--      correct for every copy of the same seeded NPC, so the predicate is the
--      name, across all campaigns.
--
-- THE BACKFILL DISABLES pin_npc_row, AND HAS TO. This is the gotcha CLAUDE.md
-- documents and 048 sidestepped by setting the column in its INSERT instead:
-- pin_npc_row is a BEFORE UPDATE trigger that assigns
-- `new.portrait_key := old.portrait_key`, so a direct UPDATE to it reports
-- "UPDATE 1" and changes nothing -- even for the table owner, even in a
-- migration. Disabling it around the update is the only way to write the
-- column after the row exists. The ALTERs sit inside this file's begin/commit,
-- so a failure anywhere rolls the re-enable back in with everything else and
-- the trigger cannot be left off. They do take an ACCESS EXCLUSIVE lock on
-- npcs for the duration -- a few milliseconds here, but it is a real lock and
-- worth knowing before running this against a busy table.
--
-- IDEMPOTENT, unlike 034 and 043. `portrait_key is null` in the WHERE means a
-- second run updates zero rows rather than doubling anything, and it also means
-- this cannot stomp a key someone set deliberately by hand. The ledger insert
-- below still refuses the re-run first -- this is belt and braces, because the
-- backfill block is the part that gets copied out of the file and re-run on its
-- own against a second database.

begin;

-- ---------------------------------------------------------------------------
-- 1. seed_campaign_npcs() -- second version (048, now this).
--    Only Strahd's portrait_key changes; every other value is 048's, verbatim.
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
        -- new in 049. Names src/assets/portraits/strahd-von-zarovich.webp.
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
-- 2. Backfill every existing campaign's Strahd. See the header on why the
--    trigger comes off -- without these two ALTERs the UPDATE is a silent
--    no-op that still reports a row count.
-- ---------------------------------------------------------------------------

alter table public.npcs disable trigger pin_npc_row;

update public.npcs
set portrait_key = 'strahd-von-zarovich'
where name = 'Strahd von Zarovich'
  and portrait_key is null;

alter table public.npcs enable trigger pin_npc_row;

insert into public.schema_migrations (version) values ('049');

commit;

-- ---------------------------------------------------------------------------
-- VERIFICATION -- run one block at a time. The SQL editor renders only the last
-- result set of a run, so pasting the whole section shows BLOCK 3 and silently
-- discards the two before it. No ledger rows; each block ends in rollback.
-- ---------------------------------------------------------------------------

-- BLOCK 1 -- the backfill landed, and pin_npc_row came back on.
-- Expect one row per campaign, every one with portrait_key =
-- 'strahd-von-zarovich' and pin_enabled = true. A null key means the update
-- no-opped, which means the trigger was still live -- re-read the header.
begin;
  select n.campaign_id,
         n.portrait_key,
         (select t.tgenabled = 'O'
          from pg_trigger t
          where t.tgrelid = 'public.npcs'::regclass
            and t.tgname = 'pin_npc_row') as pin_enabled
  from npcs n
  where n.name = 'Strahd von Zarovich'
  order by n.campaign_id;
rollback;

-- BLOCK 2 -- pin_npc_row is enforcing again, checked by trying it rather than
-- by reading a catalog flag. Reported as a row, not an ERROR: the pin refuses
-- by silently discarding the new value, so the pass condition is "the key did
-- not change" and the block rolls back either way.
-- Expect pin_holds = true.
begin;
  with target as (
    select id, portrait_key from npcs where name = 'Strahd von Zarovich' limit 1
  ), attempt as (
    update npcs n
    set portrait_key = 'tampered-key'
    from target t
    where n.id = t.id
    returning n.portrait_key as after
  )
  select t.portrait_key as before,
         a.after,
         a.after is not distinct from t.portrait_key as pin_holds
  from target t, attempt a;
rollback;

-- BLOCK 3 -- a new campaign gets the key from the seed function, not merely
-- from the backfill. Creates a throwaway campaign, reads its roster back, rolls
-- it away. Expect 3 rows: Rahadin hidden with a null key, Rose and Thorn hidden
-- with 'rose-and-thorn', Strahd revealed with 'strahd-von-zarovich' -- all
-- three with has_home = true.
--
-- Runs as whoever the SQL editor connects as, which bypasses campaigns' RLS.
-- `name` is the only column to supply -- campaigns carries no owner column, and
-- the row needs no membership for this check, since both seed triggers key off
-- NEW.id alone and neither consults auth.uid().
begin;
  with new_campaign as (
    insert into campaigns (name) values ('049 verification')
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

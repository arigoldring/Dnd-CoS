-- Decrement becomes a single statement-in-a-lock, on both inventories.
--
-- 030 made the increment atomic and left the decrement exactly as it was, in the
-- file next door. Its own rationale is the argument for this migration, word for
-- word: "the read and the write have to be the same statement or two players
-- adding at once lose an increment". decrementCharacterInventoryItem and
-- decrementPartyInventoryItem both read currentQuantity in the client, ship it
-- back as `quantity - 1`, and lose one of two concurrent decrements.
--
-- 030 also made it MORE reachable rather than less. Stacks used to fragment
-- across rows, so two people spending arrows were often editing different rows
-- and could not collide; now every copy of an item funnels into one row that
-- both the owner and the DM can decrement mid-session, which is the contended
-- case. Same for the pile after 031. Not urgent at five users -- this is still a
-- two-people-in-the-same-second race -- but it is the last read-modify-write in
-- the app, and both services carry a comment promising to fix it "if it ever
-- bites", which is a promise better kept than restated.
--
-- Also here: the index drop 030 deferred. Deliberately not in 030 (a migration
-- should not drop the old index in the same breath as adding the one that
-- replaces it) and deliberately not left to memory.

begin;

-- ---------------------------------------------------------------------------
-- 1. atomic decrement
-- ---------------------------------------------------------------------------

-- Two functions rather than one taking a table name: they answer to different
-- policies, and a function that picked its target at runtime would have to be
-- SECURITY DEFINER or dynamic SQL to do it. Two near-identical bodies is the
-- cheaper duplication -- the same call the services already make twice.
--
-- Why plpgsql and not one SQL statement: "decrement, but DELETE at the last one"
-- is a branch, and the branch is not optional -- quantity has a `> 0` CHECK on
-- both tables (021 and 028), so 0 is not a storable state. The row has to go
-- instead. That auto-delete-at-zero is the product decision both services
-- already document, unchanged; it just stops being a decision the client makes
-- from a stale number.
--
-- SELECT ... FOR UPDATE first, rather than the lock-free
-- `update ... where quantity > 1` and delete-if-no-rows: that version is correct
-- against a concurrent decrement (READ COMMITTED re-evaluates the WHERE against
-- the updated row, so the loser falls through to the delete and the end state is
-- right) but wrong against a concurrent ADD. A stack of 1 that 030's or 031's
-- `on conflict` bumps to 2 in the window between the failed update and the
-- delete loses both copies. The lock closes that, because the add's ON CONFLICT
-- DO UPDATE has to wait behind it.
--
-- SECURITY INVOKER, so RLS remains the boundary and this is not a way around it.
-- Note what SELECT ... FOR UPDATE checks: Postgres applies the SELECT policy AND
-- the UPDATE policy's USING clause to a locking read. So a campaign member who
-- can see a sheet but not edit it -- 028's split, "character viewers read
-- inventory" against can_edit_character -- gets no row and a silent no-op here,
-- which is exactly what PostgREST already returned them for an UPDATE matching
-- zero rows. No behaviour change, including the unfortunate part.
--
-- Missing row returns quietly for removeFrom*'s reason, stated in both services:
-- everyone who can reach this call could already see the controls, so a target
-- that is gone means a concurrent removal got there first -- the end state the
-- caller wanted, not an error worth painting.
create or replace function public.decrement_character_inventory_item(
  target_entry uuid
)
 returns void
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
declare
  remaining int;
begin
  select quantity into remaining
  from character_inventory
  where id = target_entry
  for update;

  if not found then
    return;
  end if;

  if remaining <= 1 then
    delete from character_inventory where id = target_entry;
  else
    -- 029's trigger takes its UPDATE branch here and re-pins added_by, which is
    -- the case that migration was written for: a DM spending a player's ration
    -- must not inherit the byline.
    update character_inventory
    set quantity = remaining - 1
    where id = target_entry;
  end if;
end;
$function$
;

create or replace function public.decrement_party_inventory_item(
  target_entry uuid
)
 returns void
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
declare
  remaining int;
begin
  select quantity into remaining
  from party_inventory
  where id = target_entry
  for update;

  if not found then
    return;
  end if;

  if remaining <= 1 then
    delete from party_inventory where id = target_entry;
  else
    update party_inventory
    set quantity = remaining - 1
    where id = target_entry;
  end if;
end;
$function$
;

-- ---------------------------------------------------------------------------
-- 2. housekeeping: the index 030 deferred
-- ---------------------------------------------------------------------------

-- 028 created this because Postgres indexes the referenced side of an FK and
-- never the referencing side, and every read of a sheet filters on
-- character_id. 030's unique (character_id, item_id) leads with the same column,
-- so it serves `where character_id = $1` by leftmost prefix and this one is now
-- pure write cost. 030 named the drop as correct and safe and left it to a later
-- migration rather than dropping the old index in the same transaction that
-- added its replacement; this is that migration.
drop index if exists public.character_inventory_character_id_idx;

commit;

-- ---------------------------------------------------------------------------
-- verification
--
-- The plain path first, as any campaign member, in explicit transactions with
-- `set local role authenticated` and request.jwt.claims:
--
--   1. decrement a stack of 3        -> quantity 2, row still there
--   2. decrement it twice more       -> row gone, not a quantity-0 ghost
--   3. decrement an id that does not exist
--                                    -> returns void, no error
--   4. as a campaign member who is NOT the owner or DM, decrement a stack on
--      someone else's sheet          -> no change, no error (see the note above)
--
-- Then the race the migration exists for, in two psql sessions against one stack
-- of 2, since it cannot be reached from one connection:
--
--   A: begin; select decrement_character_inventory_item('<entry>');
--   B: begin; select decrement_character_inventory_item('<entry>');   -- blocks
--   A: commit;                                                        -- B wakes
--   B: commit;
--
--   -> the row is GONE. Before this migration both clients wrote quantity 1 from
--      the same read and the stack survived at 1. Confirm by reading the table
--      back, not by checking that both calls succeeded -- both always did.
--
-- Then the index, which should list character_inventory_character_id_item_id_key
-- and no longer character_inventory_character_id_idx:
--
--   select indexname from pg_indexes where tablename = 'character_inventory';
--
-- If the client gets a 404/PGRST202 from either RPC after this runs, that is the
-- schema cache -- `notify pgrst, 'reload schema';`.
--
-- Then regenerate the client types: npm run gen:types
-- ---------------------------------------------------------------------------

-- One row per (character, item), with adds incrementing the stack.
--
-- Until now, adding an item a character already carried inserted a SECOND row
-- at quantity 1 -- an open question inherited from party_inventory rather than
-- decided for this table. It is tolerable on the shared pile, where a stack of
-- anything is unusual. It is not tolerable on a character sheet, where "3x
-- rations" is the ordinary case and a player adding their third would see three
-- separate rations lines with a x1 each. That is the first thing anyone would
-- report as a bug.
--
-- Three steps, in this order, because the constraint cannot be added while
-- duplicates exist:
--
--   1. merge existing duplicate rows into one
--   2. unique (character_id, item_id)
--   3. an insert-or-increment function, because PostgREST cannot express one
--
-- WHAT THIS COSTS, and it is worth stating plainly since 029 was written to
-- protect exactly this: provenance becomes one byline per (character, item)
-- instead of one per acquisition. A player who buys two daggers and is then
-- handed a third by the DM used to have two rows -- "2x dagger" and "1x dagger,
-- from the DM". Now they have "3x dagger", stamped with whoever got there
-- first. added_by is still honest about who started the stack and still
-- unforgeable; it just no longer distinguishes every item in one. Splitting
-- that back apart means a stack whose identity includes its adder -- unique
-- (character_id, item_id, added_by) -- which trades the duplicate-line problem
-- straight back for a subtler version of itself. Not worth it: the byline
-- exists to answer "did the DM give you that", and the first-acquirer answer is
-- right in every case where the question is actually being asked.

begin;

-- ---------------------------------------------------------------------------
-- 1. merge duplicates
-- ---------------------------------------------------------------------------

-- The survivor of each group is its earliest row, tie-broken by id so the
-- choice is total and repeatable. Earliest rather than latest because added_by
-- rides along with it: the row that survives should be the one that started the
-- stack, which is the same rule step 3's `on conflict` follows from here on.
--
-- Note what does NOT happen here, since it is the whole reason 029's trigger
-- branches: this UPDATE fires stamp_character_inventory_added_by, which takes
-- the UPDATE path and re-pins old.added_by. Had that trigger stamped auth.uid()
-- unconditionally, this statement would have wiped added_by to NULL on every
-- merged row in the database -- auth.uid() is null for the migration role --
-- destroying the provenance of exactly the rows most likely to have some.
update public.character_inventory keep
set quantity = totals.total
from (
  select character_id, item_id, sum(quantity) as total
  from public.character_inventory
  group by character_id, item_id
  having count(*) > 1
) totals
where keep.character_id = totals.character_id
  and keep.item_id     = totals.item_id
  and keep.id = (
    select dup.id
    from public.character_inventory dup
    where dup.character_id = totals.character_id
      and dup.item_id     = totals.item_id
    order by dup.created_at, dup.id
    limit 1
  );

-- Then drop every row that is not its group's survivor. Groups of one match
-- their own survivor and are left alone.
delete from public.character_inventory dup
where dup.id <> (
  select keep.id
  from public.character_inventory keep
  where keep.character_id = dup.character_id
    and keep.item_id     = dup.item_id
  order by keep.created_at, keep.id
  limit 1
);

-- ---------------------------------------------------------------------------
-- 2. the constraint
-- ---------------------------------------------------------------------------

-- This is what makes step 3's `on conflict` possible at all -- ON CONFLICT
-- needs a unique index to arbitrate against, not merely a convention that
-- duplicates should not happen.
--
-- Leaves 028's character_inventory_character_id_idx in place, which is now
-- redundant: the unique index below leads with character_id, so it already
-- serves `where character_id = $1` by leftmost prefix. Dropping it is correct
-- and safe, and is deliberately not done in the same migration that depends on
-- the new index being sound. Worth doing once this has run.
alter table public.character_inventory
  add constraint character_inventory_character_id_item_id_key
  unique (character_id, item_id);

-- ---------------------------------------------------------------------------
-- 3. insert-or-increment
-- ---------------------------------------------------------------------------

-- A function because PostgREST's upsert cannot express this: it SETS the
-- columns it is given, so an upsert with quantity 1 would pin every stack at 1
-- instead of raising it. `quantity = character_inventory.quantity + 1` has to
-- be evaluated in the database, and the read and the write have to be the same
-- statement or two players adding at once lose an increment.
--
-- SECURITY INVOKER, so RLS is still the boundary and this function is not a way
-- around it. Both paths are covered by policies 028 already wrote: the insert
-- path answers to "owner or dm adds to inventory", and the DO UPDATE path needs
-- both "owner or dm updates inventory" clauses, which Postgres requires in full
-- for ON CONFLICT DO UPDATE -- USING against the row that is already there,
-- WITH CHECK against the row it becomes.
--
-- No revoke from anon, for is_dm's reason in 008: invoker rights mean an
-- anonymous caller gets an RLS denial out of it, not a free write. The revokes
-- in 008 are there because those three functions are SECURITY DEFINER and the
-- EXECUTE grant is the only gate they have. This one has policies.
--
-- 029's trigger still runs on both paths and still decides added_by: auth.uid()
-- on a fresh stack, old.added_by when this increments one. Nothing here touches
-- the column, which is the point.
create or replace function public.add_character_inventory_item(
  target_character uuid,
  target_item uuid
)
 returns uuid
 language sql
 security invoker
 set search_path to 'public'
as $function$
  insert into character_inventory (character_id, item_id, quantity)
  values (target_character, target_item, 1)
  on conflict (character_id, item_id)
    do update set quantity = character_inventory.quantity + 1
  returning id;
$function$
;

commit;

-- ---------------------------------------------------------------------------
-- verification
--
-- Before running, check what step 1 will actually do -- on a database with no
-- duplicates it is a no-op and the interesting cases go untested:
--
--   select character_id, item_id, count(*), sum(quantity)
--   from character_inventory group by 1, 2 having count(*) > 1;
--
-- If that returns nothing, make a duplicate pair by hand first (two inserts of
-- the same item onto one character, under 028's rules) and confirm the merge
-- lands one row at the summed quantity with the EARLIER row's added_by.
--
-- Then, as a player who owns a character and that campaign's DM, in explicit
-- transactions with `set local role authenticated` and request.jwt.claims:
--
--   1. player calls add_character_inventory_item for an item they lack
--        -> new row, quantity 1, added_by = the player
--   2. player calls it again for the same item
--        -> still one row, quantity 2, added_by unchanged
--   3. the DM calls it for that same item
--        -> still one row, quantity 3, added_by STILL the player (see the note
--           at the top -- this is the documented cost, not a bug)
--   4. a member of the campaign who is neither owner nor DM calls it
--        -> denied by RLS, no row created and no stack incremented
--
-- If the client gets a 404/PGRST202 from the RPC after this runs, that is the
-- schema cache, not a missing grant -- `notify pgrst, 'reload schema';`. A
-- missing grant reads as 401/42501 instead.
--
-- Then regenerate the client types: npm run gen:types
-- ---------------------------------------------------------------------------

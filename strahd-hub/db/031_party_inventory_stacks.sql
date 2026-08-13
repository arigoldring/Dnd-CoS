-- 030 for party_inventory: one row per (campaign, item), with adds incrementing.
--
-- 030 left this table alone on the grounds that "a stack of anything is unusual"
-- on the shared pile. That was wrong about what a shared pile holds. Arrows,
-- torches, rations, rope, healing potions -- the loot that actually accumulates
-- between sessions is exactly the stackable kind, and a party pile is if
-- anything MORE stack-shaped than a character sheet, which at least has a
-- one-of-each longsword on it. The duplicate-lines bug 030 called "the first
-- thing anyone would report" is the same bug here.
--
-- The service's stated alternative was worse than the bug: addToPartyInventory
-- proposes that "if the UI wants one stack per item it should disable add for
-- items already in the list". That is a client-side guard for a database
-- invariant, which is the shape this repo rejects everywhere else -- the same
-- reasoning 029 used to move added_by out of the payload, and the reason RLS
-- rather than a component decides who may write. A disabled button is not a
-- constraint; it is a request that nobody open a second tab.
--
-- Same three steps as 030, same order, same reason -- the constraint cannot be
-- added while duplicates exist:
--
--   1. merge existing duplicate rows into one
--   2. unique (campaign_id, item_id)
--   3. an insert-or-increment function, because PostgREST cannot express one
--
-- WHAT THIS COSTS: nothing. 030 spent its longest section weighing provenance,
-- because merging rows there collapses one byline per acquisition into one per
-- stack. That cost does not exist on this table. party_inventory.added_by has
-- been null on every row since 021 -- addToPartyInventory never sent it, there
-- is no trigger to stamp it, and no other writer exists -- so the merge has
-- nothing to preserve and no tie to break on anything but repeatability. This
-- migration is the cheap half of 030.

begin;

-- ---------------------------------------------------------------------------
-- 1. merge duplicates
-- ---------------------------------------------------------------------------

-- Earliest row survives, tie-broken by id, so the choice is total and
-- repeatable. 030 picked earliest because added_by rode along with it; here the
-- rule is inherited rather than argued, since every candidate carries the same
-- null. It still matches what step 3's `on conflict` does from here on, which
-- is reason enough to keep the two the same.
--
-- Note what does NOT happen, since it was load-bearing in 030: no trigger fires
-- on this UPDATE. party_inventory has none -- 029 added stamp_..._added_by to
-- character_inventory only -- so there is no branch to get right and no way for
-- this statement to null out a column behind its own back.
update public.party_inventory keep
set quantity = totals.total
from (
  select campaign_id, item_id, sum(quantity) as total
  from public.party_inventory
  group by campaign_id, item_id
  having count(*) > 1
) totals
where keep.campaign_id = totals.campaign_id
  and keep.item_id     = totals.item_id
  and keep.id = (
    select dup.id
    from public.party_inventory dup
    where dup.campaign_id = totals.campaign_id
      and dup.item_id     = totals.item_id
    order by dup.created_at, dup.id
    limit 1
  );

-- Then drop every row that is not its group's survivor. Groups of one match
-- their own survivor and are left alone.
delete from public.party_inventory dup
where dup.id <> (
  select keep.id
  from public.party_inventory keep
  where keep.campaign_id = dup.campaign_id
    and keep.item_id     = dup.item_id
  order by keep.created_at, keep.id
  limit 1
);

-- ---------------------------------------------------------------------------
-- 2. the constraint
-- ---------------------------------------------------------------------------

-- What makes step 3's `on conflict` possible at all: ON CONFLICT needs a unique
-- index to arbitrate against, not a convention that duplicates should not
-- happen.
--
-- Free alongside it: 021 created no indexes, so every read of a pile has been a
-- seq scan filtered on campaign_id. This index leads with campaign_id, so
-- getPartyInventory's `where campaign_id = $1` is served by leftmost prefix.
alter table public.party_inventory
  add constraint party_inventory_campaign_id_item_id_key
  unique (campaign_id, item_id);

-- ---------------------------------------------------------------------------
-- 3. insert-or-increment
-- ---------------------------------------------------------------------------

-- A function for 030's reason: PostgREST's upsert SETS the columns it is given,
-- so an upsert with quantity 1 would pin every stack at 1 instead of raising it.
-- `quantity = party_inventory.quantity + 1` has to be evaluated in the database,
-- and the read and the write have to be the same statement or two players adding
-- at once lose an increment.
--
-- SECURITY INVOKER, so RLS is still the boundary. Both paths are covered by
-- policies 021 already wrote, and both are the same predicate: the insert path
-- answers to "members add to party inventory", the DO UPDATE path to "members
-- update party inventory", which Postgres requires in full -- USING against the
-- row already there, WITH CHECK against the row it becomes. Simpler than 030's
-- case, where the two policies name different people.
--
-- No revoke from anon, per 008: invoker rights mean an anonymous caller gets an
-- RLS denial, not a free write.
--
-- added_by stays untouched and stays null, exactly as it was. If a byline ever
-- lands on this table it wants 029's trigger, not a parameter here.
create or replace function public.add_party_inventory_item(
  target_campaign uuid,
  target_item uuid
)
 returns uuid
 language sql
 security invoker
 set search_path to 'public'
as $function$
  insert into party_inventory (campaign_id, item_id, quantity)
  values (target_campaign, target_item, 1)
  on conflict (campaign_id, item_id)
    do update set quantity = party_inventory.quantity + 1
  returning id;
$function$
;

commit;

-- ---------------------------------------------------------------------------
-- verification
--
-- Before running, check what step 1 will actually do -- on a database with no
-- duplicates it is a no-op and the interesting case goes untested:
--
--   select campaign_id, item_id, count(*), sum(quantity)
--   from party_inventory group by 1, 2 having count(*) > 1;
--
-- Unlike 030's equivalent this is likely to return rows on any pile that has
-- seen use, because Shop's "Add another" button has been filing a fresh stack
-- per click since 021. Note the summed quantity for one group and confirm the
-- merge lands a single row holding exactly that.
--
-- Then, as two members of one campaign, in explicit transactions with
-- `set local role authenticated` and request.jwt.claims:
--
--   1. member A calls add_party_inventory_item for an item the pile lacks
--        -> new row, quantity 1
--   2. member A calls it again for the same item
--        -> still one row, quantity 2
--   3. member B calls it for that same item
--        -> still one row, quantity 3 (no byline to disagree about, which is
--           the whole difference from 030's case 3)
--   4. a signed-in user who is not a member of the campaign calls it
--        -> denied by RLS, no row created and no stack incremented
--
-- If the client gets a 404/PGRST202 from the RPC after this runs, that is the
-- schema cache, not a missing grant -- `notify pgrst, 'reload schema';`. A
-- missing grant reads as 401/42501 instead.
--
-- Then regenerate the client types: npm run gen:types
-- ---------------------------------------------------------------------------

-- character_inventory.added_by was client-supplied. This makes it JWT-derived.
--
-- 028 shipped the column as provenance -- "the difference between what a player
-- picked up and what the DM handed them", per the sheet's byline -- but nothing
-- constrained who could claim to be the adder:
--
--   INSERT   with check (can_edit_character(character_id)) gates WHICH character
--            you may write to, and says nothing about added_by. A player who can
--            edit their own sheet could insert a Sunsword stamped with the DM's
--            id.
--
--   UPDATE   worse, because it is retroactive: no column pinning at all, so any
--            row already on the sheet could have its byline rewritten after the
--            fact by anyone can_edit_character admits.
--
-- The client was passing an honest value (useCharacterInventory read user.id
-- from AuthContext), but honesty was the client's choice to make, and the whole
-- point of the column is that it is not. This is the same fix 007 already made
-- for session_recaps.last_edited_by -- identity from the JWT, never the payload
-- -- and it restores the invariant characters' own INSERT policy states as
-- `user_id = auth.uid()`.
--
-- A `with check (added_by = auth.uid())` on the INSERT policy would close the
-- forge and leave the retroactive edit open, so the policies are left alone and
-- the trigger does both. After this migration that clause would be dead weight
-- anyway: BEFORE triggers run before WITH CHECK is evaluated, so the policy
-- would only ever re-test a value the trigger just assigned.
--
-- Rows written before this migration keep whatever added_by the client sent.
-- There is nothing to backfill them from -- the true adder was never recorded
-- anywhere else -- so they are trusted as-is rather than nulled.

begin;

-- INSERT stamps, UPDATE pins, and the difference is the point: added_by means
-- "who added this", not "who last touched it". decrementCharacterInventoryItem
-- issues an UPDATE for every quantity change, so stamping auth.uid() on both
-- branches would rewrite the byline of a player's own find to the DM's name the
-- first time the DM decremented it -- corrupting the field this migration exists
-- to protect, through the app's most ordinary write.
--
-- old.added_by rather than a `new.added_by := old.added_by` guarded by an
-- is-distinct-from check: an UPDATE that does not mention the column already
-- carries the old value into new, so the assignment is a no-op in the honest
-- case and an override in the forged one.
--
-- Not pinned here: id and created_at, which remain freely writable on UPDATE the
-- way 028 left them. Out of scope for this migration, and worth a look if a
-- later one revisits this trigger.
create or replace function public.stamp_character_inventory_added_by()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    -- Identity from the JWT, never the payload.
    new.added_by := auth.uid();
  else
    new.added_by := old.added_by;
  end if;
  return new;
end;
$function$
;

create trigger stamp_character_inventory_added_by
  before insert or update on public.character_inventory
  for each row execute function public.stamp_character_inventory_added_by();

commit;

-- ---------------------------------------------------------------------------
-- verification
--
-- As a player who owns a character, and that campaign's DM, in explicit
-- transactions with `set local role authenticated` and request.jwt.claims:
--
--   1. the player inserts with added_by set to the DM's id
--        -> row lands with added_by = the player's id, NOT the DM's
--   2. the DM inserts into the same sheet with added_by omitted entirely
--        -> row lands with added_by = the DM's id
--   3. the player updates row 2 setting added_by to their own id
--        -> update succeeds, added_by still reads the DM's id
--   4. the DM decrements quantity on row 1
--        -> quantity drops, added_by still reads the player's id
--
-- Case 4 is the regression to watch: it passes trivially under a trigger that
-- stamps on both branches, so confirm it by reading added_by back, not by
-- checking that the update was allowed.
-- ---------------------------------------------------------------------------

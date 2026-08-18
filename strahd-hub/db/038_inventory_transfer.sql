-- db/038_inventory_transfer.sql
--
-- Moving one stack between the party's pile and a character's sheet, in the
-- database rather than in the client.
--
-- The obvious implementation is two calls the app already has:
-- removeFromPartyInventory(entryId) then addToCharacterInventory(characterId,
-- itemId). That is two round trips with no transaction around them, so a failure
-- between them destroys a stack -- the item leaves the hoard and arrives
-- nowhere. Every other multi-step write in this app that could strand data is
-- already a function (030, 031, 032); this is the same argument, and it is the
-- only reason these two functions exist. Neither one does anything the client
-- could not express; both do it in one place where a failure cannot land
-- halfway.
--
-- Shaped after 032, because the concurrency problem is identical:
--
--   security invoker   RLS stays the boundary -- 021's is_campaign_member on the
--                      pile, 028's can_edit_character on the sheet -- and these
--                      functions are not a way around either. It carries through
--                      the nested add_*_inventory_item call too, so the
--                      DESTINATION's policies are checked as well as the source's.
--
--   select ... for update on the source first, rather than a lock-free
--                      `update ... where quantity > 1`. 032 documents why: a
--                      concurrent add whose `on conflict do update` bumps a stack
--                      of 1 to 2 in the window would lose both copies. The lock
--                      closes that, because the add has to wait behind it.
--
--   if not found       a missing source row returns quietly, for removeFrom*'s
--                      stated reason: everyone who can reach this call could
--                      already see the controls, so a target that is gone means a
--                      concurrent removal reached the end state the caller
--                      wanted.
--
--   decrement-or-delete on the source, not `set quantity = quantity - 1` alone.
--                      quantity has a `> 0` CHECK on both tables (021 and 028),
--                      so 0 is not a storable state -- the row has to go instead.
--
-- The destination side is a call to the existing add_character_inventory_item /
-- add_party_inventory_item rather than an insert written out again. Reusing them
-- is the point: the stacking rule and its `on conflict` arbitration stay in one
-- place, so a future change to how stacks merge cannot apply to adds and miss
-- transfers.
--
-- ONE STACK AT A TIME, not the whole pile: x3 moved once leaves x2 behind. The
-- button is per-row and pressing it three times is the honest way to say "all of
-- them". A quantity argument would need its own validation and an over-take
-- failure mode, for a case that has not come up.
--
-- ONE BEHAVIOUR TO KNOW AND NOT TO FIGHT: 029's trigger stamps added_by on the
-- destination when a transfer creates a fresh character stack, so a DM moving
-- something out of the hoard onto a player's sheet shows up as "from <the DM>",
-- which is exactly what the byline is for. Moving into an EXISTING stack re-pins
-- the original adder -- 030's documented cost, unchanged and not worth a column
-- to undo.
--
-- WHERE THIS FILE DEPARTS FROM THE BRIEF THAT ASKED FOR IT, and it matters for
-- reading the second function: the brief has move_character_item_to_party derive
-- the destination pile from "character_inventory.campaign_id". There is no such
-- column. 028 deliberately left it off ("the campaign is one join away through
-- character_id, and a second copy could only ever disagree" -- 037 restates it),
-- so the campaign is read from characters instead. The design intent survives
-- intact and is the reason the signature still takes only the entry: the
-- destination pile is DERIVED and therefore cannot be passed in wrong.
--
-- RUN THE MIGRATION BLOCK BELOW ON ITS OWN, then the verification blocks one at
-- a time. Per 036 the ledger insert is unguarded, so a second run of the
-- migration fails on the primary key and rolls back -- which is the point.


-- ===========================================================================
-- MIGRATION
-- ===========================================================================
--
-- CORRECT OUTPUT: "Success. No rows returned."

begin;

-- ---------------------------------------------------------------------------
-- hoard -> sheet
-- ---------------------------------------------------------------------------

-- Takes the character explicitly, because a party_inventory row knows its
-- campaign but not which of that campaign's characters is reaching for it.
--
-- The add is attempted BEFORE the source is touched. Within one function the
-- order is not what makes this safe -- the whole body is one transaction, so a
-- raise anywhere rolls all of it back -- but it puts the call that can be
-- DENIED first, which keeps the failing case cheap and the read of this function
-- honest about what it is gambling on.
--
-- What the nested call is subject to: 028's "owner or dm adds to inventory",
-- with check (can_edit_character(character_id)). A campaign member who is
-- neither the owner nor the DM gets 42501 out of it and the transaction rolls
-- back -- the pile is not decremented and nothing is created. Note that this
-- RAISES rather than returning quietly, unlike the missing-source case above it,
-- and that asymmetry is deliberate: a source that is already gone is the end
-- state the caller wanted, while a destination they may not write to is a
-- genuine refusal and the row that fired it should say so. Unreachable from the
-- page as built -- Inventory.tsx only ever passes the viewer's own character --
-- but it is the boundary, so it is worth knowing which side of it errors.
create or replace function public.move_party_item_to_character(
  target_entry uuid,
  target_character uuid
)
 returns void
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
declare
  source record;
begin
  select id, item_id, quantity into source
  from party_inventory
  where id = target_entry
  for update;

  if not found then
    return;
  end if;

  perform add_character_inventory_item(target_character, source.item_id);

  if source.quantity <= 1 then
    delete from party_inventory where id = source.id;
  else
    update party_inventory
    set quantity = source.quantity - 1
    where id = source.id;
  end if;
end;
$function$
;

-- ---------------------------------------------------------------------------
-- sheet -> hoard
-- ---------------------------------------------------------------------------

-- Takes only the entry. The destination pile is the campaign the character
-- belongs to, so it is derived here rather than passed in, and there is no way
-- for a caller to stow an item into the wrong party's hoard.
--
-- The campaign is read in a SECOND statement rather than joined into the locking
-- SELECT above it, and this is the one line in the file that is easy to get
-- wrong. `select ... from character_inventory ci join characters c ... for
-- update` locks BOTH relations, and Postgres applies each locked relation's
-- UPDATE policy USING clause to the locking read. characters' UPDATE policy is
-- owner-only (028), so joining would silently return zero rows for a DM stowing
-- a player's item -- the exact case can_edit_character exists to allow -- and the
-- function would return quietly having done nothing. Two statements keep the
-- lock on the one table that is being written and leave characters as a plain
-- read under its SELECT policy, which any campaign member passes.
--
-- That read cannot come back empty. character_inventory's own SELECT policy is
-- `exists (select 1 from characters c where c.id = ...)`, so seeing the source
-- row at all already required seeing the character; if the lock above found a
-- row, this finds one too. Left unguarded rather than defended with an
-- `if not found` that could never fire -- a null campaign would in any case be
-- caught by party_inventory.campaign_id's NOT NULL rather than stored.
create or replace function public.move_character_item_to_party(
  target_entry uuid
)
 returns void
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
declare
  source record;
  destination uuid;
begin
  select id, character_id, item_id, quantity into source
  from character_inventory
  where id = target_entry
  for update;

  if not found then
    return;
  end if;

  select campaign_id into destination
  from characters
  where id = source.character_id;

  perform add_party_inventory_item(destination, source.item_id);

  if source.quantity <= 1 then
    delete from character_inventory where id = source.id;
  else
    -- 029's trigger takes its UPDATE branch here and re-pins added_by, which is
    -- the case that migration was written for: stowing part of a stack must not
    -- rewrite the byline on what stays behind.
    update character_inventory
    set quantity = source.quantity - 1
    where id = source.id;
  end if;
end;
$function$
;

insert into public.schema_migrations (version) values ('038');

commit;


-- ===========================================================================
-- VERIFICATION -- run before touching client code
-- ===========================================================================
--
-- Live SQL, not a narrated checklist: every block below runs in its own explicit
-- transaction and ends in ROLLBACK, so it can be run against the live database
-- as many times as you like and leaves nothing behind.
--
-- Run ONE BLOCK AT A TIME. The Supabase SQL editor renders only the last result
-- set of a run, so pasting the whole section would show the last block and
-- silently discard the ones before it. Each block is complete on its own and
-- ends in exactly one SELECT followed by ROLLBACK. There is no \set anywhere, so
-- these behave the same under psql -- which blocks 5 and 6 need, since they take
-- two connections.
--
-- The uuids are 037's, unchanged:
--
--   campaign A   d721b412-2750-492e-bddd-7387fc464bba   The cool kids
--   player of A  1313672b-6990-45a6-8a28-c448ca116d2d   Nat
--   DM of A      ea74d56b-8f45-4e4c-80f8-90a6d29b5adf   Dlizard72
--   DM of B      a52bba44-8278-47d3-8d91-5b47f1fe73cc   PeacefulCow  (not in A)
--
-- Each block builds its own fixture first, as the table owner, before switching
-- role -- owners bypass RLS, so the setup is never itself under test. A block
-- that tested nothing because a row was missing would read exactly like a block
-- that passed.


-- ===========================================================================
-- BLOCK 0 -- the migration landed
-- ===========================================================================
--
-- CORRECT OUTPUT: one row. Both functions present, both prosecdef = false
-- (SECURITY INVOKER -- a true here means RLS has been switched off for the one
-- write in this app that spans two tables), and ledger_row = true.

select 'check 0: functions and ledger' as check,
       jsonb_build_object(
         'to_character', (select jsonb_build_object('exists', true,
                                                    'security_definer', p.prosecdef)
                          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public'
                            and p.proname = 'move_party_item_to_character'),
         'to_party',     (select jsonb_build_object('exists', true,
                                                    'security_definer', p.prosecdef)
                          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public'
                            and p.proname = 'move_character_item_to_party'),
         'ledger_row',   exists (select 1 from public.schema_migrations
                                 where version = '038')
       ) as result;


-- ===========================================================================
-- BLOCK 1 -- a player takes a x1 from the hoard onto their own character
-- ===========================================================================
--
-- The headline case, and the one the whole migration exists for: the stack has
-- to leave the pile and arrive on the sheet, or do neither.
--
-- CORRECT OUTPUT: one row. party_rows = 0 (the x1 emptied off the pile rather
-- than lingering at quantity 0, which the CHECK makes unstorable anyway),
-- character_quantity = 1, and added_by = the player.

begin;

  insert into characters (campaign_id, user_id, name)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          '1313672b-6990-45a6-8a28-c448ca116d2d',
          'Verification Subject')
  on conflict (campaign_id, user_id) do nothing;

  select set_config('verification.character',
                    (select id::text from characters
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and user_id     = '1313672b-6990-45a6-8a28-c448ca116d2d'),
                    true),
         set_config('verification.item',
                    (select id::text from items
                     where campaign_id is null order by name limit 1),
                    true);

  -- The fixture, written as the owner so RLS never sees it: exactly one on the
  -- pile, and nothing of it on the sheet.
  delete from character_inventory
  where character_id = current_setting('verification.character')::uuid
    and item_id      = current_setting('verification.item')::uuid;

  insert into party_inventory (campaign_id, item_id, quantity)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          current_setting('verification.item')::uuid, 1)
  on conflict (campaign_id, item_id) do update set quantity = 1;

  select set_config('verification.entry',
                    (select id::text from party_inventory
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and item_id     = current_setting('verification.item')::uuid),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select move_party_item_to_character(
           current_setting('verification.entry')::uuid,
           current_setting('verification.character')::uuid
         );

  select 'case 1: player takes a x1 onto their own character' as check,
         jsonb_build_object(
           'party_rows',
             (select count(*) from party_inventory
              where id = current_setting('verification.entry')::uuid),
           'character_quantity',
             (select quantity from character_inventory
              where character_id = current_setting('verification.character')::uuid
                and item_id      = current_setting('verification.item')::uuid),
           'added_by_is_the_player',
             (select added_by = '1313672b-6990-45a6-8a28-c448ca116d2d'
              from character_inventory
              where character_id = current_setting('verification.character')::uuid
                and item_id      = current_setting('verification.item')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 2 -- taking one of a x3 leaves x2 behind
-- ===========================================================================
--
-- The "one stack at a time" rule, which is a product decision rather than a
-- limitation and is therefore worth a check of its own.
--
-- CORRECT OUTPUT: one row. party_quantity = 2, character_quantity = 1.

begin;

  insert into characters (campaign_id, user_id, name)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          '1313672b-6990-45a6-8a28-c448ca116d2d',
          'Verification Subject')
  on conflict (campaign_id, user_id) do nothing;

  select set_config('verification.character',
                    (select id::text from characters
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and user_id     = '1313672b-6990-45a6-8a28-c448ca116d2d'),
                    true),
         set_config('verification.item',
                    (select id::text from items
                     where campaign_id is null order by name limit 1),
                    true);

  delete from character_inventory
  where character_id = current_setting('verification.character')::uuid
    and item_id      = current_setting('verification.item')::uuid;

  insert into party_inventory (campaign_id, item_id, quantity)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          current_setting('verification.item')::uuid, 3)
  on conflict (campaign_id, item_id) do update set quantity = 3;

  select set_config('verification.entry',
                    (select id::text from party_inventory
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and item_id     = current_setting('verification.item')::uuid),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select move_party_item_to_character(
           current_setting('verification.entry')::uuid,
           current_setting('verification.character')::uuid
         );

  select 'case 2: one of a x3 moves, x2 stays' as check,
         jsonb_build_object(
           'party_quantity',
             (select quantity from party_inventory
              where id = current_setting('verification.entry')::uuid),
           'character_quantity',
             (select quantity from character_inventory
              where character_id = current_setting('verification.character')::uuid
                and item_id      = current_setting('verification.item')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 3 -- the DM stows an item off a player's sheet
-- ===========================================================================
--
-- The direction and the actor that the two-statement lookup in
-- move_character_item_to_party exists for. Joining characters into the locking
-- SELECT would make this block report a silent no-op -- a DM is not the owner,
-- and characters' UPDATE policy is owner-only -- so a zero here is that bug and
-- not a permissions question.
--
-- CORRECT OUTPUT: one row. character_rows = 0, party_quantity = 1.

begin;

  insert into characters (campaign_id, user_id, name)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          '1313672b-6990-45a6-8a28-c448ca116d2d',
          'Verification Subject')
  on conflict (campaign_id, user_id) do nothing;

  select set_config('verification.character',
                    (select id::text from characters
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and user_id     = '1313672b-6990-45a6-8a28-c448ca116d2d'),
                    true),
         set_config('verification.item',
                    (select id::text from items
                     where campaign_id is null order by name limit 1),
                    true);

  delete from party_inventory
  where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
    and item_id     = current_setting('verification.item')::uuid;

  insert into character_inventory (character_id, item_id, quantity)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.item')::uuid, 1)
  on conflict (character_id, item_id) do update set quantity = 1;

  select set_config('verification.entry',
                    (select id::text from character_inventory
                     where character_id = current_setting('verification.character')::uuid
                       and item_id      = current_setting('verification.item')::uuid),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select move_character_item_to_party(current_setting('verification.entry')::uuid);

  select 'case 3: the campaign DM stows off a player''s sheet' as check,
         jsonb_build_object(
           'character_rows',
             (select count(*) from character_inventory
              where id = current_setting('verification.entry')::uuid),
           'party_quantity',
             (select quantity from party_inventory
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                and item_id     = current_setting('verification.item')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 4 -- a fellow member stows off someone else's sheet -> silent no-op
-- ===========================================================================
--
-- PeacefulCow is put into campaign A as a plain player first, because the denial
-- has to come from "member but neither owner nor DM" -- as a non-member they
-- would be stopped by the outer half of the check and this would prove the
-- weaker thing.
--
-- This one returns QUIETLY rather than raising, and that is 032's documented
-- behaviour rather than a new decision: `select ... for update` applies the
-- SELECT policy AND the UPDATE policy's USING clause, so someone who can read a
-- sheet but not edit it gets no row and falls straight out of the `if not found`.
-- Contrast block 5, where the denial is on the DESTINATION and does raise.
--
-- CORRECT OUTPUT: one row. outcome = 'returned quietly', character_rows = 1 (the
-- source untouched) and party_rows = 0 (nothing created). Any raise here is a
-- behaviour change from 032 worth understanding; a party_rows of 1 is one player
-- moving another player's gear.

begin;

  insert into characters (campaign_id, user_id, name)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          '1313672b-6990-45a6-8a28-c448ca116d2d',
          'Verification Subject')
  on conflict (campaign_id, user_id) do nothing;

  insert into campaign_members (campaign_id, user_id, role)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          'a52bba44-8278-47d3-8d91-5b47f1fe73cc',
          'player')
  on conflict (campaign_id, user_id) do nothing;

  select set_config('verification.character',
                    (select id::text from characters
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and user_id     = '1313672b-6990-45a6-8a28-c448ca116d2d'),
                    true),
         set_config('verification.item',
                    (select id::text from items
                     where campaign_id is null order by name limit 1),
                    true);

  delete from party_inventory
  where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
    and item_id     = current_setting('verification.item')::uuid;

  insert into character_inventory (character_id, item_id, quantity)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.item')::uuid, 1)
  on conflict (character_id, item_id) do update set quantity = 1;

  select set_config('verification.entry',
                    (select id::text from character_inventory
                     where character_id = current_setting('verification.character')::uuid
                       and item_id      = current_setting('verification.item')::uuid),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"a52bba44-8278-47d3-8d91-5b47f1fe73cc","role":"authenticated"}',
           true
         );
  set local role authenticated;

  do $$
  begin
    perform move_character_item_to_party(current_setting('verification.entry')::uuid);
    perform set_config('verification.outcome', 'returned quietly', true);
  exception
    when insufficient_privilege then
      perform set_config('verification.outcome', 'raised 42501', true);
  end
  $$;

  select 'case 4: a fellow member stows off someone else''s sheet' as check,
         jsonb_build_object(
           'outcome',        current_setting('verification.outcome'),
           'character_rows',
             (select count(*) from character_inventory
              where id = current_setting('verification.entry')::uuid),
           'party_rows',
             (select count(*) from party_inventory
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                and item_id     = current_setting('verification.item')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 5 -- a fellow member takes onto someone else's sheet -> denied, nothing moved
-- ===========================================================================
--
-- The mirror of block 4, and the half that behaves differently: here the refusal
-- is on the DESTINATION, where 028's INSERT policy is a WITH CHECK rather than a
-- lock, so it raises 42501 instead of returning quietly. The raise is wrapped so
-- the block reports it rather than aborting.
--
-- What actually matters is the second half of the result: the pile must be
-- UNCHANGED. This is the whole reason the operation is one function -- a version
-- built from two client calls could decrement the hoard and then be refused the
-- sheet, and the stack would be gone.
--
-- CORRECT OUTPUT: one row. outcome = 'denied by RLS (42501)', party_quantity = 1
-- (untouched), character_rows = 0. An outcome of 'MOVE SUCCEEDED -- LEAK' is one
-- player writing to another player's sheet. A party_quantity of 0 with a denial
-- is the stranded-stack bug this migration exists to prevent.

begin;

  insert into characters (campaign_id, user_id, name)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          '1313672b-6990-45a6-8a28-c448ca116d2d',
          'Verification Subject')
  on conflict (campaign_id, user_id) do nothing;

  insert into campaign_members (campaign_id, user_id, role)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          'a52bba44-8278-47d3-8d91-5b47f1fe73cc',
          'player')
  on conflict (campaign_id, user_id) do nothing;

  select set_config('verification.character',
                    (select id::text from characters
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and user_id     = '1313672b-6990-45a6-8a28-c448ca116d2d'),
                    true),
         set_config('verification.item',
                    (select id::text from items
                     where campaign_id is null order by name limit 1),
                    true);

  delete from character_inventory
  where character_id = current_setting('verification.character')::uuid
    and item_id      = current_setting('verification.item')::uuid;

  insert into party_inventory (campaign_id, item_id, quantity)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          current_setting('verification.item')::uuid, 1)
  on conflict (campaign_id, item_id) do update set quantity = 1;

  select set_config('verification.entry',
                    (select id::text from party_inventory
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and item_id     = current_setting('verification.item')::uuid),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"a52bba44-8278-47d3-8d91-5b47f1fe73cc","role":"authenticated"}',
           true
         );
  set local role authenticated;

  do $$
  begin
    perform move_party_item_to_character(
              current_setting('verification.entry')::uuid,
              current_setting('verification.character')::uuid);
    perform set_config('verification.outcome', 'MOVE SUCCEEDED -- LEAK', true);
  exception
    when insufficient_privilege then
      perform set_config('verification.outcome', 'denied by RLS (42501)', true);
  end
  $$;

  select 'case 5: a fellow member takes onto someone else''s sheet' as check,
         jsonb_build_object(
           'outcome',         current_setting('verification.outcome'),
           'party_quantity',
             (select quantity from party_inventory
              where id = current_setting('verification.entry')::uuid),
           'character_rows',
             (select count(*) from character_inventory
              where character_id = current_setting('verification.character')::uuid
                and item_id      = current_setting('verification.item')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 6 -- a source row that is already gone -> returns quietly
-- ===========================================================================
--
-- CORRECT OUTPUT: one row, both outcomes 'returned void'. An exception here
-- would mean a player whose second click landed after someone else's removal
-- sees an error for having wanted what already happened.

begin;

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  do $$
  begin
    perform move_character_item_to_party('00000000-0000-0000-0000-000000000000');
    perform set_config('verification.stow', 'returned void', true);
  exception when others then
    perform set_config('verification.stow', 'raised ' || sqlstate, true);
  end
  $$;

  do $$
  begin
    perform move_party_item_to_character(
              '00000000-0000-0000-0000-000000000000',
              '00000000-0000-0000-0000-000000000000');
    perform set_config('verification.take', 'returned void', true);
  exception when others then
    perform set_config('verification.take', 'raised ' || sqlstate, true);
  end
  $$;

  select 'case 6: a source row that does not exist' as check,
         jsonb_build_object(
           'stow', current_setting('verification.stow'),
           'take', current_setting('verification.take')
         ) as result;

rollback;


-- ---------------------------------------------------------------------------
-- BLOCK 7 -- the race, which needs TWO psql sessions
-- ---------------------------------------------------------------------------
--
-- The reason for the lock, run exactly the way 032 documents its own. Cannot be
-- reached from one connection, so it is written out rather than executed. Pick a
-- party_inventory row at quantity 2 and a character you may write to, then:
--
--   A: begin; select move_party_item_to_character('<entry>', '<character>');
--   B: begin; select move_party_item_to_character('<entry>', '<character>');  -- blocks
--   A: commit;                                                                -- B wakes
--   B: commit;
--
--   -> the pile has NO row of that item left, and the sheet holds x2.
--
-- Read the TABLES back to check this, not the return values -- both calls
-- succeed either way. The failure mode being tested is a pile left at x1 with
-- the sheet at x2, i.e. a copy conjured out of the race, which is what a
-- lock-free `update ... where quantity > 1` would produce against a concurrent
-- add. Same shape as 032's verification, one table further along.
--
-- If the client gets a 404/PGRST202 from either RPC after this runs, that is the
-- schema cache, not a missing grant -- `notify pgrst, 'reload schema';`. A
-- missing grant reads as 401/42501 instead.
--
-- Then regenerate the client types: npm run gen:types
-- ---------------------------------------------------------------------------

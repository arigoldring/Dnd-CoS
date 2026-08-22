-- db/047_character_item_descriptions.sql
--
-- 046's twin, for gear: a player's own name and description for an item they
-- carry, standing in front of the catalogue text without replacing it. Read
-- 046's header first -- the shape, the four policies, the pin trigger and the
-- not_empty constraint are all identical and argued there.
--
-- ONE DIFFERENCE, AND IT IS THE WHOLE REASON THE KEY IS SHAPED THIS WAY.
--
-- 046 declines to hang flavour off a character_spells row partly on principle:
-- removing a spell is a deliberate "I do not have this", so losing its text
-- with it would be defensible even if it were unwelcome. Here it is not a
-- matter of principle at all, because character_inventory rows are destroyed
-- routinely by writes that mean nothing of the kind:
--
--   032  decrement_character_inventory_item DELETES the row at the last one.
--        `quantity > 0` makes 0 unstorable, so using your last torch does not
--        leave an empty stack -- it leaves nothing.
--   038  move_character_item_to_party deletes the source row on every Stow, and
--        move_party_item_to_character mints a fresh one on the way back.
--
-- So a custom_description column on character_inventory would be lost by
-- handing your sword to the party and taking it back thirty seconds later --
-- the single most ordinary thing anyone does on the Inventory page. Keyed on
-- (character_id, item_id) it survives all of that, because it describes what
-- this character thinks of this item rather than the particular stack they
-- happen to be holding. BLOCK 7 below demonstrates it rather than asserting it.
--
-- The accepted cost: give an item away for good and its description row stays
-- behind, invisible, until the day you own that item again. One narrow row per
-- abandoned idea, at a table of five. Written up in KNOWN_ISSUES.md.
--
-- Note also that character_inventory DOES have an UPDATE policy (028) where
-- character_spells does not, so the column route was genuinely available here
-- and was still the wrong answer. The lifetime is the argument, not the policy.
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

-- Column-for-column 046's table with item_id in place of spell_id. The
-- reasoning for every line of it -- composite pk as the upsert's conflict
-- target, no campaign_id, both text columns nullable, btrim'd length bounds,
-- the not_empty constraint -- is in 046's header and is not repeated here.
create table public.character_item_descriptions (
  character_id uuid not null references public.characters(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete cascade,

  custom_name text
    check (custom_name is null or length(btrim(custom_name)) between 1 and 60),
  custom_description text
    check (custom_description is null
           or length(btrim(custom_description)) between 1 and 2000),

  updated_at timestamptz not null default now(),

  primary key (character_id, item_id),

  constraint character_item_descriptions_not_empty
    check (custom_name is not null or custom_description is not null)
);

-- No standalone index on character_id: the primary key leads on it, and
-- `where character_id = $1` is the only read this table serves. Note this is
-- the opposite call from 028, which DID give character_inventory its own index
-- -- because that table was born without a unique constraint and only got one
-- in 030, at which point 032 dropped the index again as redundant. This table
-- is born with the key.

alter table public.character_item_descriptions enable row level security;

create policy "character viewers read item descriptions"
  on public.character_item_descriptions for select to authenticated
  using (
    exists (
      select 1 from characters c
      where c.id = character_item_descriptions.character_id
    )
  );

create policy "owner or dm writes item descriptions"
  on public.character_item_descriptions for insert to authenticated
  with check (public.can_edit_character(character_id));

-- INSERT and UPDATE both. See 046: the client saves through an upsert whose
-- second save is an UPDATE, and omitting this policy produces the failure this
-- database has now shipped three times -- works once, refuses mid-session.
create policy "owner or dm edits item descriptions"
  on public.character_item_descriptions for update to authenticated
  using (public.can_edit_character(character_id))
  with check (public.can_edit_character(character_id));

-- DELETE, unlike the two dm_notes tables, because clearing has to remove the
-- row: an absent row resolves to the catalogue text, so a blank row would be a
-- second spelling of the same thing. 046's header makes the full argument.
create policy "owner or dm clears item descriptions"
  on public.character_item_descriptions for delete to authenticated
  using (public.can_edit_character(character_id));

-- 046's trigger, pointed at item_id. Same reason: both UPDATE clauses only ask
-- "may you edit *a* character", so a DM -- who passes on every sheet in the
-- campaign -- could otherwise carry one player's writing onto another's row.
--
-- ⚠ A blocklist, like every pin trigger here. A column added later is
-- client-writable until it is named above. It fails open.
create or replace function public.pin_character_item_description_row()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
begin
  new.character_id := old.character_id;
  new.item_id      := old.item_id;
  new.updated_at   := now();
  return new;
end;
$function$
;

create trigger pin_character_item_description_row
  before update on public.character_item_descriptions
  for each row execute function public.pin_character_item_description_row();

insert into public.schema_migrations (version) values ('047');

commit;


-- ===========================================================================
-- VERIFICATION -- run before touching client code
-- ===========================================================================
--
-- Run ONE BLOCK AT A TIME -- the Supabase SQL editor renders only the last
-- result set of a run. Every block builds its own fixture as the table owner
-- before switching role, and ends in ROLLBACK.
--
-- 046's blocks 2, 3 and 4 (the DM writes, a fellow member is refused, a
-- non-member reads nothing) are NOT repeated here. They test can_edit_character
-- and the fail-closed EXISTS, both of which are shared verbatim between the two
-- tables, and 046 already exercises them against the same predicate. What is
-- below is what is different: the upsert path, the pin, the constraint, and the
-- lifetime property this table exists for.
--
-- The uuids are 033/037's, unchanged:
--
--   campaign A   d721b412-2750-492e-bddd-7387fc464bba   The cool kids
--   player of A  1313672b-6990-45a6-8a28-c448ca116d2d   Nat
--   DM of A      ea74d56b-8f45-4e4c-80f8-90a6d29b5adf   Dlizard72


-- ===========================================================================
-- BLOCK 0 -- the migration landed, with four policies and the trigger
-- ===========================================================================
--
-- CORRECT OUTPUT: two rows.
--   check 0a  all four booleans true.
--   check 0b  exactly four policies -- cmd 'r', 'a', 'w', 'd'. Three means the
--             UPDATE policy is missing and the feature will refuse its second
--             save.

select 'check 0a: table, ledger and trigger' as check,
       jsonb_build_object(
         'table_exists', to_regclass('public.character_item_descriptions') is not null,
         'rls_enabled',  (select relrowsecurity from pg_class
                          where oid = to_regclass('public.character_item_descriptions')),
         'ledger_row',   exists (select 1 from public.schema_migrations
                                 where version = '047'),
         'pin_trigger',  exists (select 1 from pg_trigger
                                 where tgrelid = to_regclass('public.character_item_descriptions')
                                   and tgname = 'pin_character_item_description_row')
       ) as result
union all
select 'check 0b: policies',
       (select jsonb_agg(jsonb_build_object('name', polname, 'cmd', polcmd)
                         order by polname)
        from pg_policy
        where polrelid = to_regclass('public.character_item_descriptions'));


-- ===========================================================================
-- BLOCK 1 -- the owner saves TWICE on the same item
-- ===========================================================================
--
-- 046's block 1. The first statement is an INSERT and the second an UPDATE,
-- which is what the client's upsert does across two visits to the same card.
--
-- CORRECT OUTPUT: one row. rows = 1, stored_name = 'Grandfather''s Blade',
-- stored_description = 'the second telling', updated_at_moved = true.
--
-- A 42501 on the second statement means the UPDATE policy is missing.

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

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  insert into character_item_descriptions
         (character_id, item_id, custom_name, custom_description)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.item')::uuid,
          'Grandfather''s Blade',
          'the first telling')
  on conflict (character_id, item_id) do update
    set custom_name        = excluded.custom_name,
        custom_description = excluded.custom_description;

  select set_config('verification.first_stamp',
                    (select updated_at::text from character_item_descriptions
                     where character_id = current_setting('verification.character')::uuid
                       and item_id      = current_setting('verification.item')::uuid),
                    true);

  insert into character_item_descriptions
         (character_id, item_id, custom_name, custom_description)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.item')::uuid,
          'Grandfather''s Blade',
          'the second telling')
  on conflict (character_id, item_id) do update
    set custom_name        = excluded.custom_name,
        custom_description = excluded.custom_description;

  select 'case 1: the owner saves twice on one item' as check,
         jsonb_build_object(
           'rows', (select count(*) from character_item_descriptions
                    where character_id = current_setting('verification.character')::uuid),
           'stored_name', (select custom_name from character_item_descriptions
                           where character_id = current_setting('verification.character')::uuid
                             and item_id = current_setting('verification.item')::uuid),
           'stored_description', (select custom_description from character_item_descriptions
                                  where character_id = current_setting('verification.character')::uuid
                                    and item_id = current_setting('verification.item')::uuid),
           'updated_at_moved',
             (select updated_at > current_setting('verification.first_stamp')::timestamptz
              from character_item_descriptions
              where character_id = current_setting('verification.character')::uuid
                and item_id = current_setting('verification.item')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 2 -- a re-key attempt is pinned to a no-op, not an error
-- ===========================================================================
--
-- 046's block 5, pointed at item_id. The DM is the caller because the DM is the
-- one whose can_edit_character passes on two different characters at once,
-- which is what makes the UPDATE policy alone insufficient.
--
-- CORRECT OUTPUT: one row. still_on_first_character = true,
-- still_on_first_item = true, rows_on_decoy = 0. An ERROR is also a failure --
-- the trigger is meant to make a bad write a no-op, not to raise.

begin;

  insert into characters (campaign_id, user_id, name)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          '1313672b-6990-45a6-8a28-c448ca116d2d',
          'Verification Subject')
  on conflict (campaign_id, user_id) do nothing;

  insert into characters (campaign_id, user_id, name)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          'ea74d56b-8f45-4e4c-80f8-90a6d29b5adf',
          'Verification Decoy')
  on conflict (campaign_id, user_id) do nothing;

  select set_config('verification.character',
                    (select id::text from characters
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and user_id     = '1313672b-6990-45a6-8a28-c448ca116d2d'),
                    true),
         set_config('verification.other_character',
                    (select id::text from characters
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and user_id     = 'ea74d56b-8f45-4e4c-80f8-90a6d29b5adf'),
                    true),
         set_config('verification.item',
                    (select id::text from items
                     where campaign_id is null order by name limit 1),
                    true),
         set_config('verification.other_item',
                    (select id::text from items
                     where campaign_id is null order by name desc limit 1),
                    true);

  insert into character_item_descriptions
         (character_id, item_id, custom_description)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.item')::uuid,
          'stays where it was written');

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  update character_item_descriptions
     set character_id = current_setting('verification.other_character')::uuid,
         item_id      = current_setting('verification.other_item')::uuid
   where character_id = current_setting('verification.character')::uuid
     and item_id      = current_setting('verification.item')::uuid;

  select 'case 2: a re-keying update is pinned' as check,
         jsonb_build_object(
           'still_on_first_character',
             exists (select 1 from character_item_descriptions
                     where character_id = current_setting('verification.character')::uuid
                       and custom_description = 'stays where it was written'),
           'still_on_first_item',
             exists (select 1 from character_item_descriptions
                     where item_id = current_setting('verification.item')::uuid
                       and custom_description = 'stays where it was written'),
           'rows_on_decoy',
             (select count(*) from character_item_descriptions
              where character_id = current_setting('verification.other_character')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 3 -- a row that overrides nothing is refused
-- ===========================================================================
--
-- 046's block 6. The client turns an all-blank draft into a DELETE before it
-- gets here; this is the backstop for the day it forgets.
--
-- CORRECT OUTPUT: one row, both outcomes 'refused by the check constraint',
-- rows = 0.

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

  do $$
  begin
    insert into character_item_descriptions (character_id, item_id)
    values (current_setting('verification.character')::uuid,
            current_setting('verification.item')::uuid);
    perform set_config('verification.outcome', 'EMPTY ROW STORED -- BUG', true);
  exception
    when check_violation then
      perform set_config('verification.outcome',
                         'refused by the check constraint', true);
  end
  $$;

  do $$
  begin
    insert into character_item_descriptions
           (character_id, item_id, custom_name)
    values (current_setting('verification.character')::uuid,
            current_setting('verification.item')::uuid,
            '     ');
    perform set_config('verification.blank_outcome',
                       'BLANK NAME STORED -- BUG', true);
  exception
    when check_violation then
      perform set_config('verification.blank_outcome',
                         'refused by the check constraint', true);
  end
  $$;

  select 'case 3: a row overriding nothing' as check,
         jsonb_build_object(
           'both_null',       current_setting('verification.outcome'),
           'whitespace_name', current_setting('verification.blank_outcome'),
           'rows',            (select count(*) from character_item_descriptions
                               where character_id = current_setting('verification.character')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 4 -- the point of the whole design: the stack dies, the text does not
-- ===========================================================================
--
-- The reason this table is keyed on (character_id, item_id) and not on
-- character_inventory.id. Three writes, each of which destroys the
-- character_inventory row, and the description standing after all of them:
--
--   1. decrement to zero -- 032 deletes the row, since quantity > 0 makes 0
--      unstorable. Using your last torch.
--   2. re-add           -- 030 mints a brand new row with a new id.
--   3. stow to the party -- 038 deletes the source row and creates a
--      party_inventory row. Handing your sword over the table.
--
-- A custom_description column on character_inventory is gone after step 1 and
-- gone again after step 3. This block is the difference, run as the owner
-- through RLS the whole way, because the RPCs are security invoker.
--
-- CORRECT OUTPUT: one row. description_survived_decrement,
-- description_survived_readd and description_survived_stow all true;
-- inventory_row_changed_id = true, which is what proves steps 1-2 really did
-- destroy and recreate the stack rather than leaving it alone.

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

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  -- The player owns one of the item and has written about it.
  select set_config('verification.entry',
                    add_character_inventory_item(
                      current_setting('verification.character')::uuid,
                      current_setting('verification.item')::uuid)::text,
                    true);

  insert into character_item_descriptions
         (character_id, item_id, custom_name, custom_description)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.item')::uuid,
          'Grandfather''s Blade',
          'Nicked at Ravenloft, and never sharpened since.')
  on conflict (character_id, item_id) do update
    set custom_name        = excluded.custom_name,
        custom_description = excluded.custom_description;

  -- 1. Use the last one. 032 deletes the stack. `select`, not `perform` --
  -- perform is plpgsql-only, and these blocks are plain SQL scripts.
  select decrement_character_inventory_item(
           current_setting('verification.entry')::uuid);

  select set_config('verification.survived_decrement',
                    (exists (select 1 from character_item_descriptions
                             where character_id = current_setting('verification.character')::uuid
                               and item_id = current_setting('verification.item')::uuid))::text,
                    true),
         set_config('verification.stack_gone',
                    (not exists (select 1 from character_inventory
                                 where id = current_setting('verification.entry')::uuid))::text,
                    true);

  -- 2. Find another one. 030 mints a new row with a new id.
  select set_config('verification.entry2',
                    add_character_inventory_item(
                      current_setting('verification.character')::uuid,
                      current_setting('verification.item')::uuid)::text,
                    true);

  -- 3. Hand it to the party. 038 deletes the source row.
  select move_character_item_to_party(
           current_setting('verification.entry2')::uuid);

  select 'case 4: the stack is destroyed three ways, the text survives' as check,
         jsonb_build_object(
           'description_survived_decrement',
             current_setting('verification.survived_decrement')::boolean,
           'inventory_row_changed_id',
             current_setting('verification.stack_gone')::boolean
             and current_setting('verification.entry')
                 is distinct from current_setting('verification.entry2'),
           'description_survived_readd',
             exists (select 1 from character_item_descriptions
                     where character_id = current_setting('verification.character')::uuid
                       and item_id = current_setting('verification.item')::uuid),
           'description_survived_stow',
             exists (select 1 from character_item_descriptions
                     where character_id = current_setting('verification.character')::uuid
                       and item_id = current_setting('verification.item')::uuid
                       and custom_name = 'Grandfather''s Blade'),
           'stack_is_gone_from_the_pack',
             not exists (select 1 from character_inventory
                         where character_id = current_setting('verification.character')::uuid
                           and item_id = current_setting('verification.item')::uuid)
         ) as result;

rollback;


-- ---------------------------------------------------------------------------
-- Block 1 is the one that fails the way this database has failed three times
-- before: the second save, not the first. Block 4 is the one that justifies the
-- whole table -- if it ever stops passing, someone has moved this text onto the
-- stack and the feature has quietly become "your words last until you put the
-- sword down".
--
-- If the client gets a 404/PGRST202 reading this table, that is the schema
-- cache -- `notify pgrst, 'reload schema';`. A missing grant reads as 401/42501.
--
-- Then regenerate the client types: npm run gen:types
-- ---------------------------------------------------------------------------

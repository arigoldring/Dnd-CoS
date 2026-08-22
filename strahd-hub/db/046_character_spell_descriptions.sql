-- db/046_character_spell_descriptions.sql
--
-- A player's own words for a spell on their sheet: an optional name and an
-- optional description that stand in front of the SRD text without replacing
-- it. The card shows their telling and keeps the book one click behind it, so
-- roleplay costs nobody the rules.
--
-- WHY A SIBLING TABLE AND NOT A COLUMN
--
-- spells.description is a shared catalogue row -- campaign_id is null means SRD
-- reaching every campaign -- so writing there would rewrite the spell for every
-- character in every campaign. 022 gives spells a SELECT policy and nothing
-- else, so there is no write path to abuse in the first place.
--
-- The other candidate was a column on character_spells. Rejected twice over:
--
--   037 ships that table with three policies and says in its own header that a
--   fourth is a bug, because every column there is a key or a defaulted
--   timestamp. Adding a mutable column is exactly the change that would make
--   that comment wrong, and addSpellToCharacter's `ignoreDuplicates: true`
--   (which renders as ON CONFLICT DO NOTHING and needs only INSERT) is written
--   against the absence of that UPDATE policy.
--
--   And a character_spells row is disposable: removing a spell is a DELETE, and
--   re-adding it mints a new row. Flavour keyed on that row would evaporate the
--   first time someone dropped a spell and took it back. 047 makes the same
--   argument far more forcefully for items, where 032 deletes the stack at
--   quantity zero and 038's transfers delete it on every Stow.
--
-- Keyed on (character_id, spell_id) instead, so the text belongs to "this
-- character's idea of this spell" and outlives whatever row currently says they
-- have it. The shape is location_dm_notes' -- one row per parent, keyed by the
-- ids it references, campaign one join away -- and 044 is the worked example
-- this file follows for the policies and the pin trigger.
--
-- FOUR POLICIES HERE, WHERE 037 INSISTS ON THREE. That is not drift. 037 has no
-- UPDATE policy because it has nothing an update could change; this table is
-- nothing but a mutable column, and the client saves through an upsert whose
-- second save is an UPDATE. Three policies here is the bug.
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

-- No surrogate id. Nothing references these rows, every read is "this
-- character's overrides" and every write names a character and a spell, so the
-- composite primary key is also the upsert's conflict target -- the same job
-- location_dm_notes.location_id does as a bare pk.
--
-- No campaign_id, on 028's argument: the campaign is one join away through
-- character_id and a second copy could only ever disagree.
--
-- Both text columns are nullable because either override is useful alone: a
-- renamed sword with the book's own description, or the book's name with a
-- private history under it.
create table public.character_spell_descriptions (
  character_id uuid not null references public.characters(id) on delete cascade,
  spell_id     uuid not null references public.spells(id) on delete cascade,

  -- Bounded, and trimmed-length rather than raw length, so a name of sixty
  -- spaces is not a name. 60 is what fits a card header beside the catalogue
  -- name; 2000 is a long paragraph and well short of anything that would break
  -- a layout.
  custom_name text
    check (custom_name is null or length(btrim(custom_name)) between 1 and 60),
  custom_description text
    check (custom_description is null
           or length(btrim(custom_description)) between 1 and 2000),

  updated_at timestamptz not null default now(),

  primary key (character_id, spell_id),

  -- A row that overrides nothing must not exist. Clearing deletes the row
  -- rather than storing two nulls, so "absent" is the only spelling of "no
  -- override" -- 042's argument against a defaulted row, one table over. It
  -- matters more here than it did there: the reader falls back to the
  -- catalogue text when there is no row, so a blank row would be a second,
  -- silent way to say the same thing.
  constraint character_spell_descriptions_not_empty
    check (custom_name is not null or custom_description is not null)
);

-- No standalone index on character_id, for 037's reason: the primary key leads
-- on it, and `where character_id = $1` is the only read this table serves.

alter table public.character_spell_descriptions enable row level security;

-- Visibility is exactly "can you see the character", 037's shape. The subquery
-- runs as the invoker, so it answers through characters' own SELECT policy:
-- campaign members pass, everyone else gets zero rows, and membership is
-- enforced without this policy mentioning it.
--
-- The referencing column is written out in full rather than left bare. Bare, it
-- resolves to the outer relation only because characters has no column of that
-- name -- correct by accident, and silently wrong the day characters gains one.
--
-- Deliberately not narrowed to the owner. Flavour text is written to be read at
-- the table; the whole party seeing what you call your Fireball is the feature.
create policy "character viewers read spell descriptions"
  on public.character_spell_descriptions for select to authenticated
  using (
    exists (
      select 1 from characters c
      where c.id = character_spell_descriptions.character_id
    )
  );

-- Writes need no new predicate: 028's can_edit_character is already exactly
-- "the owner OR this campaign's DM", which is the whole of this feature's
-- permission model. It widens the write to the DM so a cursed blade can arrive
-- already carrying its story, and to nobody else.
create policy "owner or dm writes spell descriptions"
  on public.character_spell_descriptions for insert to authenticated
  with check (public.can_edit_character(character_id));

-- INSERT and UPDATE both, and this is the half that has broken three times.
-- The client saves through an upsert on the primary key: the first save on a
-- spell with no row yet is an INSERT, every save after it an UPDATE, from the
-- same button. supabase-js without ignoreDuplicates renders ON CONFLICT DO
-- UPDATE, which needs this policy -- and the value has to actually change, so
-- ignoreDuplicates is not an option here the way it is on character_spells.
-- 033 (npc_dm_notes), 042 (campaign_map_reveals) and 044 (location_dm_notes)
-- each learned the same lesson in the same costume: works once, then starts
-- refusing with 42501 mid-session.
create policy "owner or dm edits spell descriptions"
  on public.character_spell_descriptions for update to authenticated
  using (public.can_edit_character(character_id))
  with check (public.can_edit_character(character_id));

-- A DELETE policy, unlike npc_dm_notes and location_dm_notes, which both refuse
-- one on the grounds that clearing a note is `notes = ''`. Those tables can say
-- that because a blank note and a missing note render identically -- an empty
-- panel either way. Here they do not: the reader resolves an absent row to the
-- catalogue text, so a blank override would have to be resolved the same way,
-- which makes '' a second spelling of absent and puts the not_empty constraint
-- above in direct conflict with the clear button. Clearing removes the row.
create policy "owner or dm clears spell descriptions"
  on public.character_spell_descriptions for delete to authenticated
  using (public.can_edit_character(character_id));

-- RLS decides which ROWS a policy admits; it has nothing to say about columns.
-- Both clauses of the UPDATE policy above only ask "may you edit *a*
-- character", so without this an UPDATE could carry one player's writing onto
-- another player's row -- any row its author is also allowed to edit, which for
-- a DM is every sheet in the campaign.
--
-- Note that 028 explicitly declined to pin character_inventory's character_id,
-- on the grounds that "moving an entry between two characters you can edit is
-- harmless". Moving a stack of arrows is. Moving somebody's prose onto someone
-- else's sheet is not, so this table gets the trigger that one skipped.
--
-- updated_at is stamped here rather than defaulted-and-trusted, for
-- stamp_session_recap's reason: the column is meant to record when the server
-- took the write, and a client is free to send whatever it likes for it.
--
-- ⚠ This is a blocklist, like every pin trigger in this database (see
-- CLAUDE.md). It names the columns an update may not touch, so a column added
-- to this table later is client-writable until someone remembers to pin it. It
-- fails open. Check here before adding one.
create or replace function public.pin_character_spell_description_row()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
begin
  new.character_id := old.character_id;
  new.spell_id     := old.spell_id;
  new.updated_at   := now();
  return new;
end;
$function$
;

create trigger pin_character_spell_description_row
  before update on public.character_spell_descriptions
  for each row execute function public.pin_character_spell_description_row();

insert into public.schema_migrations (version) values ('046');

commit;


-- ===========================================================================
-- VERIFICATION -- run before touching client code
-- ===========================================================================
--
-- Live SQL, not a narrated checklist: every block below runs in its own
-- explicit transaction and ends in ROLLBACK, so it can be run against the live
-- database as many times as you like and leaves nothing behind.
--
-- Run ONE BLOCK AT A TIME. The Supabase SQL editor renders only the last result
-- set of a run, so pasting the whole section would show the last block and
-- silently discard every one before it.
--
-- The uuids are 033_npcs_verification.sql's and 037's, unchanged:
--
--   campaign A   d721b412-2750-492e-bddd-7387fc464bba   The cool kids
--   player of A  1313672b-6990-45a6-8a28-c448ca116d2d   Nat
--   DM of A      ea74d56b-8f45-4e4c-80f8-90a6d29b5adf   Dlizard72
--   DM of B      a52bba44-8278-47d3-8d91-5b47f1fe73cc   PeacefulCow  (not in A)
--
-- Each block builds its own fixture first, as the table owner, before switching
-- role -- owners bypass RLS, so the setup is never itself under test.


-- ===========================================================================
-- BLOCK 0 -- the migration landed, with four policies and the trigger
-- ===========================================================================
--
-- The policy count is the half that is easy to get wrong, in the opposite
-- direction from 037: THREE here means the UPDATE policy is missing, and the
-- feature will save once per spell and then start refusing.
--
-- CORRECT OUTPUT: two rows.
--   check 0a  table_exists = true, rls_enabled = true, ledger_row = true,
--             pin_trigger = true.
--   check 0b  policies holding exactly four entries -- SELECT, INSERT, UPDATE,
--             DELETE (cmd 'r', 'a', 'w', 'd'). Three is a bug here.

select 'check 0a: table, ledger and trigger' as check,
       jsonb_build_object(
         'table_exists', to_regclass('public.character_spell_descriptions') is not null,
         'rls_enabled',  (select relrowsecurity from pg_class
                          where oid = to_regclass('public.character_spell_descriptions')),
         'ledger_row',   exists (select 1 from public.schema_migrations
                                 where version = '046'),
         'pin_trigger',  exists (select 1 from pg_trigger
                                 where tgrelid = to_regclass('public.character_spell_descriptions')
                                   and tgname = 'pin_character_spell_description_row')
       ) as result
union all
select 'check 0b: policies',
       (select jsonb_agg(jsonb_build_object('name', polname, 'cmd', polcmd)
                         order by polname)
        from pg_policy
        where polrelid = to_regclass('public.character_spell_descriptions'));


-- ===========================================================================
-- BLOCK 1 -- the owner saves TWICE on the same spell
-- ===========================================================================
--
-- The block that matters. The first statement is an INSERT and the second is an
-- UPDATE, which is what the client's upsert actually does across two visits to
-- the same card, and it is the exact shape that shipped broken in 033, 042 and
-- 044. A first-run smoke test in the browser passes without it.
--
-- CORRECT OUTPUT: one row. rows = 1, stored_name = 'Nat''s own fire',
-- stored_description = 'the second telling', and updated_at_moved = true --
-- the trigger stamping the row rather than leaving the insert's default.
--
-- If the second statement raises 42501, the UPDATE policy is missing.

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
         set_config('verification.spell',
                    (select id::text from spells
                     where campaign_id is null order by name limit 1),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  -- First save: no row yet, so this is the INSERT half.
  insert into character_spell_descriptions
         (character_id, spell_id, custom_name, custom_description)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.spell')::uuid,
          'Nat''s own fire',
          'the first telling')
  on conflict (character_id, spell_id) do update
    set custom_name        = excluded.custom_name,
        custom_description = excluded.custom_description;

  select set_config('verification.first_stamp',
                    (select updated_at::text from character_spell_descriptions
                     where character_id = current_setting('verification.character')::uuid
                       and spell_id     = current_setting('verification.spell')::uuid),
                    true);

  -- Second save from the same button: the row exists now, so this is the UPDATE
  -- half, and the one that 42501s when the policy is missing.
  insert into character_spell_descriptions
         (character_id, spell_id, custom_name, custom_description)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.spell')::uuid,
          'Nat''s own fire',
          'the second telling')
  on conflict (character_id, spell_id) do update
    set custom_name        = excluded.custom_name,
        custom_description = excluded.custom_description;

  select 'case 1: the owner saves twice on one spell' as check,
         jsonb_build_object(
           'rows', (select count(*) from character_spell_descriptions
                    where character_id = current_setting('verification.character')::uuid),
           'stored_name', (select custom_name from character_spell_descriptions
                           where character_id = current_setting('verification.character')::uuid
                             and spell_id = current_setting('verification.spell')::uuid),
           'stored_description', (select custom_description from character_spell_descriptions
                                  where character_id = current_setting('verification.character')::uuid
                                    and spell_id = current_setting('verification.spell')::uuid),
           'updated_at_moved',
             (select updated_at > current_setting('verification.first_stamp')::timestamptz
              from character_spell_descriptions
              where character_id = current_setting('verification.character')::uuid
                and spell_id = current_setting('verification.spell')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 2 -- that campaign's DM writes on that same character
-- ===========================================================================
--
-- One of the two lines this feature draws. can_edit_character widens the write
-- to the DM without widening it to anyone else, and the DM reaching it depends
-- on is_campaign_dm inside a function running with invoker rights.
--
-- CORRECT OUTPUT: one row, rows = 1. A zero here is the DM locked out of a
-- sheet they are meant to be able to write flavour onto.

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
         set_config('verification.spell',
                    (select id::text from spells
                     where campaign_id is null order by name limit 1),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  insert into character_spell_descriptions
         (character_id, spell_id, custom_description)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.spell')::uuid,
          'the DM writes the curse in');

  select 'case 2: the campaign DM writes on a player''s sheet' as check,
         jsonb_build_object(
           'rows', (select count(*) from character_spell_descriptions
                    where character_id = current_setting('verification.character')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 3 -- another player in the same campaign writes -> denied
-- ===========================================================================
--
-- The other half of the line, and the direction that fails OPEN if
-- can_edit_character is ever loosened to bare membership. PeacefulCow is put
-- into campaign A as a plain player first, because the denial has to come from
-- "member but neither owner nor DM" -- as a non-member they would be stopped by
-- the outer half of the check and this would prove the weaker thing.
--
-- The insert is wrapped so the RLS denial is reported rather than aborting the
-- block: a bare 42501 would take the SELECT down with it and the block would
-- print nothing at all, which is a bad way to learn it passed.
--
-- CORRECT OUTPUT: one row. outcome = 'denied by RLS (42501)' and rows = 0.

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
         set_config('verification.spell',
                    (select id::text from spells
                     where campaign_id is null order by name limit 1),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"a52bba44-8278-47d3-8d91-5b47f1fe73cc","role":"authenticated"}',
           true
         );
  set local role authenticated;

  do $$
  begin
    insert into character_spell_descriptions
           (character_id, spell_id, custom_description)
    values (current_setting('verification.character')::uuid,
            current_setting('verification.spell')::uuid,
            'writing on someone else''s sheet');
    perform set_config('verification.outcome', 'INSERT SUCCEEDED -- LEAK', true);
  exception
    when insufficient_privilege then
      perform set_config('verification.outcome', 'denied by RLS (42501)', true);
  end
  $$;

  select 'case 3: a fellow campaign member writes on someone else''s sheet' as check,
         jsonb_build_object(
           'outcome', current_setting('verification.outcome'),
           'rows',    (select count(*) from character_spell_descriptions
                       where character_id = current_setting('verification.character')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 4 -- a signed-in non-member selects from the table -> zero rows
-- ===========================================================================
--
-- The read is deliberately unfiltered: the point is what an unscoped query
-- returns, which is what a missing .eq("character_id") in the client would do.
--
-- A row is written as the owner first, and that decoy is what gives the zero
-- any force -- against an empty table this check passes with no policy at all.
-- PeacefulCow is left OUT of campaign A here, which is the difference between
-- this block and block 3.
--
-- CORRECT OUTPUT: one row, both counts 0.

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
         set_config('verification.spell',
                    (select id::text from spells
                     where campaign_id is null order by name limit 1),
                    true);

  -- The decoy, written as the owner so RLS never sees it.
  insert into character_spell_descriptions
         (character_id, spell_id, custom_description)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.spell')::uuid,
          'visible only to the campaign');

  select set_config(
           'request.jwt.claims',
           '{"sub":"a52bba44-8278-47d3-8d91-5b47f1fe73cc","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select 'case 4: a signed-in non-member reads the table' as check,
         jsonb_build_object(
           'rows_visible_unfiltered',
             (select count(*) from character_spell_descriptions),
           'rows_visible_for_character',
             (select count(*) from character_spell_descriptions
              where character_id = current_setting('verification.character')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 5 -- a re-key attempt is pinned to a no-op, not an error
-- ===========================================================================
--
-- 044's check, pointed at both key columns. The DM is the caller because the DM
-- is the one whose can_edit_character passes on two different characters at
-- once, which is what makes the UPDATE policy alone insufficient.
--
-- CORRECT OUTPUT: one row. still_on_first_character = true and
-- still_on_first_spell = true. An ERROR here is also a failure -- the trigger
-- is meant to make a bad write a no-op, not to raise.

begin;

  insert into characters (campaign_id, user_id, name)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          '1313672b-6990-45a6-8a28-c448ca116d2d',
          'Verification Subject')
  on conflict (campaign_id, user_id) do nothing;

  -- A second character in the same campaign for the DM to aim at. The DM's own,
  -- because characters is unique on (campaign_id, user_id).
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
         set_config('verification.spell',
                    (select id::text from spells
                     where campaign_id is null order by name limit 1),
                    true),
         set_config('verification.other_spell',
                    (select id::text from spells
                     where campaign_id is null order by name desc limit 1),
                    true);

  insert into character_spell_descriptions
         (character_id, spell_id, custom_description)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.spell')::uuid,
          'stays where it was written');

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  update character_spell_descriptions
     set character_id = current_setting('verification.other_character')::uuid,
         spell_id     = current_setting('verification.other_spell')::uuid
   where character_id = current_setting('verification.character')::uuid
     and spell_id     = current_setting('verification.spell')::uuid;

  select 'case 5: a re-keying update is pinned' as check,
         jsonb_build_object(
           'still_on_first_character',
             exists (select 1 from character_spell_descriptions
                     where character_id = current_setting('verification.character')::uuid
                       and custom_description = 'stays where it was written'),
           'still_on_first_spell',
             exists (select 1 from character_spell_descriptions
                     where spell_id = current_setting('verification.spell')::uuid
                       and custom_description = 'stays where it was written'),
           'rows_on_decoy',
             (select count(*) from character_spell_descriptions
              where character_id = current_setting('verification.other_character')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 6 -- a row that overrides nothing is refused
-- ===========================================================================
--
-- The not_empty constraint. The client is supposed to turn an all-blank draft
-- into a DELETE before it gets here, so this is the backstop for the day it
-- forgets -- without it, a blank row and no row would be two ways to say the
-- same thing and the reader would have to know both.
--
-- Caught and reported rather than left to raise, so a pass does not read as a
-- broken migration in the SQL editor.
--
-- CORRECT OUTPUT: one row, outcome = 'refused by the check constraint'.

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
         set_config('verification.spell',
                    (select id::text from spells
                     where campaign_id is null order by name limit 1),
                    true);

  do $$
  begin
    insert into character_spell_descriptions (character_id, spell_id)
    values (current_setting('verification.character')::uuid,
            current_setting('verification.spell')::uuid);
    perform set_config('verification.outcome', 'EMPTY ROW STORED -- BUG', true);
  exception
    when check_violation then
      perform set_config('verification.outcome',
                         'refused by the check constraint', true);
  end
  $$;

  -- And the same for a name that is nothing but whitespace, which btrim is what
  -- catches.
  do $$
  begin
    insert into character_spell_descriptions
           (character_id, spell_id, custom_name)
    values (current_setting('verification.character')::uuid,
            current_setting('verification.spell')::uuid,
            '     ');
    perform set_config('verification.blank_outcome',
                       'BLANK NAME STORED -- BUG', true);
  exception
    when check_violation then
      perform set_config('verification.blank_outcome',
                         'refused by the check constraint', true);
  end
  $$;

  select 'case 6: a row overriding nothing' as check,
         jsonb_build_object(
           'both_null',      current_setting('verification.outcome'),
           'whitespace_name', current_setting('verification.blank_outcome'),
           'rows',           (select count(*) from character_spell_descriptions
                              where character_id = current_setting('verification.character')::uuid)
         ) as result;

rollback;


-- ---------------------------------------------------------------------------
-- Block 1 is the one to distrust, and block 3 the one that fails open. Block 1
-- is the whole reason this table has four policies instead of 037's three, and
-- in the browser its failure looks like "saving worked yesterday". Block 3 is
-- the line between "the DM may write on your sheet" and "anyone at the table
-- may", and both directions look identical from the client: text that doesn't
-- appear.
--
-- If the client gets a 404/PGRST202 reading this table after the migration runs,
-- that is the schema cache, not a missing grant -- `notify pgrst, 'reload schema';`.
-- A missing grant reads as 401/42501 instead.
--
-- Then regenerate the client types: npm run gen:types
-- ---------------------------------------------------------------------------

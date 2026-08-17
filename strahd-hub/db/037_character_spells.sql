-- db/037_character_spells.sql
--
-- Which spells a character has. The simpler twin of character_inventory: one
-- row per (character, spell) and nothing else -- no slots, no prepared/known
-- split, no per-day usage. The feature is "a place to see your spells".
--
-- Everything 028-032 grew around character_inventory is deliberately absent,
-- and each absence is a decision rather than an omission:
--
--   quantity   a spell is on the list or it is not, so there is no stack to
--              increment. 030's RPC exists only because PostgREST cannot say
--              "increment"; it says "insert if absent" perfectly well, so the
--              client upserts with on conflict do nothing and no function is
--              needed here. Nothing from 032 either -- there is no decrement.
--
--   added_by   029 stamps it on character_inventory because DM-granted loot and
--              player-bought loot are genuinely different things on a shared
--              sheet. Who typed a spell onto a list is not a fact anyone will
--              ask, so the column is left off rather than added and left null.
--
--   UPDATE     no policy, because there is no mutable column -- see below.
--
-- Writes need no new predicate: 028's can_edit_character is already exactly
-- "the owner OR this campaign's DM", which is the whole of this feature's
-- permission model.
--
-- One consequence of spell_id referencing spells with no campaign check of its
-- own: a spell from another campaign's homebrew could be attached here, and the
-- client's `*, spells(*)` embed would then read back null under 022's SELECT
-- policy. Unreachable today -- spells has no INSERT policy, so every row is
-- shared SRD with a null campaign_id -- and worth knowing before homebrew
-- spells land rather than after.
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

-- No campaign_id, on the argument 028 settles for character_inventory: the
-- campaign is one join away through character_id, and a second copy could only
-- ever disagree.
create table public.character_spells (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  spell_id     uuid not null references public.spells(id) on delete cascade,
  created_at   timestamptz not null default now(),

  -- A spell is on the list once. This is also the whole of the add's conflict
  -- handling: the client's upsert names these two columns and ignores
  -- duplicates, so adding the same spell twice is a no-op instead of an error.
  unique (character_id, spell_id)
);

-- No standalone index on character_id. The unique constraint above already
-- creates one that leads on it, and `where character_id = $1` is the only read
-- this table serves. 028 gave character_inventory its own index and 032 dropped
-- it again once 030's unique constraint made it redundant; this table is born
-- with the constraint, so it never needs the index in the first place.

alter table public.character_spells enable row level security;

-- Visibility is exactly "can you see the character": the subquery runs as the
-- invoker, so it answers through characters' own SELECT policy. Campaign
-- members pass, everyone else gets zero rows, and membership is enforced
-- without this policy mentioning it.
--
-- character_spells.character_id is written out rather than left bare, for 028's
-- reason: bare, it resolves to the outer relation only because characters has
-- no column of that name -- correct by accident, and silently wrong the day
-- characters gains one.
create policy "character viewers read spells"
  on public.character_spells for select to authenticated
  using (
    exists (
      select 1 from characters c
      where c.id = character_spells.character_id
    )
  );

create policy "owner or dm adds character spells"
  on public.character_spells for insert to authenticated
  with check (public.can_edit_character(character_id));

create policy "owner or dm removes character spells"
  on public.character_spells for delete to authenticated
  using (public.can_edit_character(character_id));

-- No UPDATE policy, and not by oversight. Every column is the primary key, half
-- of the unique key, or a defaulted timestamp -- there is nothing an update
-- could change that a delete-and-insert would not express better. A fourth
-- policy here would govern a write that cannot happen, and would have to be
-- read and re-reasoned about by everyone who came after.

insert into public.schema_migrations (version) values ('037');

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
-- set of a run, so pasting the whole section would show block 5 and silently
-- discard the four before it. Each block is complete on its own and ends in
-- exactly one SELECT followed by ROLLBACK. This also keeps the file portable:
-- there is no \set anywhere, so it behaves the same under psql.
--
-- The uuids are 033_npcs_verification.sql's, unchanged:
--
--   campaign A   d721b412-2750-492e-bddd-7387fc464bba   The cool kids
--   player of A  1313672b-6990-45a6-8a28-c448ca116d2d   Nat
--   DM of A      ea74d56b-8f45-4e4c-80f8-90a6d29b5adf   Dlizard72
--   DM of B      a52bba44-8278-47d3-8d91-5b47f1fe73cc   PeacefulCow  (not in A)
--
-- Each block builds its own fixture first, as the table owner, before switching
-- role -- owners bypass RLS, so the setup is never itself under test. The
-- character is created if Nat does not have one, so these blocks do not depend
-- on what happens to be in the database today. A block that tested nothing
-- because a row was missing would read exactly like a block that passed.
--
-- The two ids the checks need are captured into transaction-local settings
-- before the role switch, deliberately: after it, block 4's non-member cannot
-- see the character row at all, and a subquery that looked the id up there
-- would come back null and make `where character_id = null` return zero rows
-- for the wrong reason.
--
-- set_config(key, value, true) is SET LOCAL spelled as a function call, so it
-- can take a subquery as its argument and so it can sit in a SELECT list. Being
-- transaction-local it is undone by the ROLLBACK along with everything else.


-- ===========================================================================
-- BLOCK 0 -- the migration landed, and it landed with three policies
-- ===========================================================================
--
-- Worth a glance before trusting anything below. The policy count is the half
-- that is easy to get wrong: four means an UPDATE policy crept in for symmetry
-- with 028, which is the one thing this migration is explicit about not having.
--
-- CORRECT OUTPUT: two rows.
--   check 0a  table_exists = true, ledger_row = true.
--   check 0b  policies holding exactly three entries -- SELECT, INSERT, DELETE
--             (cmd 'r', 'a', 'd'). Any UPDATE ('w') entry is a bug.

select 'check 0a: table and ledger' as check,
       jsonb_build_object(
         'table_exists', to_regclass('public.character_spells') is not null,
         'rls_enabled',  (select relrowsecurity from pg_class
                          where oid = to_regclass('public.character_spells')),
         'ledger_row',   exists (select 1 from public.schema_migrations
                                 where version = '037')
       ) as result
union all
select 'check 0b: policies',
       (select jsonb_agg(jsonb_build_object('name', polname, 'cmd', polcmd)
                         order by polname)
        from pg_policy
        where polrelid = to_regclass('public.character_spells'));


-- ===========================================================================
-- BLOCK 1 -- the owner adds a spell to their own character
-- ===========================================================================
--
-- The baseline. If this fails, nothing below means anything -- a denial is
-- indistinguishable from a policy that denies everyone.
--
-- CORRECT OUTPUT: one row. rows_for_character = 1, and readable_by_owner = 1,
-- which is the SELECT policy agreeing that the row it just let in is visible.

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

  insert into character_spells (character_id, spell_id)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.spell')::uuid);

  select 'case 1: owner adds to their own character' as check,
         jsonb_build_object(
           'rows_for_character',
             (select count(*) from character_spells
              where character_id = current_setting('verification.character')::uuid),
           'readable_by_owner',
             (select count(*) from character_spells)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 2 -- that campaign's DM adds a spell to that same character
-- ===========================================================================
--
-- One of the two cases this feature exists to draw. can_edit_character widens
-- the write to the DM without widening it to anyone else, and the DM reaching
-- it depends on is_campaign_dm inside a function running with invoker rights --
-- three moving parts, one observable outcome.
--
-- Note what is NOT being tested: the DM cannot rename this character, because
-- 028's UPDATE policy on characters is owner-only. That line is 028's to hold
-- and it already has a case for it.
--
-- CORRECT OUTPUT: one row, rows_for_character = 1. A zero here is the DM being
-- locked out of a sheet they are supposed to be able to equip.

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

  insert into character_spells (character_id, spell_id)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.spell')::uuid);

  select 'case 2: the campaign DM adds to a player''s character' as check,
         jsonb_build_object(
           'rows_for_character',
             (select count(*) from character_spells
              where character_id = current_setting('verification.character')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 3 -- another player in the same campaign adds to it -> denied
-- ===========================================================================
--
-- The other half of the line, and the direction that fails OPEN if
-- can_edit_character is ever loosened to bare membership. PeacefulCow is put
-- into campaign A as a plain player first, because the denial has to come from
-- "member but neither owner nor DM" -- as a non-member they would be stopped by
-- the outer half of the check and this would prove the weaker thing.
--
-- The insert is wrapped so the RLS denial is reported rather than aborting the
-- block: a 42501 would otherwise take the SELECT down with it and the block
-- would print nothing at all, which is a bad way to learn it passed.
--
-- CORRECT OUTPUT: one row. outcome = 'denied by RLS (42501)' and
-- rows_for_character = 0. Any other outcome is one player writing to another
-- player's sheet.

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
    insert into character_spells (character_id, spell_id)
    values (current_setting('verification.character')::uuid,
            current_setting('verification.spell')::uuid);
    perform set_config('verification.outcome', 'INSERT SUCCEEDED -- LEAK', true);
  exception
    when insufficient_privilege then
      perform set_config('verification.outcome', 'denied by RLS (42501)', true);
  end
  $$;

  select 'case 3: a fellow campaign member adds to someone else''s character' as check,
         jsonb_build_object(
           'outcome',            current_setting('verification.outcome'),
           'rows_for_character',
             (select count(*) from character_spells
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
-- CORRECT OUTPUT: one row, both counts 0. Note rows_seeded is read before the
-- role switch and is not in this result; if you want to see it, run block 1
-- first -- a zero here means nothing if nothing was written.

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
  insert into character_spells (character_id, spell_id)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.spell')::uuid);

  select set_config(
           'request.jwt.claims',
           '{"sub":"a52bba44-8278-47d3-8d91-5b47f1fe73cc","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select 'case 4: a signed-in non-member reads the table' as check,
         jsonb_build_object(
           'rows_visible_unfiltered',
             (select count(*) from character_spells),
           'rows_visible_for_character',
             (select count(*) from character_spells
              where character_id = current_setting('verification.character')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 5 -- the same (character, spell) twice -> silent no-op
-- ===========================================================================
--
-- What the client's upsert actually sends. supabase-js renders
-- { onConflict: "character_id,spell_id", ignoreDuplicates: true } as the
-- ON CONFLICT DO NOTHING below, and the losing insert comes back with no row --
-- which the service must not treat as a failure. This block is the SQL half of
-- that contract.
--
-- CORRECT OUTPUT: one row, rows_for_character = 1 and second_insert_returned =
-- 0. The block completing at all is most of the result: an error here means the
-- unique constraint is being hit bare somewhere the client cannot see.

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

  insert into character_spells (character_id, spell_id)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.spell')::uuid)
  on conflict (character_id, spell_id) do nothing;

  with second as (
    insert into character_spells (character_id, spell_id)
    values (current_setting('verification.character')::uuid,
            current_setting('verification.spell')::uuid)
    on conflict (character_id, spell_id) do nothing
    returning id
  )
  select 'case 5: the same spell added twice' as check,
         jsonb_build_object(
           'second_insert_returned', (select count(*) from second),
           'rows_for_character',
             (select count(*) from character_spells
              where character_id = current_setting('verification.character')::uuid)
         ) as result;

rollback;


-- ---------------------------------------------------------------------------
-- Blocks 2 and 3 are the ones to distrust. They are the line this feature
-- exists to draw -- the DM may write to a player's list, another player may not
-- -- and in the browser both failure directions look identical: a row that
-- doesn't appear. Neither one shows up as a wrong answer, only as a missing
-- one.
--
-- If the client gets a 404/PGRST202 reading character_spells after this runs,
-- that is the schema cache, not a missing grant -- `notify pgrst, 'reload schema';`.
-- A missing grant reads as 401/42501 instead.
--
-- Then regenerate the client types: npm run gen:types
-- ---------------------------------------------------------------------------

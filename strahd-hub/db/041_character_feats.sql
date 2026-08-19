-- db/041_character_feats.sql
--
-- Which feats a character has taken. 037's character_spells table with `spell`
-- replaced by `feat` throughout, and for the same reasons -- one row per
-- (character, feat) and nothing else.
--
-- Every absence 037 argued for holds here too:
--
--   quantity   a feat is on the sheet or it is not. 030's RPC exists only
--              because PostgREST cannot say "increment"; it says "insert if
--              absent" perfectly well, so the client upserts with on conflict
--              do nothing and no function is needed. Nothing from 032 either.
--
--   added_by   029 stamps it on character_inventory because DM-granted loot and
--              player-bought loot are genuinely different things on a shared
--              sheet. Who typed a feat onto a list is not a fact anyone will
--              ask, so the column is left off rather than added and left null.
--
--   UPDATE     no policy, because there is no mutable column -- every one is
--              the primary key, half the unique key, or a defaulted timestamp.
--
--   campaign_id  one join away through character_id, and a second copy could
--              only ever disagree.
--
-- Writes need no new predicate: 028's can_edit_character is already exactly
-- "the owner OR this campaign's DM".
--
-- ONE REAL DIFFERENCE FROM 037, and it is not cosmetic. 037 noted that
-- spell_id has no campaign check of its own, so a spell from another campaign's
-- homebrew could be attached and would then read back null through the client's
-- `*, spells(*)` embed -- and dismissed it as unreachable, because 022 shipped
-- no INSERT policy and every spells row is therefore shared SRD.
--
-- 039 DOES ship an INSERT policy. So the equivalent hole here is reachable: a
-- DM who is a member of two campaigns can create a homebrew feat in campaign B
-- and, with a hand-made request, attach it to a character in campaign A, where
-- nobody else can read it. BLOCK 6 below demonstrates it rather than asserting
-- it away.
--
-- It is left open on purpose. Closing it means either a composite foreign key
-- (which feats cannot have -- shared rows have a null campaign_id and would
-- match nothing) or a trigger that re-derives the character's campaign on every
-- insert, and the exposure is one DM mislabelling their own table. The client
-- never offers it: the picker is fed by getFeats(campaignId), which is already
-- scoped to shared-plus-this-campaign.
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

create table public.character_feats (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  feat_id      uuid not null references public.feats(id) on delete cascade,
  created_at   timestamptz not null default now(),

  -- A feat is on the sheet once. This is also the whole of the add's conflict
  -- handling: the client's upsert names these two columns and ignores
  -- duplicates, so adding the same feat twice is a no-op instead of an error.
  --
  -- It is also what makes feats.repeatable informational rather than real.
  -- Elemental Adept says you may take it again; this constraint says the app
  -- can record it once. Recording "taken three times" means a times_taken
  -- column and 030's insert-or-increment apparatus, for two feats out of
  -- forty-two -- so the flag stays a note to the reader.
  unique (character_id, feat_id)
);

-- No standalone index on character_id: the unique constraint above already
-- creates one that leads on it, and `where character_id = $1` is the only read
-- this table serves. Same reasoning 037 gave, and 032's cleanup before it.

alter table public.character_feats enable row level security;

-- Visibility is exactly "can you see the character": the subquery runs as the
-- invoker, so it answers through characters' own SELECT policy. Campaign
-- members pass, everyone else gets zero rows, and membership is enforced
-- without this policy mentioning it.
--
-- character_feats.character_id is written out rather than left bare, for 028's
-- reason: bare, it resolves to the outer relation only because characters has
-- no column of that name -- correct by accident, and silently wrong the day
-- characters gains one.
create policy "character viewers read feats"
  on public.character_feats for select to authenticated
  using (
    exists (
      select 1 from characters c
      where c.id = character_feats.character_id
    )
  );

create policy "owner or dm adds character feats"
  on public.character_feats for insert to authenticated
  with check (public.can_edit_character(character_id));

create policy "owner or dm removes character feats"
  on public.character_feats for delete to authenticated
  using (public.can_edit_character(character_id));

-- No UPDATE policy, and not by oversight -- see the header. A fourth policy
-- here would govern a write that cannot happen.

insert into public.schema_migrations (version) values ('041');

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
-- set of a run, so pasting the whole section would show block 6 and silently
-- discard the six before it. Each block is complete on its own and ends in
-- exactly one SELECT followed by ROLLBACK. There is no \set anywhere, so it
-- behaves the same under psql.
--
-- The uuids are 037's, unchanged:
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


-- ===========================================================================
-- BLOCK 0 -- the migration landed, and it landed with three policies
-- ===========================================================================
--
-- The policy count is the half that is easy to get wrong: four means an UPDATE
-- policy crept in for symmetry with 028, which is the one thing this migration
-- is explicit about not having.
--
-- CORRECT OUTPUT: two rows.
--   check 0a  table_exists, rls_enabled, ledger_row all true.
--   check 0b  policies holding exactly three entries -- SELECT, INSERT, DELETE
--             (cmd 'r', 'a', 'd'). Any UPDATE ('w') entry is a bug.

select 'check 0a: table and ledger' as check,
       jsonb_build_object(
         'table_exists', to_regclass('public.character_feats') is not null,
         'rls_enabled',  (select relrowsecurity from pg_class
                          where oid = to_regclass('public.character_feats')),
         'ledger_row',   exists (select 1 from public.schema_migrations
                                 where version = '041')
       ) as result
union all
select 'check 0b: policies',
       (select jsonb_agg(jsonb_build_object('name', polname, 'cmd', polcmd)
                         order by polname)
        from pg_policy
        where polrelid = to_regclass('public.character_feats'));


-- ===========================================================================
-- BLOCK 1 -- the owner adds a feat to their own character
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
         set_config('verification.feat',
                    (select id::text from feats
                     where campaign_id is null order by name limit 1),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  insert into character_feats (character_id, feat_id)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.feat')::uuid);

  select 'case 1: owner adds to their own character' as check,
         jsonb_build_object(
           'rows_for_character',
             (select count(*) from character_feats
              where character_id = current_setting('verification.character')::uuid),
           'readable_by_owner',
             (select count(*) from character_feats)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 2 -- that campaign's DM adds a feat to that same character
-- ===========================================================================
--
-- One of the two cases this feature exists to draw. can_edit_character widens
-- the write to the DM without widening it to anyone else, and the DM reaching
-- it depends on is_campaign_dm inside a function running with invoker rights --
-- three moving parts, one observable outcome.
--
-- CORRECT OUTPUT: one row, rows_for_character = 1. A zero here is the DM being
-- locked out of a sheet they are supposed to be able to write to.

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
         set_config('verification.feat',
                    (select id::text from feats
                     where campaign_id is null order by name limit 1),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  insert into character_feats (character_id, feat_id)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.feat')::uuid);

  select 'case 2: the campaign DM adds to a player''s character' as check,
         jsonb_build_object(
           'rows_for_character',
             (select count(*) from character_feats
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
-- rows_for_character = 0.

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
         set_config('verification.feat',
                    (select id::text from feats
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
    insert into character_feats (character_id, feat_id)
    values (current_setting('verification.character')::uuid,
            current_setting('verification.feat')::uuid);
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
             (select count(*) from character_feats
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
         set_config('verification.feat',
                    (select id::text from feats
                     where campaign_id is null order by name limit 1),
                    true);

  -- The decoy, written as the owner so RLS never sees it.
  insert into character_feats (character_id, feat_id)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.feat')::uuid);

  select set_config(
           'request.jwt.claims',
           '{"sub":"a52bba44-8278-47d3-8d91-5b47f1fe73cc","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select 'case 4: a signed-in non-member reads the table' as check,
         jsonb_build_object(
           'rows_visible_unfiltered',
             (select count(*) from character_feats),
           'rows_visible_for_character',
             (select count(*) from character_feats
              where character_id = current_setting('verification.character')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 5 -- the same (character, feat) twice -> silent no-op
-- ===========================================================================
--
-- What the client's upsert actually sends. supabase-js renders
-- { onConflict: "character_id,feat_id", ignoreDuplicates: true } as the
-- ON CONFLICT DO NOTHING below, and the losing insert comes back with no row --
-- which the service must not treat as a failure.
--
-- This is also the case a repeatable feat runs into. Taking Elemental Adept a
-- second time is indistinguishable here from taking it twice by accident, and
-- both come out as one row.
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
         set_config('verification.feat',
                    (select id::text from feats
                     where campaign_id is null order by name limit 1),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  insert into character_feats (character_id, feat_id)
  values (current_setting('verification.character')::uuid,
          current_setting('verification.feat')::uuid)
  on conflict (character_id, feat_id) do nothing;

  with second as (
    insert into character_feats (character_id, feat_id)
    values (current_setting('verification.character')::uuid,
            current_setting('verification.feat')::uuid)
    on conflict (character_id, feat_id) do nothing
    returning id
  )
  select 'case 5: the same feat added twice' as check,
         jsonb_build_object(
           'second_insert_returned', (select count(*) from second),
           'rows_for_character',
             (select count(*) from character_feats
              where character_id = current_setting('verification.character')::uuid)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 6 -- the cross-campaign hole, demonstrated rather than asserted away
-- ===========================================================================
--
-- The header's one real difference from 037. A homebrew feat belonging to
-- campaign B is attached to a character in campaign A by that character's own
-- owner -- feat_id has no campaign check, so the insert is allowed. The row is
-- then read back the way the client reads it, with the feat embedded.
--
-- CORRECT OUTPUT: one row, and it is the CURRENT behaviour, not a pass:
--   outcome        = 'attached -- the hole is open'
--   feat_readable  = 0   (039's SELECT policy hides the feat itself)
--
-- That combination is exactly the shape the client cannot render: a
-- character_feats row whose embedded feats object comes back null, against a
-- CharacterFeatRow type that declares it non-null. If you ever close this hole,
-- this block starts reporting 'refused -- the hole has been closed', which is
-- the result to want.
--
-- The feat id is captured into a setting BEFORE the role switch, and that is
-- load-bearing rather than stylistic: after it, Nat cannot see the row at all,
-- so a subquery looking it up there would come back null and the block would
-- test nothing while appearing to pass.
--
-- If this database has only one campaign there is nothing to borrow from, and
-- the block says so rather than failing on an empty uuid cast.

begin;

  insert into characters (campaign_id, user_id, name)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          '1313672b-6990-45a6-8a28-c448ca116d2d',
          'Verification Subject')
  on conflict (campaign_id, user_id) do nothing;

  -- A homebrew feat in some campaign that is NOT campaign A. Written as the
  -- owner, because the point under test is the attach, not the authoring.
  insert into feats (campaign_id, name, category, description)
  select id, 'Cross-Campaign Test Feat', 'general', 'Belongs to another campaign.'
    from campaigns
   where id <> 'd721b412-2750-492e-bddd-7387fc464bba'
   limit 1;

  -- coalesce to '' rather than letting the setting go null: current_setting on
  -- an unset key raises, and an empty string is a value the block below can
  -- test for and report on.
  select set_config('verification.character',
                    (select id::text from characters
                     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                       and user_id     = '1313672b-6990-45a6-8a28-c448ca116d2d'),
                    true),
         set_config('verification.feat',
                    coalesce((select id::text from feats
                              where name = 'Cross-Campaign Test Feat'), ''),
                    true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  do $$
  declare
    target_feat text := current_setting('verification.feat');
  begin
    if target_feat = '' then
      perform set_config('verification.outcome',
                         'SKIPPED -- only one campaign exists to borrow from', true);
      return;
    end if;

    insert into character_feats (character_id, feat_id)
    values (current_setting('verification.character')::uuid, target_feat::uuid);
    perform set_config('verification.outcome', 'attached -- the hole is open', true);
  exception
    when insufficient_privilege or foreign_key_violation or raise_exception then
      perform set_config('verification.outcome',
                         'refused -- the hole has been closed', true);
  end
  $$;

  select 'case 6: a feat from another campaign attached to this character' as check,
         jsonb_build_object(
           'outcome', current_setting('verification.outcome'),
           'rows_for_character',
             (select count(*) from character_feats
              where character_id = current_setting('verification.character')::uuid),
           'feat_readable',
             (select count(*) from feats where name = 'Cross-Campaign Test Feat')
         ) as result;

rollback;


-- ---------------------------------------------------------------------------
-- Blocks 2 and 3 are the ones to distrust. They are the line this feature
-- exists to draw -- the DM may write to a player's sheet, another player may
-- not -- and in the browser both failure directions look identical: a row that
-- doesn't appear. Neither one shows up as a wrong answer, only as a missing
-- one.
--
-- If the client gets a 404/PGRST202 reading character_feats after this runs,
-- that is the schema cache, not a missing grant -- `notify pgrst, 'reload schema';`.
-- A missing grant reads as 401/42501 instead.
--
-- Then regenerate the client types: npm run gen:types
-- ---------------------------------------------------------------------------

-- db/039_feats.sql
--
-- The feats catalogue. Structurally 022's spells table with a different set of
-- columns: a nullable campaign_id where null means the shared 2014 PHB list
-- every campaign can read and a non-null value marks one campaign's homebrew,
-- one SELECT policy over is_campaign_member, one index on campaign_id.
--
-- Where it differs from 022, and why:
--
--   category    the axis that level is for spells. A spell's level orders the
--               grimoire, groups the picker and drives the filter row; feats
--               have no such number, so a category takes the job. The six
--               values are ours -- the 2014 PHB does not categorise feats at
--               all -- which is exactly why they live in a check constraint
--               rather than a lookup table: the set is small, closed, and
--               changing it should be a migration someone has to write.
--
--   benefits    text[], because a feat prints as a lead paragraph and then a
--               list of bullets. One prose blob would render as a wall; the
--               array lets the detail card put them in a <ul>. Defaulted to
--               '{}' rather than nullable: a feat with no bullets has an empty
--               list, not an absent one, and the client never has to branch on
--               null before iterating.
--
--   prerequisite  nullable, and DISPLAY ONLY. Nothing in this database can
--               enforce "Strength 13 or higher" -- 028's characters table
--               stores a name and nothing else, no level, no class, no ability
--               scores. Null means "open to anyone" and the UI drops the row
--               instead of printing "Prerequisite: none".
--
--   repeatable  informational, for the same reason. 041's
--               unique (character_id, feat_id) caps every feat at one per
--               sheet, so this flag tells a reader that Elemental Adept may be
--               taken again without the app being able to record it. Making it
--               real means a times_taken column and 030's whole
--               insert-or-increment apparatus, for two feats out of forty-two.
--
-- Unlike 022, this ships an INSERT policy in the same migration rather than
-- waiting for a 025 to retrofit one: DM homebrew is part of the feature this
-- time, so there is no window where the table is read-only by accident.
--
-- No UPDATE or DELETE policy, matching items. A homebrew feat that needs
-- fixing is deleted and re-made in the SQL editor for now.
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

create table public.feats (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,

  name text not null,
  category text not null check (category in (
    'combat', 'defense', 'magic', 'skill', 'social', 'general'
  )),

  prerequisite text,

  description text not null,
  benefits text[] not null default '{}',
  repeatable boolean not null default false,
  tags text[] not null default '{}',

  created_at timestamptz not null default now()
);

-- 022's index, for 022's read: every query against this table is
-- `campaign_id is null or campaign_id = $1`.
create index on public.feats (campaign_id);

alter table public.feats enable row level security;

create policy "read shared and own-campaign feats"
  on public.feats for select to authenticated
  using (
    campaign_id is null
    or public.is_campaign_member(campaign_id)
  );

-- 025's policy, verbatim in shape. `campaign_id is not null` stops any client
-- path from writing a new SHARED catalogue row -- only 040 does that, and only
-- because it runs as the table owner outside RLS.
create policy "dms create homebrew feats"
  on public.feats for insert to authenticated
  with check (
    campaign_id is not null
    and public.is_campaign_dm(campaign_id)
  );

insert into public.schema_migrations (version) values ('039');

commit;


-- ===========================================================================
-- VERIFICATION -- run before touching client code
-- ===========================================================================
--
-- Each block below is independent. Run them one at a time. Blocks that write
-- end in `rollback`, so nothing here survives.
--
-- Three of these blocks test that something is REFUSED, and each one catches
-- the refusal and reports it as a row rather than letting it abort -- 037's
-- BLOCK 3 pattern. The alternative, a block whose documented pass condition is
-- "ERROR", is genuinely worse than it looks: the SQL editor paints it red and
-- stops, so a passing check is indistinguishable at a glance from a broken
-- migration, and running the file top to bottom halts on the first success.
--
-- The uuids are 037's, unchanged, so a block cannot quietly test nothing by
-- picking a `limit 1` row that does not exist:
--
--   campaign A   d721b412-2750-492e-bddd-7387fc464bba   The cool kids
--   player of A  1313672b-6990-45a6-8a28-c448ca116d2d   Nat
--   DM of A      ea74d56b-8f45-4e4c-80f8-90a6d29b5adf   Dlizard72


-- ---------------------------------------------------------------------------
-- BLOCK 0: the objects exist and are shaped as intended
-- ---------------------------------------------------------------------------
--
-- CORRECT OUTPUT: one row, every column `t`.

select
  (select count(*) = 1
     from pg_tables
    where schemaname = 'public' and tablename = 'feats')            as table_exists,
  (select relrowsecurity
     from pg_class
    where oid = 'public.feats'::regclass)                           as rls_enabled,
  (select count(*) = 2
     from pg_policies
    where schemaname = 'public' and tablename = 'feats')            as two_policies,
  (select count(*) = 1
     from pg_indexes
    where schemaname = 'public' and tablename = 'feats'
      and indexdef like '%(campaign_id)%')                          as campaign_index,
  (select count(*) = 1
     from public.schema_migrations
    where version = '039')                                          as ledger_row;


-- ---------------------------------------------------------------------------
-- BLOCK 1: the category check rejects a value outside the six
-- ---------------------------------------------------------------------------
--
-- 'martial' is the plausible wrong answer rather than a nonsense string: it is
-- a real word from items' weapon_category, and the kind of value that would
-- reach this column from a copy-pasted insert.
--
-- CORRECT OUTPUT: one row, outcome = 'rejected by the check (23514)'.
--                 'INSERT SUCCEEDED -- CONSTRAINT MISSING' means the check
--                 never landed.

begin;

do $$
begin
  insert into public.feats (name, category, description)
  values ('Bad Category', 'martial', 'Should not exist.');
  perform set_config('verification.outcome', 'INSERT SUCCEEDED -- CONSTRAINT MISSING', true);
exception
  when check_violation then
    perform set_config('verification.outcome', 'rejected by the check (23514)', true);
end
$$;

select 'case 1: a category outside the six' as check,
       jsonb_build_object(
         'outcome',   current_setting('verification.outcome'),
         'rows_left', (select count(*) from public.feats where name = 'Bad Category')
       ) as result;

rollback;


-- ---------------------------------------------------------------------------
-- BLOCK 2: not even a DM can write a shared catalogue row
-- ---------------------------------------------------------------------------
--
-- The `campaign_id is not null` half of the INSERT policy, and the one that
-- protects the shared catalogue. The caller here is campaign A's DM -- the most
-- privileged person in the app -- so a refusal cannot be explained away as "not
-- a DM"; it is the null campaign_id being refused and nothing else.
--
-- CORRECT OUTPUT: one row, outcome = 'denied by RLS (42501)'.

begin;

select set_config(
  'request.jwt.claims',
  '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  insert into public.feats (campaign_id, name, category, description)
  values (null, 'Sneaky Shared Feat', 'general', 'Should be refused.');
  perform set_config('verification.outcome', 'INSERT SUCCEEDED -- LEAK', true);
exception
  when insufficient_privilege then
    perform set_config('verification.outcome', 'denied by RLS (42501)', true);
end
$$;

select 'case 2: a DM writing into the shared catalogue' as check,
       jsonb_build_object(
         'outcome',   current_setting('verification.outcome'),
         'rows_left', (select count(*) from public.feats where name = 'Sneaky Shared Feat')
       ) as result;

rollback;


-- ---------------------------------------------------------------------------
-- BLOCK 3: a campaign's DM can write homebrew into their own campaign
-- ---------------------------------------------------------------------------
--
-- The baseline for the INSERT policy: if this fails, blocks 2 and 4 prove
-- nothing, because a policy that denies everyone passes both of them.
--
-- CORRECT OUTPUT: one row, rows_written = 1 and readable_by_author = 1 -- the
--                 SELECT policy agreeing that the row it just let in is visible.

begin;

select set_config(
  'request.jwt.claims',
  '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.feats (campaign_id, name, category, description)
values ('d721b412-2750-492e-bddd-7387fc464bba',
        'Barovian Resolve', 'general', 'A homebrew test feat.');

select 'case 3: the campaign DM writes their own homebrew' as check,
       jsonb_build_object(
         'rows_written',
           (select count(*) from public.feats
            where name = 'Barovian Resolve'
              and campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'),
         'readable_by_author',
           (select count(*) from public.feats where name = 'Barovian Resolve')
       ) as result;

rollback;


-- ---------------------------------------------------------------------------
-- BLOCK 4: a player cannot write homebrew into their own campaign
-- ---------------------------------------------------------------------------
--
-- The direction that fails OPEN if the policy is ever loosened to bare
-- membership. Nat is a player in campaign A and is writing into campaign A --
-- so the denial has to come from is_campaign_dm, not from the outer
-- `campaign_id is not null`, which she satisfies.
--
-- CORRECT OUTPUT: one row, outcome = 'denied by RLS (42501)'.
--                 'INSERT SUCCEEDED -- LEAK' is any player authoring content
--                 into their DM's catalogue.

begin;

select set_config(
  'request.jwt.claims',
  '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  insert into public.feats (campaign_id, name, category, description)
  values ('d721b412-2750-492e-bddd-7387fc464bba',
          'Player Homebrew', 'general', 'Should be refused.');
  perform set_config('verification.outcome', 'INSERT SUCCEEDED -- LEAK', true);
exception
  when insufficient_privilege then
    perform set_config('verification.outcome', 'denied by RLS (42501)', true);
end
$$;

select 'case 4: a player writing homebrew into their own campaign' as check,
       jsonb_build_object(
         'outcome',   current_setting('verification.outcome'),
         'rows_left', (select count(*) from public.feats where name = 'Player Homebrew')
       ) as result;

rollback;


-- ---------------------------------------------------------------------------
-- Then, once 040 has run:
--
--   notify pgrst, 'reload schema';
--
-- and regenerate the client types:
--
--   npm run gen:types
--
-- A 404/PGRST202 from the client afterwards is the PostgREST schema cache (the
-- notify above); a 401/42501 is a policy.
-- ---------------------------------------------------------------------------

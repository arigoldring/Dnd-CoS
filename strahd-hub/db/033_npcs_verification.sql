-- Verification for 033_npcs.sql. Not a migration -- nothing here is meant to be
-- kept. Every block runs in its own explicit transaction and ends in ROLLBACK,
-- so this can be run against the live database as many times as you like.
--
-- WRITTEN FOR THE SUPABASE SQL EDITOR, which shapes it in two ways:
--
--   Run ONE BLOCK AT A TIME. The editor renders only the last result set of a
--   run, so pasting the whole file would show block 9 and silently discard the
--   nine before it. Each block below is separated by a ==== rule, is complete
--   on its own, and ends in exactly one SELECT followed by ROLLBACK.
--
--   The uuids are written out in full rather than set once at the top. psql's
--   \set is a client-side meta-command and the editor has no equivalent, so
--   there is nowhere to put a variable that survives to the next block anyway.
--   They are listed here for reference; block 0 reads them back out of
--   campaign_members so a wrong one shows up as a missing row.
--
--     campaign A  d721b412-2750-492e-bddd-7387fc464bba   The cool kids
--     campaign B  02534abd-e812-4e8b-a735-238ed10a1067   CBT
--     player of A 1313672b-6990-45a6-8a28-c448ca116d2d   Nat
--     DM of A     ea74d56b-8f45-4e4c-80f8-90a6d29b5adf   Dlizard72
--     DM of B     a52bba44-8278-47d3-8d91-5b47f1fe73cc   PeacefulCow
--
-- Each block prints labelled rows, and the comment above it says what the
-- correct output is -- read the two together and you never have to hold the
-- whole file in your head.
--
-- set_config(key, value, true) is SET LOCAL spelled as a function call. It is
-- what makes auth.uid() answer as somebody else, and being transaction-local it
-- is undone by the ROLLBACK along with everything the block wrote.


-- ===========================================================================
-- BLOCK 0 -- who the uuids above actually are, and whether the server is new
--            enough for the migration to have applied
-- ===========================================================================
--
-- Worth a glance before trusting anything below: a uuid that is not in
-- campaign_members reads zero rows everywhere, and that looks exactly like RLS
-- working.
--
-- CORRECT OUTPUT: two rows. `identities` holding three entries -- Nat as
-- 'player' in campaign A, Dlizard72 as 'dm' in campaign A, PeacefulCow as 'dm'
-- in campaign B. A missing entry means whichever block uses that uuid is testing
-- nothing. `server version` with version_ok = true; the composite FK uses the
-- column-list form of ON DELETE SET NULL, which arrived in PostgreSQL 15, so a
-- false here means 033 did not apply at all.

select 'check 0a: identities' as check,
       jsonb_agg(
         jsonb_build_object('campaign', m.campaign_id, 'user', m.user_id, 'role', m.role)
         order by m.campaign_id, m.role
       ) as result
from campaign_members m
where (m.campaign_id, m.user_id) in (
        ('d721b412-2750-492e-bddd-7387fc464bba'::uuid, '1313672b-6990-45a6-8a28-c448ca116d2d'::uuid),
        ('d721b412-2750-492e-bddd-7387fc464bba'::uuid, 'ea74d56b-8f45-4e4c-80f8-90a6d29b5adf'::uuid),
        ('02534abd-e812-4e8b-a735-238ed10a1067'::uuid, 'a52bba44-8278-47d3-8d91-5b47f1fe73cc'::uuid)
      )
union all
select 'check 0b: server version',
       jsonb_build_object(
         'server_version', current_setting('server_version'),
         'version_ok',     current_setting('server_version_num')::int >= 150000
       );


-- ===========================================================================
-- BLOCK 1 -- the player: revealed NPCs only, and no DM notes at all
-- ===========================================================================
--
-- Check 3 is the gate that fails OPEN if the exists join is written backwards,
-- so it is tested against a note that really exists rather than against an empty
-- table. The note goes in as the table owner first (owners bypass RLS), and only
-- then does the role switch. Without that insert the check would pass on a
-- database where the join is broken.
--
-- It is attached to a REVEALED NPC on purpose: that is the case where the player
-- passes the outer half of the join and only the inner is_campaign_dm stops
-- them. A note on a hidden NPC would be blocked by the outer half and prove the
-- weaker thing.
--
-- CORRECT OUTPUT: two rows.
--   check 1  npcs_visible = 1 (Strahd; Rahadin is hidden), unrevealed_leaked = 0.
--            npcs_visible = 0 would mean Nat is not really a member, not that
--            the policy is strict.
--   check 3  both counts 0. Any non-zero is the whole feature leaking -- stop
--            and fix the policy before reading further.

begin;

  insert into npc_dm_notes (npc_id, notes)
  select id, 'verification note -- rolled back'
  from npcs
  where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba' and is_revealed
  order by name
  limit 1
  on conflict (npc_id) do update set notes = excluded.notes;

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select 'check 1: player sees revealed only' as check,
         jsonb_build_object(
           'npcs_visible',
             (select count(*) from npcs
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'),
           'unrevealed_leaked',
             (select count(*) from npcs
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                and not is_revealed)
         ) as result
  union all
  select 'check 3: player reads no DM notes',
         jsonb_build_object(
           'notes_total_visible',
             (select count(*) from npc_dm_notes),
           'notes_for_visible_npcs',
             (select count(*) from npc_dm_notes
              where npc_id in (select id from npcs
                               where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                                 and is_revealed))
         );

rollback;


-- ===========================================================================
-- BLOCK 2 -- campaign A's DM sees all of A and none of anyone else's
-- ===========================================================================
--
-- The read is deliberately unfiltered by campaign: the point is what an unscoped
-- query returns, which is what a missing .eq("campaign_id") in the client would
-- do.
--
-- The decoy is what gives the "none of B" half any force. NPCs are seeded into
-- one campaign, so without a row in campaign B that count could not come back
-- anything but zero, and the check would pass against a policy with no campaign
-- scoping whatsoever. Written as the owner, and revealed -- the most visible
-- kind of row there is -- then rolled back.
--
-- CORRECT OUTPUT: one row. other_campaigns = 0, in_campaign_a = 2 (both seeded
-- NPCs, hidden ones included), unrevealed_visible = 1. That last field is what
-- proves the DM branch is returning hidden rows, rather than the DM merely
-- passing the member branch like any other player would.

begin;

  insert into npcs (campaign_id, name, is_revealed)
  values ('02534abd-e812-4e8b-a735-238ed10a1067', 'Decoy -- rolled back', true);

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select 'check 2: DM of A sees all of A, none of B' as check,
         jsonb_build_object(
           'in_campaign_a',
             count(*) filter (where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'),
           'other_campaigns',
             count(*) filter (where campaign_id <> 'd721b412-2750-492e-bddd-7387fc464bba'),
           'unrevealed_visible',
             count(*) filter (where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                                and not is_revealed)
         ) as result
  from npcs;

rollback;


-- ===========================================================================
-- BLOCK 3 -- a DM of another campaign reads neither table
-- ===========================================================================
--
-- PeacefulCow is a real DM, just not of this campaign, which is precisely the
-- case the is_campaign_dm join has to refuse. Same insert-then-impersonate shape
-- as block 1 and for the same reason: an empty npc_dm_notes would make the
-- second half of this prove nothing.
--
-- CORRECT OUTPUT: one row, both counts 0. Being a DM somewhere is not being a DM
-- here.

begin;

  insert into npc_dm_notes (npc_id, notes)
  select id, 'verification note -- rolled back'
  from npcs
  where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
  order by name
  limit 1
  on conflict (npc_id) do update set notes = excluded.notes;

  select set_config(
           'request.jwt.claims',
           '{"sub":"a52bba44-8278-47d3-8d91-5b47f1fe73cc","role":"authenticated"}',
           true
         );
  set local role authenticated;

  select 'check 4: another campaign''s DM reads nothing here' as check,
         jsonb_build_object(
           'npcs_visible',
             (select count(*) from npcs
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'),
           'notes_visible',
             (select count(*) from npc_dm_notes)
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 4 -- the update trigger: pinned columns, and the name normalised
-- ===========================================================================
--
-- One statement, so `target` reads the row as it was before the update from the
-- same snapshot the update writes from -- the comparison is against real old
-- values, not against a second query that might have raced.
--
-- The update tampers with everything at once: the three pinned columns, one
-- writable column, and an untrimmed name. Campaign B is a real campaign here but
-- would not have to be -- the BEFORE trigger pins the column back before the
-- foreign key is evaluated, so there is nothing for the FK to reject either way.
--
-- CORRECT OUTPUT: six rows, one per field, the five boolean ones all true.
--   campaign_id_pinned / portrait_key_pinned / created_at_pinned  the trigger
--     refused the tamper.
--   description_written  matters as much as the others: without it, a trigger
--     that rejected the whole update would look identical to one that pinned
--     three columns correctly.
--   name_trimmed  the padding was stripped rather than rejected, which is the
--     knowing divergence from how characters handles the same problem -- there
--     an untrimmed name is an error, here it is normalised, because this field
--     gets edited mid-session. An error instead (23514, "violates check
--     constraint npcs_name_check") would mean the trigger is not firing ahead of
--     the constraint, which would also mean none of the pinning above is real.
--   stored_name  should read back exactly as it was, no leading or trailing
--     space.

begin;

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  with target as (
    select id, campaign_id, portrait_key, created_at, name
    from npcs
    where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
    order by name
    limit 1
  ),
  updated as (
    update npcs n
    set campaign_id  = '02534abd-e812-4e8b-a735-238ed10a1067',
        portrait_key = 'tampered-key',
        created_at   = timestamptz '1999-01-01 00:00:00+00',
        description  = 'verification write -- rolled back',
        name         = '  ' || t.name || '   '
    from target t
    where n.id = t.id
    returning n.id, n.campaign_id, n.portrait_key, n.created_at, n.description, n.name
  )
  -- Exploded into one row per field rather than returned as a single jsonb
  -- object: the SQL editor truncates a wide cell, and a check whose answer is
  -- cut off past the third field is not a check.
  select f.key as field, f.value as value
  from updated u
  join target t on t.id = u.id
  cross join lateral jsonb_each_text(jsonb_build_object(
    'campaign_id_pinned',  u.campaign_id  is not distinct from t.campaign_id,
    'portrait_key_pinned', u.portrait_key is not distinct from t.portrait_key,
    'created_at_pinned',   u.created_at   is not distinct from t.created_at,
    'description_written', u.description = 'verification write -- rolled back',
    'name_trimmed',        u.name = t.name,
    'stored_name',         u.name
  )) as f
  order by f.key;

rollback;


-- ===========================================================================
-- BLOCK 5 -- two consecutive upserts to npc_dm_notes both land
-- ===========================================================================
--
-- The first is an INSERT (no note row exists for a freshly seeded NPC) and the
-- second is an UPDATE, from what is one button in the client. A missing UPDATE
-- policy passes the first and fails the second, which is why one upsert is not
-- a test -- the bug would reach a session before it reached anything else.
--
-- CORRECT OUTPUT: one row, rows_for_npc = 1 and stored_note = 'second save'.
-- If the run fails on the second insert with "new row violates row-level
-- security policy for table npc_dm_notes", that is the missing UPDATE policy and
-- it is the exact failure this block exists to catch.

begin;

  select set_config(
           'request.jwt.claims',
           '{"sub":"ea74d56b-8f45-4e4c-80f8-90a6d29b5adf","role":"authenticated"}',
           true
         );
  set local role authenticated;

  insert into npc_dm_notes (npc_id, notes)
  values (
    (select id from npcs
     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
     order by name limit 1),
    'first save'
  )
  on conflict (npc_id) do update set notes = excluded.notes;

  insert into npc_dm_notes (npc_id, notes)
  values (
    (select id from npcs
     where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
     order by name limit 1),
    'second save'
  )
  on conflict (npc_id) do update set notes = excluded.notes;

  select 'check 6: upsert twice' as check,
         jsonb_build_object(
           'rows_for_npc', count(*),
           'stored_note',  max(notes)
         ) as result
  from npc_dm_notes
  where npc_id = (select id from npcs
                  where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                  order by name limit 1);

rollback;


-- ===========================================================================
-- BLOCK 6 -- deleting a location empties the NPC's home instead of failing
-- ===========================================================================
--
-- This is the one the column list on ON DELETE SET NULL exists for. Bare SET
-- NULL would try to null campaign_id too and raise 23502 here, and the same
-- failure would block deleting a campaign, since that cascades into locations.
--
-- Run as the table owner rather than as a DM: locations has no DELETE policy, so
-- there is no role that could do this through RLS at all.
--
-- Two statements, not one: a data-modifying CTE's effects are invisible to the
-- rest of the statement containing it, so a count folded into the DELETE would
-- read the snapshot from before the delete and report success either way.
--
-- CORRECT OUTPUT: one row, no error. npcs_without_home = 2 (both seeded NPCs
-- live at Castle Ravenloft) and npcs_total = 2, unchanged -- they were rehomed,
-- not removed. "null value in column campaign_id violates not-null constraint"
-- is the bare SET NULL failure, and means the FK needs the column list.

begin;

  delete from locations
  where id in (
    select l.id from locations l
    where l.campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
      and exists (select 1 from npcs n where n.location_id = l.id)
    limit 1
  );

  select 'check 7: location delete rehomes its NPCs' as check,
         jsonb_build_object(
           'npcs_without_home', count(*) filter (where location_id is null),
           'npcs_total',        count(*)
         ) as result
  from npcs
  where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba';

rollback;


-- ===========================================================================
-- BLOCK 7 -- the player cannot reveal an NPC, and is not told so
-- ===========================================================================
--
-- The other half of block 1. That block proves a hidden NPC is unreadable; this
-- proves it is unwritable, which is a separate policy -- SELECT and UPDATE are
-- declared apart, and an UPDATE policy written as `true` would leave every read
-- test in this file green.
--
-- The UPDATE is sent unfiltered, the way a client that forgot its .eq() would
-- send it. Scoping the attack to campaign A would leave a policy that scopes by
-- nothing looking exactly like one that scopes correctly.
--
-- Expect NO ERROR. USING excludes every row before WITH CHECK is ever consulted,
-- so this comes back as a clean zero-row update -- the same shape PostgREST
-- hands the browser as a 200 with an empty body, which is why updateNpc in the
-- client treats "no row came back" as a refusal rather than as a success. A
-- refused write that raises nothing is the reason this block exists.
--
-- The baseline is captured as the table owner, before the role switch: the
-- player cannot see the hidden rows this is protecting, so a comparison made
-- through their eyes would have nothing in it to compare. A temp table is what
-- carries it across the impersonation, and the ROLLBACK drops it along with
-- everything else.
--
-- CORRECT OUTPUT: one row. rows_changed = 0, npcs_compared = 2.
-- hidden_before = 1 (Rahadin) and hidden_after = 1. Read hidden_before FIRST: if
-- it is 0 there is no hidden NPC left to steal and the zero above is proving
-- nothing, which is a broken test rather than a passing one.

begin;

  create temp table baseline_npcs on commit drop as
  select id, is_revealed from npcs;

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  update npcs set is_revealed = true;

  -- Back to the owner to read the answer, for the same reason the baseline was
  -- taken as the owner: under RLS a hidden row that stayed hidden and a hidden
  -- row that was just revealed both have to be visible to be told apart.
  reset role;

  select 'check 8: player cannot reveal an NPC' as check,
         jsonb_build_object(
           'rows_changed',
             count(*) filter (where n.is_revealed is distinct from b.is_revealed),
           'hidden_before', count(*) filter (where not b.is_revealed),
           'hidden_after',  count(*) filter (where not n.is_revealed),
           'npcs_compared', count(*)
         ) as result
  from baseline_npcs b
  join npcs n on n.id = b.id;

rollback;


-- ===========================================================================
-- BLOCK 8 -- the player cannot write a DM note, not even on an NPC they see
-- ===========================================================================
--
-- Block 1 proves the player reads no notes. This is the write half, and it is a
-- different policy again: SELECT on npc_dm_notes carries USING, INSERT carries
-- WITH CHECK, and they are declared separately -- a WITH CHECK of `true` leaves
-- block 1 passing while any player can write into the DM's private notes.
--
-- Aimed at a REVEALED NPC for block 1's reason: there the player passes the
-- outer half of the EXISTS join and only is_campaign_dm stands in the way. A
-- hidden NPC would be refused by the outer half and prove the weaker thing.
--
-- Unlike block 7 this one RAISES -- a row failing WITH CHECK is an error, not a
-- silent no-op -- so the attempt is wrapped to keep the block ending in a result
-- row like every other.
--
-- THE TARGET IS RESOLVED FIRST, and that is the whole difficulty here. A 42501
-- is not by itself evidence of anything: RLS WITH CHECK is evaluated ahead of
-- NOT NULL and the foreign key, so an insert naming a null npc_id fails the
-- EXISTS -- `npcs.id = null` is never true -- and is refused with exactly the
-- same 42501, exactly the same message. "The player passed the outer gate and
-- is_campaign_dm stopped them" and "the player could see nothing, sent a null,
-- and never reached the interesting half" then look identical on screen, and
-- only the first is worth writing a block about.
--
-- So the target is read as the player, before the attempt, and travels into it
-- by uuid. A uuid in the output is proof the outer gate was genuinely passed;
-- the sentinel is proof it was not. Nothing was visible to aim at means the run
-- aborts on the cast rather than reporting a refusal it did not earn.
--
-- The handler catches 42501 and nothing else on purpose. 23505 aborts the run,
-- and would mean the policy admitted the row and only a pre-existing note
-- stopped it -- a leak, not a pass.
--
-- Both verdicts travel out through transaction-local settings because that is
-- the one channel needing no grant: a temp table written by the owner is not
-- writable by `authenticated` without one.
--
-- CORRECT OUTPUT: one row. target_npc a real uuid (Strahd's), notes_written = 0,
-- and attempt reading
--   refused: 42501 new row violates row-level security policy for table "npc_dm_notes"
-- Read target_npc FIRST -- a refusal means nothing without a visible NPC to have
-- been refused about. Anything starting 'ACCEPTED' is the feature leaking. If
-- the player could see no revealed NPC there is no result row at all, just
--   invalid input syntax for type uuid: "NONE -- block proved nothing"
-- which is the sentinel working, not the policy failing.

begin;

  select set_config(
           'request.jwt.claims',
           '{"sub":"1313672b-6990-45a6-8a28-c448ca116d2d","role":"authenticated"}',
           true
         );
  set local role authenticated;

  -- Read through the player's RLS, so a target that comes back is an NPC this
  -- player can really see -- the outer half of the EXISTS join passed before the
  -- attempt begins. The coalesce turns "nothing visible" into a value that
  -- cannot be mistaken for a uuid downstream.
  select set_config(
           'verify.target_npc',
           coalesce(
             (select id::text from npcs
              where campaign_id = 'd721b412-2750-492e-bddd-7387fc464bba'
                and is_revealed
              order by name
              limit 1),
             'NONE -- block proved nothing'
           ),
           true
         );

  do $$
  begin
    -- The resolved target, not a subquery: a subquery evaluated in here could
    -- come back null, and a null npc_id is refused with the same 42501 as a real
    -- one. Casting the sentinel raises 22P02 instead, which no handler below
    -- catches, so a block with nothing to aim at fails loudly rather than
    -- reporting a refusal it did not earn.
    insert into npc_dm_notes (npc_id, notes)
    values (
      current_setting('verify.target_npc', true)::uuid,
      'breach -- rolled back'
    );

    perform set_config('verify.notes_insert',
                       'ACCEPTED -- the INSERT policy is leaking', true);
  exception
    when insufficient_privilege then
      -- Set in the handler, after the failed subtransaction has been rolled
      -- back, so this survives to be read below.
      perform set_config('verify.notes_insert',
                   'refused: ' || sqlstate, true);
  end
  $$;

  reset role;

  select 'check 9: player cannot write DM notes' as check,
         jsonb_build_object(
           'target_npc',    current_setting('verify.target_npc', true),
           'attempt',       current_setting('verify.notes_insert', true),
           'notes_written', (select count(*) from npc_dm_notes
                             where notes = 'breach -- rolled back')
         ) as result;

rollback;


-- ===========================================================================
-- BLOCK 9 -- the constraints and policies as the database actually stored them
-- ===========================================================================
--
-- No transaction: nothing here writes.
--
-- CORRECT OUTPUT: 16 rows -- 4 constraints, 10 policy rows (five policies, two
-- rows each), 2 rls entries.
--
--   constraints  the npcs primary key; the name check carrying all three clauses
--     (= trim, <> '', length <= 60); the campaigns FK; and one FOREIGN KEY
--     (campaign_id, location_id) REFERENCES locations(campaign_id, id) ON DELETE
--     SET NULL (location_id). Two separate FKs to campaigns and locations would
--     mean the composite one did not survive.
--
--   policies  five, and no more. npcs gets SELECT (is_campaign_dm or is_revealed
--     and is_campaign_member, WITH CHECK "(none)") and UPDATE (is_campaign_dm in
--     both). Nothing for INSERT or DELETE on npcs -- their absence is the design,
--     so any row naming one is a policy that should not exist. npc_dm_notes gets
--     SELECT, INSERT and UPDATE, each carrying the same EXISTS join back to npcs:
--     SELECT has USING only, INSERT has WITH CHECK only, UPDATE has both.
--
--   rls enabled  two rows, both true. RLS that was never enabled makes every
--     block above pass for the wrong reason.

-- Two columns and one fact per row, so the value column gets the full width of
-- the results pane. Aggregating these into jsonb packs the interesting half of
-- every policy past the point where the editor stops rendering.
--
-- Each policy contributes two rows, USING and WITH CHECK, because that pair is
-- the thing being read: an INSERT policy has no USING and an UPDATE policy needs
-- both, and "(none)" in the wrong place is what a broken one looks like.

select 'constraint: ' || conname as item,
       pg_get_constraintdef(oid) as value
from pg_constraint
where conrelid in ('public.npcs'::regclass, 'public.npc_dm_notes'::regclass)

union all
select 'policy: ' || tablename || '.' || policyname || ' [' || cmd || '] USING',
       coalesce(qual, '(none)')
from pg_policies
where schemaname = 'public' and tablename in ('npcs', 'npc_dm_notes')

union all
select 'policy: ' || tablename || '.' || policyname || ' [' || cmd || '] WITH CHECK',
       coalesce(with_check, '(none)')
from pg_policies
where schemaname = 'public' and tablename in ('npcs', 'npc_dm_notes')

union all
select 'rls enabled: ' || relname,
       relrowsecurity::text
from pg_class
where oid in ('public.npcs'::regclass, 'public.npc_dm_notes'::regclass)

order by item;

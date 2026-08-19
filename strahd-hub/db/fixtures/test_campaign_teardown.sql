-- db/fixtures/test_campaign_teardown.sql
--
-- Undoes test_campaign_seed.sql: removes the 'Test Roster' campaign and the five
-- fixture auth users, leaving nothing of either behind.
--
-- Destructive, and not recoverable. That is what it is for -- but read the two
-- notes below before running it, because both are about deleting more than you
-- meant to.
--
-- ---------------------------------------------------------------------------
-- ORDER IS LOAD-BEARING
-- ---------------------------------------------------------------------------
--
-- The campaign goes first, and not for tidiness. The chain the seed file walks
-- down is not cascaded all the way back up:
--
--   profiles.id            -> auth.users(id)   ON DELETE CASCADE   (000)
--   campaign_members.user_id -> profiles(id)   no action           (013)
--
-- So deleting a fixture auth user while its campaign_members row still exists
-- cascades into profiles and then hits that second foreign key with nothing to
-- do about it: the delete fails with a foreign key violation, and the obvious
-- reading of that error -- "the user is still referenced somewhere" -- does not
-- tell you which of the two deletes to do first.
--
-- Removing the campaign takes campaign_members with it (013's cascade), and
-- through it characters, character_inventory, character_spells and
-- character_feats (028, 037, 041), along with the campaign's locations, DM
-- notes, recaps, invites and any homebrew feats it authored (039's cascade on
-- feats.campaign_id). That is the same total destruction 020 documents when a DM
-- deletes a campaign from the app, and the same one KNOWN_ISSUES.md warns about
-- under "Removing a player from a campaign destroys their character, gear,
-- spells and feats". Here it is the point.
--
-- ---------------------------------------------------------------------------
-- WHAT SURVIVES
-- ---------------------------------------------------------------------------
--
-- Your two real Google accounts, both of them. The second account loses its
-- membership of 'Test Roster' and the character it made there -- that goes with
-- the campaign in step 1, like everyone else's -- but the account, its profile
-- and its display name are untouched, because step 2 is scoped to the fixture
-- email domain and nothing else.
--
-- Nothing outside the campaign is touched either. The shared item, spell and
-- feat catalogues are campaign_id is null rows; this file never references them.
--
-- CORRECT OUTPUT: one result set, four rows, every `remaining` count 0.


begin;

-- ===========================================================================
-- GUARD -- refuse to delete more than one campaign, or the wrong users
-- ===========================================================================

do $$
declare
  campaign_count int;
  user_count     int;
  stray          text;
begin
  select count(*) into campaign_count from campaigns where name = 'Test Roster';

  -- More than one is the case worth stopping on. Zero is not an error: the
  -- campaign may already have been deleted from the app, and this file should
  -- still be able to clean up the auth users left behind by that.
  if campaign_count > 1 then
    raise exception
      'Found % campaigns named ''Test Roster''. Delete them one at a time by id rather than by name.', campaign_count;
  end if;

  select count(*) into user_count
  from auth.users where email like '%@fake.invalid';

  if campaign_count = 0 and user_count = 0 then
    raise exception 'Nothing to tear down: no ''Test Roster'' campaign and no @fake.invalid users.';
  end if;

  -- The check this file exists to make. If a fixture user somehow belongs to a
  -- campaign other than the one being deleted, step 2 would fail on the foreign
  -- key described in the header -- but by then step 1 has already destroyed a
  -- real campaign's worth of rows. Better to find out before anything is
  -- deleted, and to say which campaign it is.
  select string_agg(distinct c.name, ', ') into stray
  from campaign_members cm
  join auth.users u on u.id = cm.user_id
  join campaigns c  on c.id = cm.campaign_id
  where u.email like '%@fake.invalid'
    and c.name <> 'Test Roster';

  if stray is not null then
    raise exception
      'Fixture users are also members of: %. Remove them from those campaigns first -- this file will not delete a campaign it did not seed.', stray;
  end if;

  raise notice 'Tearing down % campaign(s) and % fixture user(s).', campaign_count, user_count;
end
$$;


-- ===========================================================================
-- STEP 1 -- the campaign, and everything hanging off it
-- ===========================================================================

delete from campaigns where name = 'Test Roster';


-- ===========================================================================
-- STEP 2 -- the fixture auth users, and their profiles by cascade
-- ===========================================================================

-- Scoped to the reserved domain, which is the whole safety argument for having
-- used it: '%@fake.invalid' cannot match a real address, because .invalid can
-- never route. If you swapped the domain to @example.com in the seed file,
-- change it here too -- and check the pattern twice, because this is the one
-- statement in the pair that can reach an account you care about.
delete from auth.users where email like '%@fake.invalid';


-- ===========================================================================
-- WHAT IS LEFT
-- ===========================================================================

-- Every count should be 0. characters is asked separately from campaigns rather
-- than trusted to the cascade: a non-zero there would mean the cascade did not
-- reach, which is the one failure that leaves orphans behind rather than an
-- error on screen.

select 'campaigns named Test Roster' as thing,
       (select count(*) from campaigns where name = 'Test Roster') as remaining
union all
select 'auth users @fake.invalid',
       (select count(*) from auth.users where email like '%@fake.invalid')
union all
select 'profiles for those users',
       (select count(*) from profiles p
        where not exists (select 1 from auth.users u where u.id = p.id))
union all
select 'characters in that campaign',
       (select count(*) from characters ch
        join campaigns c on c.id = ch.campaign_id
        where c.name = 'Test Roster');

commit;

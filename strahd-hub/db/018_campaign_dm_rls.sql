-- Makes "DM" a per-campaign question on every content policy. 016 scoped the
-- reads and said outright that the writes were left global; this is that half.
--
-- Until now profiles.role was the only thing any policy asked, so a DM was a DM
-- everywhere: they could delete another campaign's recaps, edit another
-- campaign's map, rename another campaign, and rewrite another campaign's
-- roster. campaign_members.role has carried the per-campaign answer since 013
-- and nothing has read it. This file is the first thing that does.
--
-- Three shapes, and which one a policy gets is the whole content of this
-- migration:
--
--   dropped     items read, recaps read, recaps edit. These are already
--               `is_dm() or is_campaign_member(...)`, and once is_dm() means
--               "DM of some campaign" the first branch is subsumed by the
--               second -- a DM of this campaign has a membership row, so
--               is_campaign_member is already true for them. Swapping in
--               is_campaign_dm here would add a term that can never change an
--               answer. The branch goes; the member check stands alone.
--
--   swapped     locations read (DM branch), locations update, recaps
--               create/delete, campaigns update, and the roster policy. Here
--               is_dm() is the actual gate -- drop it and the policy admits
--               everyone or no one -- so it becomes is_campaign_dm of the row's
--               campaign.
--
--   special     campaigns read and location_dm_notes, each for its own reason,
--               spelled out where they appear.
--
-- Before running this, know what it can strand: a campaign with no
-- campaign_members row of role 'dm' becomes invisible to everyone and editable
-- by no one, because after this file every path in reads that row. 014 writes it
-- for campaigns created through the app and 015 wrote it by hand for the
-- original one, so this is only about campaigns that predate 014 or were made by
-- a bare insert. Check first, and delete or adopt whatever comes back:
--
--   select c.id, c.name
--   from campaigns c
--   where not exists (
--     select 1 from campaign_members m
--     where m.campaign_id = c.id and m.role = 'dm'
--   );

begin;

-- ---------------------------------------------------------------------------
-- the predicate the rest of the file is built from
-- ---------------------------------------------------------------------------

-- is_campaign_member (016) with one more condition, and one very different
-- property: this one is SECURITY DEFINER.
--
-- That is not a preference, it is forced. "dm manages memberships" below is a
-- policy ON campaign_members, and its using clause calls this function, which
-- selects from campaign_members. Under security invoker that select is itself
-- subject to campaign_members' policies -- including the one currently being
-- evaluated -- and Postgres stops it with `infinite recursion detected in policy
-- for relation "campaign_members"`. Not a subtle failure: the roster page simply
-- errors. Definer runs the body as the function's owner, who owns the table and
-- is exempt from its RLS (nothing here uses FORCE ROW LEVEL SECURITY), so the
-- inner select answers directly and the cycle never forms. This is why
-- is_campaign_member could stay invoker and this one cannot -- 016's function is
-- never called from a policy on the table it reads.
--
-- Bypassing RLS is safe here for the same reason 016 argued it was unnecessary
-- there: the body asks one question, about auth.uid(), and can only ever return
-- a fact about the caller's own membership row. There is no argument that makes
-- it report on somebody else. An anonymous caller has a null auth.uid() and gets
-- false.
--
-- But definer does mean 008's rule applies: with RLS bypassed the EXECUTE grant
-- is the only gate on the body, and Supabase hands EXECUTE to anon by default.
-- Hence the revoke at the bottom of this file -- is_dm() and is_campaign_member
-- skip it because invoker rights make it moot; this function does not get to.
create or replace function public.is_campaign_dm(target_campaign uuid)
 returns boolean
 language sql
 security definer
 set search_path to 'public'
 stable
as $function$
  select exists (
    select 1 from campaign_members
    where campaign_id = target_campaign
      and user_id = auth.uid()
      and role = 'dm'
  );
$function$
;

-- ---------------------------------------------------------------------------
-- items -- the redundant branch, dropped
-- ---------------------------------------------------------------------------

drop policy if exists "read shared and own-campaign items" on public.items;

-- Recreated under the same name because its meaning has not changed: shared
-- catalogue to everybody, homebrew to the campaign it was made for. All that
-- goes is a global-DM shortcut around the second half, which no DM of the
-- campaign in question ever needed.
create policy "read shared and own-campaign items" on public.items
  for select to authenticated
  using (
    campaign_id is null
    or public.is_campaign_member(campaign_id)
  );

-- ---------------------------------------------------------------------------
-- locations -- the DM branch is load-bearing here, so it is swapped
-- ---------------------------------------------------------------------------

drop policy if exists "read revealed locations in your campaigns" on public.locations;

-- The two-branch shape from 016 is kept, and this is the case that shows why it
-- is not the same redundancy as items above: the DM branch is what returns
-- *unrevealed* rows, which is_campaign_member alone never does. Narrowed rather
-- than removed -- the DM of this campaign sees everything in it, and nothing at
-- all in anyone else's.
create policy "read revealed locations in your campaigns" on public.locations
  for select to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or (is_revealed and public.is_campaign_member(campaign_id))
  );

-- 006, not 004: 004 gave locations SELECT policies only, and this one arrived
-- two files later. Same name, same two clauses, asking the campaign's DM instead
-- of any DM.
drop policy if exists "dms update locations" on public.locations;

create policy "dms update locations" on public.locations
  for UPDATE to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- ---------------------------------------------------------------------------
-- location_dm_notes -- gated through the join, and failing closed
-- ---------------------------------------------------------------------------

-- 016 left this one alone on the grounds that `using (is_dm())` admits no
-- players, so there was no cross-campaign read to close. That reasoning expires
-- with this file: is_dm() is exactly the thing that stops being an answer.
--
-- 015 deliberately gave this table no campaign_id -- one row per location, keyed
-- by the id it references, so a second copy of the campaign could only ever
-- disagree with the first. The campaign is one join away, and this is the join,
-- which is the shape 015 predicted it would take.
drop policy if exists "dms read location notes" on public.location_dm_notes;

-- Two gates, and the outer one is the interesting half. The subquery runs as the
-- invoking user, so it answers through locations' own SELECT policy -- the same
-- load-bearing dependency 011 and 013 name for the campaigns/campaign_members
-- pair. That is what makes this fail closed rather than open: if a caller cannot
-- see the location, the exists is false and the note is unreachable, whatever
-- the inner check would have said. A DM of another campaign fails both halves; a
-- player who can see a revealed location passes the outer gate and is stopped by
-- the inner one.
create policy "dms read location notes" on public.location_dm_notes
  for SELECT to authenticated
  using (
    exists (
      select 1 from locations
      where locations.id = location_dm_notes.location_id
        and public.is_campaign_dm(locations.campaign_id)
    )
  );

-- ---------------------------------------------------------------------------
-- session_recaps -- one branch dropped twice, one gate swapped twice
-- ---------------------------------------------------------------------------

drop policy if exists "read recaps in your campaigns" on public.session_recaps;

create policy "read recaps in your campaigns" on public.session_recaps
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

drop policy if exists "members edit recaps" on public.session_recaps;

-- Still both clauses, still the same expression in each, for the reason 016
-- gives: an edit must not be able to carry a recap into a campaign the editor
-- does not belong to. The trigger from 007/016 pins campaign_id on top of that,
-- which is what stops a member of two campaigns moving one between them.
create policy "members edit recaps" on public.session_recaps
  for update to authenticated
  using (public.is_campaign_member(campaign_id))
  with check (public.is_campaign_member(campaign_id));

-- 007's names, unchanged -- these two are the DM's alone and still are, only now
-- "the DM" means the DM of the campaign the recap names.
drop policy if exists "dms create recaps" on public.session_recaps;

-- with check, not using: an INSERT has no existing row to test, so the campaign
-- being asked about is the one the new row declares. A DM cannot file a recap
-- into a campaign they do not run.
create policy "dms create recaps" on public.session_recaps
  for INSERT to authenticated
  with check (public.is_campaign_dm(campaign_id));

drop policy if exists "dms delete recaps" on public.session_recaps;

create policy "dms delete recaps" on public.session_recaps
  for DELETE to authenticated
  using (public.is_campaign_dm(campaign_id));

-- ---------------------------------------------------------------------------
-- campaigns -- the row IS the campaign, so the argument is id
-- ---------------------------------------------------------------------------

drop policy if exists "dms update campaigns" on public.campaigns;

-- `id`, not campaign_id: on every other table the column names which campaign
-- the row belongs to; here the row is the campaign. 012 added this so a DM could
-- rename a campaign, and it has meant "any DM may rename any campaign" ever
-- since.
create policy "dms update campaigns" on public.campaigns
  for UPDATE to authenticated
  using (public.is_campaign_dm(id))
  with check (public.is_campaign_dm(id));

drop policy if exists "read campaigns you can see" on campaigns;

-- The special case. This does not become `is_campaign_dm(id) or <subquery>`,
-- because the subquery already covers the DM: a DM's 'dm' row in
-- campaign_members is a membership row like any other, and 014 writes it in the
-- same transaction as the campaign. So the is_dm() branch is simply deleted and
-- what is left is 013's membership half, untouched.
--
-- Left as the inline subquery rather than folded into is_campaign_member(id).
-- They are the same query; this file's business with this policy is removing a
-- branch, not rewriting the one that stays.
--
-- The visible consequence, and it is the one to expect on the campaign picker: a
-- DM no longer sees every campaign in the database, only the ones they are in.
-- That is the point of the file, but it is also the change most likely to look
-- like a bug from the outside.
create policy "read campaigns you can see"
on campaigns for select to authenticated
using (
  id in (
    select campaign_id from campaign_members where user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- campaign_members -- the roster, and the reason the helper is definer
-- ---------------------------------------------------------------------------

drop policy if exists "dm manages memberships" on campaign_members;

-- 013 said narrowing this was what the role column made possible and that doing
-- it early would lock out a DM with no membership row. Both halves of that are
-- now settled: the column is populated (014 for new campaigns, 015 for the
-- original), and the pre-flight query at the top of this file is how you confirm
-- it before running.
--
-- `for all` still, so this remains INSERT/UPDATE/DELETE/SELECT over the roster,
-- but only of campaigns the caller runs. "members read own memberships" is
-- untouched and still what lets a player see their own rows -- and still what
-- makes is_campaign_member work at all, since that function reads this table as
-- the invoker.
--
-- This policy is the one that forces is_campaign_dm to be security definer; see
-- the note on the function.
create policy "dm manages memberships"
on campaign_members for all to authenticated
using (public.is_campaign_dm(campaign_id))
with check (public.is_campaign_dm(campaign_id));

-- Nothing here breaks joining a campaign: claim_player_invite (013) is security
-- definer and inserts the membership row with RLS bypassed, and create_campaign
-- (014) does the same for the creator's 'dm' row. Neither has ever gone through
-- this policy, which is why narrowing it does not strand a new player or a new
-- campaign.

-- ---------------------------------------------------------------------------
-- grants -- must follow the definition above
-- ---------------------------------------------------------------------------

revoke execute on function public.is_campaign_dm(uuid) from public, anon;
grant  execute on function public.is_campaign_dm(uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- verification
--
-- The check this migration is for -- no content policy asks the global role any
-- more. Expect zero rows:
--
--   select tablename, policyname
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('items','locations','location_dm_notes',
--                       'session_recaps','campaigns','campaign_members')
--     and (qual like '%is_dm%' or with_check like '%is_dm%');
--
-- And the recursion this file's helper exists to avoid, which is only ever
-- visible at runtime -- as a DM, expect a roster back rather than an error:
--
--   select * from campaign_members;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- what is still open after this
--
-- is_dm() survives, and now means one thing only: may create campaigns. Four
-- places still call it, all deliberately.
--
--   create_campaign (014) and "dm inserts campaigns" (010/011) -- the gate on
--   making a campaign at all. There is no campaign to be the DM of yet, so
--   is_campaign_dm has nothing to be asked about; this is exactly the question
--   the global flag is still the right answer to.
--
--   claim_dm_invite (000) -- what sets profiles.role = 'dm' in the first place.
--   Untouched: it grants the ability to create campaigns, which is what the flag
--   now means.
--
--   "dms can view invites" on player_invites (010/011) and on dm_invites (000).
--   Invite tables, not content tables, so they fall outside the check above --
--   but the player_invites one does let any global DM read every campaign's
--   outstanding codes. Narrowed by 019; the dm_invites one stays global, and
--   correctly so -- a DM invite grants the flag, so the flag is what gates it.
--
-- The real remaining hole is generate_player_invite (010/011): it is security
-- definer, its gate is `if not public.is_dm()`, and it takes target_campaign as
-- an argument. Any global DM can still mint a player invite into any campaign in
-- the database and hand it out. That is a cross-campaign write of exactly the
-- kind this file closed everywhere else, and it survives only because it lives
-- in a function body rather than a policy -- swapping that line for
-- `is_campaign_dm(target_campaign)` is the next migration, and a small one.
--   Closed by 019, which is that swap.
--
-- Two smaller things, both carried over from 016 and neither made worse here:
--
--   locations still has no trigger pinning campaign_id, so a DM of two campaigns
--   can move a location between them -- both clauses of "dms update locations"
--   pass. A DM of one campaign can no longer move a location out of it, which is
--   the half that mattered.
--
--   items still has no INSERT policy, so the homebrew branch of its read policy
--   describes rows nothing can create yet.
-- ---------------------------------------------------------------------------

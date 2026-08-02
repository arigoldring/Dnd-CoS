-- Teaches RLS to read the campaign_id that 015 added. Until this runs, that
-- column is decoration: every SELECT policy on the content tables still dates
-- from when there was one campaign, so a player in one campaign reads every
-- other campaign's map and session history.
--
-- Three tables, three different shapes, because the question is not the same in
-- each place:
--
--   session_recaps  membership, plainly. A recap means nothing outside its
--                   campaign and there is no second gate.
--   locations       membership AND the reveal gate 004 already had. Both must
--                   hold for a player -- being in the campaign is not a reason
--                   to see a location the DM hasn't revealed.
--   items           null-or-membership. A null campaign_id is the shared SRD
--                   catalogue and has to reach everyone; only a row that names
--                   a campaign is walled off. Scoping this table the way the
--                   other two are scoped would hide the whole shop from every
--                   player, which is why it gets its own shape rather than the
--                   copy-pasted one.
--
-- Writes are left as they were, all still on the global is_dm() -- see the note
-- at the bottom for what that does and does not mean.

begin;

-- ---------------------------------------------------------------------------
-- the predicate the rest of the file is built from
-- ---------------------------------------------------------------------------

-- The membership half of "read campaigns you can see" (013), lifted out of that
-- policy so four more policies can ask it without restating the subquery.
--
-- security invoker, exactly like is_dm(): this reads campaign_members, and that
-- table's own RLS is what makes the read safe. "members read own memberships"
-- (013) returns only rows where user_id = auth.uid(), which is the same row this
-- query filters for -- so a caller can never test somebody else's membership,
-- and there is nothing here that definer rights would need to bypass. 013 calls
-- that policy load-bearing for the campaigns policy; it is load-bearing for this
-- function too, and dropping it would silently turn every policy below into
-- "false" rather than into an error.
--
-- No grant management for the same reason 008 skips is_dm(): security invoker
-- means an anonymous caller gets false out of a read RLS already governs.
create or replace function public.is_campaign_member(target_campaign uuid)
 returns boolean
 language sql
 security invoker
 set search_path to 'public'
 stable
as $function$
  select exists (
    select 1 from campaign_members
    where campaign_id = target_campaign
      and user_id = auth.uid()
  );
$function$
;

-- ---------------------------------------------------------------------------
-- items -- the catalogue stays public, the homebrew doesn't
-- ---------------------------------------------------------------------------

-- Renamed rather than redefined in place: "Authenticated users can read items"
-- described a policy that let every authenticated user read every row, and that
-- is no longer what it does. Same move 013 made renaming "players read own
-- memberships" when its meaning changed.
drop policy if exists "Authenticated users can read items" on public.items;

-- `campaign_id is null` first because it is the common case and the one that
-- must not be broken: those are the ~100 SRD rows 015 deliberately left null,
-- and they belong to everybody. is_campaign_member is only ever reached for a
-- row that names a campaign, which is to say for homebrew.
create policy "read shared and own-campaign items" on public.items
  for select to authenticated
  using (
    campaign_id is null
    or public.is_dm()
    or public.is_campaign_member(campaign_id)
  );

-- ---------------------------------------------------------------------------
-- locations -- membership, then the reveal gate
-- ---------------------------------------------------------------------------

drop policy if exists "read revealed locations" on public.locations;

-- Written as one DM branch and one player branch rather than as
-- `(is_revealed or is_dm()) and (is_dm() or is_campaign_member(...))`, which is
-- the same truth table but reads like two unrelated conditions that happen to
-- share a term. The DM sees everything; a player needs both halves, and the
-- `and` says so.
create policy "read revealed locations in your campaigns" on public.locations
  for select to authenticated
  using (
    public.is_dm()
    or (is_revealed and public.is_campaign_member(campaign_id))
  );

-- location_dm_notes needs no change and gets none. Its only policy is "dms read
-- location notes" (004), already `using (public.is_dm())` -- a player cannot
-- reach the table at all, so there is no cross-campaign read to close. When the
-- DM role stops being global this is one of the places that has to be revisited,
-- and the join back to locations is how it will find its campaign (015).

-- ---------------------------------------------------------------------------
-- session_recaps -- membership on both the read and the write
-- ---------------------------------------------------------------------------

drop policy if exists "authenticated read recaps" on public.session_recaps;

create policy "read recaps in your campaigns" on public.session_recaps
  for select to authenticated
  using (
    public.is_dm()
    or public.is_campaign_member(campaign_id)
  );

-- The one that was actually dangerous. 007 opened editing to every authenticated
-- player on purpose -- recaps are a shared table anyone can improve -- but
-- `using (true) with check (true)` scoped that to "every recap in the database",
-- which was the same set as "this campaign's recaps" only while there was one
-- campaign. It isn't anymore.
drop policy if exists "authenticated edit recaps" on public.session_recaps;

-- Both clauses, for the reason 006 spells out: `using` picks the rows you may
-- touch, `with check` says what they may look like afterwards. They are the same
-- expression here, and that is the point -- an edit cannot carry a recap out of
-- a campaign you belong to and into one you don't.
create policy "members edit recaps" on public.session_recaps
  for update to authenticated
  using (
    public.is_dm()
    or public.is_campaign_member(campaign_id)
  )
  with check (
    public.is_dm()
    or public.is_campaign_member(campaign_id)
  );

-- 007's trigger pins the columns an edit must not rewrite, because RLS cannot
-- restrict columns -- that is what keeps "any player may edit" from meaning "any
-- player may rewrite anything". campaign_id joins that list now for exactly the
-- same reason: the with check above stops a recap being moved to a campaign you
-- are NOT in, but on its own it would still let a player who belongs to two
-- campaigns move a recap between them, and no policy can express "you may edit
-- this column's row but not this column".
--
-- Replaced whole rather than patched: a plpgsql body is stored as text, so there
-- is no way to add one line to it from here.
create or replace function public.stamp_session_recap()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
begin
  -- Identity from the JWT, never the payload.
  new.last_edited_by := auth.uid();
  new.last_edited_at := now();
  -- Pin the immutable facts so an edit can't renumber, re-date, re-key, or
  -- rehome the recap.
  new.id             := old.id;
  new.session_number := old.session_number;
  new.created_at     := old.created_at;
  new.campaign_id    := old.campaign_id;
  return new;
end;
$function$
;

commit;

-- ---------------------------------------------------------------------------
-- what is still open after this
--
-- Reads are scoped. Writes are not, and deliberately so: "dms create recaps",
-- "dms delete recaps", "dms update locations" and "dm manages memberships" all
-- still ask the global is_dm(), which means a DM can write into any campaign in
-- the database, including one they are not a member of. That is the same
-- deferral 013 named -- profiles.role is one flag for the whole app, so today a
-- DM is a DM everywhere, and campaign_members.role is the column that will let
-- that vary. Narrowing the write policies before anything reads that column
-- would lock out a DM whose membership row is missing.
--
-- Two consequences of leaving them global, worth knowing rather than fixing:
--
--   A DM editing a location can change its campaign_id, because "dms update
--   locations" checks only is_dm() and locations has no trigger pinning the
--   column the way session_recaps now does. Reassigning a location is a DM
--   action either way; it is listed here so it is a decision rather than a
--   discovery.
--
--   items has no INSERT policy at all, from 000 onwards, so the homebrew half of
--   the policy above currently describes rows nothing can create -- every item
--   in the table arrived through 002/003 as the DM. Giving DMs a way to add
--   campaign-scoped items is its own migration, and it is the one that makes
--   `campaign_id is not null` mean something in practice.
-- ---------------------------------------------------------------------------

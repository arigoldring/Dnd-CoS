-- Lets a campaign's DM delete it — the one write on campaigns that 018 left
-- uncovered. 018 gave campaigns an UPDATE policy (rename) scoped to
-- is_campaign_dm(id) but no DELETE, so a campaign could be renamed and never
-- removed. Worse than merely missing: with no DELETE policy the table
-- default-denies, and a delete that RLS forbids does not error — it matches zero
-- rows and returns success. So the client would drop the campaign from the page
-- while it sat untouched in the database. The service that calls this still
-- checks the returned row for exactly that reason, but the policy is what makes
-- an allowed delete actually happen.
--
-- `id`, not campaign_id: same note as "dms update campaigns" in 018 — on every
-- content table the column names which campaign a row belongs to, but here the
-- row IS the campaign, so is_campaign_dm is asked about the row's own id.
--
-- This reads as "only the DM who created a campaign may delete it", and that is
-- exactly what it is: since 018, holding is_campaign_dm means having a
-- campaign_members row of role 'dm', and the only thing that writes one is
-- create_campaign (014) naming the creator. Nothing in the app makes a second DM
-- of an existing campaign, so the campaign's DM and its creator are the same
-- person.
--
-- No cascade to write here. Every child of a campaign already references it with
-- on delete cascade — campaign_members (013), player_invites (010), locations
-- and session_recaps (015), location_dm_notes through locations (004/015), and a
-- DM's homebrew items (015) — so this single delete takes the whole campaign
-- with it and cannot strand an orphan.

create policy "dms delete campaigns" on public.campaigns
  for delete to authenticated
  using (public.is_campaign_dm(id));

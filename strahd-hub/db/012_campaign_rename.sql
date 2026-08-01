-- Let a DM rename a campaign; players stay read-only.
--
-- 010/011 gave campaigns SELECT and INSERT policies only, and RLS denies
-- anything no policy explicitly allows — so until now an UPDATE from the client
-- matched zero rows for everyone, DM included.
--
-- Both clauses are needed and both ask the same question:
--   using      — which existing rows this user may touch
--   with check — what a row is allowed to look like afterwards
-- Same shape as "dms update locations" (006), and the same reasoning: the
-- Rename button in CampaignPicker.tsx is a courtesy to the DM, not the
-- enforcement.
--
-- `is_dm()` is a global role, not per-campaign, so this says what the SELECT
-- policy already says: a DM reaches every campaign. Nothing here narrows that
-- to campaigns they run, because nothing in the schema records who runs what.
--
-- No trigger pinning id/created_at, unlike session_recaps (007). That trigger
-- exists because every player may edit a recap, so the columns need guarding
-- from the same people the policy lets in. Here the policy admits only DMs,
-- who are already trusted with the whole table, and updateCampaignName sends
-- name and nothing else.
create policy "dms update campaigns" on public.campaigns
  for UPDATE to authenticated
  using (public.is_dm())
  with check (public.is_dm());

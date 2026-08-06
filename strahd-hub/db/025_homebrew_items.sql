-- Adds the missing INSERT policy on items, enabling DMs to create homebrew items
-- scoped to their campaign.
--
-- items.campaign_id is nullable since 015_campaign_scoping.sql: null means shared
-- SRD catalogue (visible to all members), non-null means campaign homebrew (visible
-- only to that campaign's members). The read policy already accounts for both cases
-- (018_campaign_dm_rls.sql, "read shared and own-campaign items").
--
-- What was always missing is a write path. 016, 018, and 022 each called this out
-- explicitly as "future scope" — a DM should be able to insert a new item into
-- their own campaign. This migration closes that gap, using the same per-campaign
-- DM predicate (is_campaign_dm) that every other DM-only write uses as of 018.
--
-- The check includes campaign_id is not null to stop any path from accidentally
-- inserting a new shared catalogue row — only the seed migrations (002, 003, 023,
-- 024) should ever do that. A DM creating an item explicitly for their campaign
-- will always set campaign_id, so this constraint is transparent in practice.
--
-- party_inventory needs no changes — "members add to party inventory" (021) already
-- lets any campaign member add to the pile. Once the homebrew item row exists, the
-- DM can add it the same way they add any other item.

begin;

create policy "dms create homebrew items" on public.items
  for insert to authenticated
  with check (
    campaign_id is not null
    and public.is_campaign_dm(campaign_id)
  );

commit;

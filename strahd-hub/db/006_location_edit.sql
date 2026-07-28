-- Let DMs edit a location from the map; players stay read-only.
--
-- 004 gave locations SELECT policies only, and RLS denies anything no policy
-- explicitly allows — so until now an UPDATE from the client was rejected for
-- everyone, DM included.
--
-- Both clauses are needed and both ask the same question:
--   using      — which existing rows this user may touch
--   with check — what a row is allowed to look like afterwards
-- Without `with check` the row could be written into a shape the policy would
-- never have let the user select in the first place.
--
-- This is the gate. The edit button in Maps.tsx is a courtesy to the DM, not
-- the enforcement: a player who calls the update anyway matches zero rows.
create policy "dms update locations" on public.locations
  for UPDATE to authenticated
  using (public.is_dm())
  with check (public.is_dm());

-- Take EXECUTE on the three security definer functions away from anon.
--
-- security definer means these run with the owner's rights and bypass RLS
-- entirely, so no policy is protecting their bodies — the EXECUTE grant is the
-- only gate there is. Supabase's default privileges hand EXECUTE to anon
-- alongside authenticated, so that grant has to be taken back by hand.
--
-- Two of the three already failed safe on their own: set_display_name updates
-- `where id = auth.uid()`, which is null for an anonymous caller and matches
-- nothing, and generate_dm_invite raises on its own `role = 'dm'` check.
--
-- claim_dm_invite is the one this actually closes. It raises a DIFFERENT error
-- for a real unused code ('No profile found for this account') than for a bad
-- one ('Invalid or already-used invite code'), which made it an oracle: an
-- unauthenticated caller could sift for valid invite codes without ever
-- signing in. The failed claim rolls back, so no code was ever burned — but
-- the answer leaked all the same.
--
-- Revoking from anon alone is enough here ONLY because these functions carry
-- no grant to PUBLIC. Postgres grants EXECUTE to PUBLIC by default on CREATE
-- FUNCTION, and a PUBLIC grant is a separate ACL entry that a role-specific
-- revoke does not touch — it would have survived this untouched. pg_proc.proacl
-- showed postgres, anon, authenticated and service_role and no bare
-- `=X/postgres` PUBLIC entry, so there was nothing else to remove. Had there
-- been, the fix would have needed `from public, anon` PLUS an explicit
-- `grant execute ... to authenticated` to avoid locking out real players too.
--
-- Confirm with, per function:
--   select has_function_privilege('anon', 'public.set_display_name(text)', 'execute');
--   => false
--
-- is_dm() from 004 deliberately isn't listed: it's security invoker, so an
-- anonymous caller just gets false out of a profiles read that RLS already
-- governs. Nothing to protect.

revoke execute on function public.claim_dm_invite(text)    from anon;
revoke execute on function public.generate_dm_invite(text) from anon;
revoke execute on function public.set_display_name(text)   from anon;

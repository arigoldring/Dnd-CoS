-- Finishes 018 on the invite side: player_invites, both the minting and the
-- reading, become per-campaign.
--
-- 018 made "DM" a per-campaign question everywhere it was asked by a policy, and
-- left two things behind that it named on its way out. Both are here, because
-- they are one table and one question:
--
--   generate_player_invite   the write, and the one that mattered. It is
--                            security definer, so RLS is not protecting it --
--                            the `if not public.is_dm()` line at the top is the
--                            entire gate, and that line let any global DM mint a
--                            player invite into any campaign in the database,
--                            including one they have nothing to do with. Handing
--                            that code to someone puts them in a campaign whose
--                            DM never agreed to it, which is the same
--                            cross-campaign write 018 closed on every content
--                            table.
--
--   "dms can view invites"   the read. A leak rather than an entry -- a global
--                            DM could list every campaign's outstanding codes.
--                            Worth noting that the two compose: reading a code
--                            you did not mint is a way to join a campaign you
--                            were not invited to, so closing the write without
--                            the read would have left the same door with an
--                            extra step in front of it.
--
-- One line changes in the function. The rest of its body is restated because a
-- plpgsql body is stored as text and there is no way to edit one line of it from
-- here -- the same reason 016 replaced stamp_session_recap whole.

begin;

-- create or replace, not drop and recreate: the signature and the return type
-- are both unchanged, so replace is legal here and keeps 011's ACL intact.
-- (013 had to drop claim_player_invite precisely because it was changing the
-- return type, and restated the grants afterwards for that reason. Nothing to
-- restate here -- see the note at the bottom for how to confirm that.)
create or replace function public.generate_player_invite(
  target_campaign uuid,
  invite_label text default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_code text;
begin
  -- The gate, now per-campaign. Still an explicit check in code rather than a
  -- policy, for the reason 011 gave: security definer bypasses RLS, so nothing
  -- else guards the insert below.
  --
  -- is_campaign_dm is itself security definer (018), which matters here in a way
  -- it does not in a policy: this function's own definer rights would not extend
  -- into an invoker call, but the question being asked is only ever about
  -- auth.uid(), and auth.uid() is the real caller in both. A DM of another
  -- campaign gets false; an anonymous caller gets false out of a null auth.uid()
  -- and raises before reaching the insert, so this fails closed even if the
  -- EXECUTE grant is ever loosened.
  if not public.is_campaign_dm(target_campaign) then
    raise exception 'Only the DM of this campaign can generate invites';
  end if;

  new_code := gen_random_uuid()::text;
  insert into player_invites (code, campaign_id, label)
  values (new_code, target_campaign, invite_label);
  return new_code;
end;
$function$;

-- ---------------------------------------------------------------------------
-- player_invites -- who may read the codes
-- ---------------------------------------------------------------------------

-- The table matters as much as the name here: "dms can view invites" exists
-- twice in this schema, once on player_invites (010/011) and once on dm_invites
-- (000). Policy names are scoped to their table, so these are two unrelated
-- objects that happen to share a string, and only this one is being touched.
drop policy if exists "dms can view invites" on public.player_invites;

-- Same name and same shape as 010/011, asking the campaign the code is for
-- instead of the global flag. The column is right there on the row -- 010 called
-- campaign_id "the only structural difference" between this table and
-- dm_invites, and this is what that difference is finally for.
create policy "dms can view invites" on public.player_invites
  for select to authenticated using (public.is_campaign_dm(campaign_id));

-- Reading is all this grants, and all it ever granted: player_invites has no
-- INSERT, UPDATE or DELETE policy, and it does not need one. Codes are minted by
-- generate_player_invite and burned by claim_player_invite, both security
-- definer, both writing with RLS bypassed. That is also why claiming still works
-- for a player who cannot see the row they are about to burn -- as it must, since
-- an invitee is by definition not yet a member of anything.

commit;

-- ---------------------------------------------------------------------------
-- verification
--
-- The grants 011 set should have survived the replace untouched:
--
--   select has_function_privilege('anon',
--            'public.generate_player_invite(uuid, text)', 'execute');
--   => false
--   select has_function_privilege('authenticated',
--            'public.generate_player_invite(uuid, text)', 'execute');
--   => true
--
-- And the gate itself, as a DM, against a campaign you do not run -- expect the
-- exception rather than a code:
--
--   select public.generate_player_invite('<someone else''s campaign uuid>');
--
-- The policy, as the same DM -- expect only your own campaigns' codes back,
-- where before this file it was every row in the table:
--
--   select campaign_id, code, used from player_invites;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- what is still open after this
--
-- Nothing on the invite side, and is_dm() is now down to exactly what 018 said
-- it means: may create campaigns. It survives in create_campaign (014), "dm
-- inserts campaigns" (010/011), claim_dm_invite (000), and "dms can view
-- invites" on dm_invites (000).
--
-- That last one is not an oversight and is not the twin of the policy this file
-- narrowed. dm_invites has no campaign_id to ask about -- a DM invite grants the
-- global flag itself, so the global flag is the correct and permanent gate on
-- reading them. It is the one place is_dm() guards is_dm().
-- ---------------------------------------------------------------------------

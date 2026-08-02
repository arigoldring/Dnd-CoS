-- Replaces campaign_players with campaign_members, which carries a per-campaign
-- role. profiles.role is global — one flag for the whole app — so today a DM is a
-- DM everywhere and a player is a player everywhere. The role column here is what
-- lets that vary per campaign later; nothing reads it yet.

begin;

-- ---------------------------------------------------------------------------
-- out with the old
-- ---------------------------------------------------------------------------

-- This policy's USING clause names campaign_players, and Postgres records that
-- as a dependency, so it has to go before the table does. Dropping it here
-- rather than letting `drop table ... cascade` take it means the recreate below
-- is a visible line in this file instead of a silent side effect — and, if some
-- other object turns out to depend on campaign_players too, the drop fails loudly
-- rather than quietly deleting whatever that object was.
drop policy if exists "read campaigns you can see" on campaigns;

-- Its own two policies go with it; policies do not outlive their table.
drop table if exists campaign_players;

-- ---------------------------------------------------------------------------
-- in with the new
-- ---------------------------------------------------------------------------

create table if not exists campaign_members (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references profiles(id),
  role        text not null default 'player' check (role in ('dm','player')),
  primary key (campaign_id, user_id)
);

alter table campaign_members enable row level security;

-- Load-bearing, for the reason 011 spells out: the membership subquery in "read
-- campaigns you can see" runs as the invoking user and answers through this
-- table's own RLS. Without this policy that subquery returns zero rows for a
-- player, and a player sees no campaigns at all.
drop policy if exists "members read own memberships" on campaign_members;

create policy "members read own memberships" on campaign_members
  for select to authenticated
  using (user_id = auth.uid());

-- Still the global is_dm(), not the new role column: a DM reaches every
-- campaign's roster, exactly as under campaign_players. Narrowing this to the
-- campaigns a user is the DM *of* is what the role column makes possible, but
-- that is a later change, and making it here would lock out any DM who has no
-- membership row yet.
drop policy if exists "dm manages memberships" on campaign_members;

create policy "dm manages memberships"
on campaign_members for all to authenticated
using (public.is_dm())
with check (public.is_dm());

-- ---------------------------------------------------------------------------
-- campaigns policy, repointed
-- ---------------------------------------------------------------------------

-- The DM sees every campaign; a player sees only the ones they're a member of.
create policy "read campaigns you can see"
on campaigns for select to authenticated
using (
  public.is_dm()
  or id in (
    select campaign_id from campaign_members where user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- claim_player_invite, repointed, and now reporting whether the join was new
--
-- A plpgsql body is stored as text and checked when it runs, not when it is
-- created, so the drop above left this pointing at a table that no longer
-- exists — broken only when someone next claims an invite. Same transaction, no
-- window.
--
-- Dropped, not replaced: CREATE OR REPLACE cannot change a return type, and
-- against a database that already ran 010/011 it fails outright. The drop takes
-- the execute grants with it, hence the restatement below — a newly created
-- function is executable by PUBLIC, which includes anon.
-- ---------------------------------------------------------------------------

drop function if exists public.claim_player_invite(text);

create function public.claim_player_invite(invite_code text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target_campaign uuid;
begin
  -- Identical atomic check-and-claim to claim_dm_invite. The difference is
  -- what we pull out of the burned row: the campaign to join.
  update player_invites
  set used = true, used_by = auth.uid(), used_at = now()
  where code = invite_code and used = false
  returning campaign_id into target_campaign;

  if target_campaign is null then
    raise exception 'Invalid or already-used invite code';
  end if;

  -- role is left to its default: an invite code is a player invite, and the
  -- check constraint is what keeps anything else out of the column. on conflict
  -- do nothing: an already-a-member claim is a no-op rather than a PK violation
  -- -- same philosophy as your profiles upsert/ignoreDuplicates race handling.
  -- It also leaves an existing member's role alone rather than resetting it.
  insert into campaign_members (campaign_id, user_id)
  values (target_campaign, auth.uid())
  on conflict (campaign_id, user_id) do nothing;

  -- true if the row went in, false if do-nothing swallowed it — the caller's
  -- only way to tell "joined" from "already a member", since both burn a code
  -- and both end with the user in the campaign. FOUND reports on the statement
  -- immediately above, so nothing may come between them.
  return found;
end;
$function$;

-- ---------------------------------------------------------------------------
-- grants -- must follow the definition above
--
-- Only claim_player_invite needs restating; generate_player_invite was never
-- dropped, so 010/011's grants on it still stand.
-- ---------------------------------------------------------------------------

revoke execute on function public.claim_player_invite(text) from public, anon;
grant  execute on function public.claim_player_invite(text) to authenticated;

commit;

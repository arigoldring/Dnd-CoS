-- Reconciles a database where 010 was only partially applied: the campaigns and
-- campaign_players tables plus four policies landed, the invite half never did.
--
-- Every statement here is idempotent, so this is safe to run against a database
-- that got all of 010, none of it, or the partial state described above. 010
-- stays the clean from-scratch definition; this file is the catch-up.
--
-- Policies are dropped and recreated rather than altered because CREATE POLICY
-- has no IF NOT EXISTS form. The transaction is what keeps that swap from
-- leaving a table briefly unguarded -- run this as one batch, not statement by
-- statement. (Supabase's SQL editor already opens its own transaction and will
-- warn about the nested BEGIN; the warning is harmless.)

begin;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists campaign_players (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (campaign_id, user_id)
);

create table if not exists player_invites (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  label       text,
  used        boolean not null default false,
  used_by     uuid references profiles(id),
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

-- ---------------------------------------------------------------------------
-- row level security
--
-- Re-asserted unconditionally: policies can exist on a table that never had RLS
-- switched on, in which case they are inert and the table is wide open. Enabling
-- an already-enabled table is a no-op, so there is no reason to check first.
-- ---------------------------------------------------------------------------

alter table campaigns        enable row level security;
alter table campaign_players enable row level security;
alter table player_invites   enable row level security;

-- ---------------------------------------------------------------------------
-- campaigns policies
-- ---------------------------------------------------------------------------

drop policy if exists "dm inserts campaigns" on campaigns;

create policy "dm inserts campaigns"
on campaigns for insert to authenticated
with check (public.is_dm());

-- Subsumed by "read campaigns you can see", whose first branch is the same DM
-- check. Dropping it changes no one's access.
drop policy if exists "dm reads all campaigns" on campaigns;

drop policy if exists "read campaigns you can see" on campaigns;

-- The DM sees every campaign; a player sees only the ones they're a member of.
create policy "read campaigns you can see"
on campaigns for select to authenticated
using (
  public.is_dm()
  or id in (
    select campaign_id from campaign_players where user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- campaign_players policies
-- ---------------------------------------------------------------------------

-- This is the one 010 missed on its first run, and it is load-bearing: the
-- membership subquery in "read campaigns you can see" runs as the invoking
-- user, so it answers through campaign_players' own RLS. With only the DM
-- policy present that subquery returns zero rows for a player, and a player
-- sees no campaigns at all.
drop policy if exists "players read own memberships" on campaign_players;

create policy "players read own memberships" on campaign_players
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "dm manages memberships" on campaign_players;

create policy "dm manages memberships"
on campaign_players for all to authenticated
using (public.is_dm())
with check (public.is_dm());

-- ---------------------------------------------------------------------------
-- player_invites policies
-- ---------------------------------------------------------------------------

drop policy if exists "dms can view invites" on player_invites;

create policy "dms can view invites" on player_invites
  for select to authenticated using (public.is_dm());

-- ---------------------------------------------------------------------------
-- invite functions -- mint a code, then burn it for membership
-- ---------------------------------------------------------------------------

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
  -- Explicit DM check: security definer bypasses RLS, so nothing else guards
  -- this insert (same reasoning as your generate_dm_invite comment).
  if not public.is_dm() then
    raise exception 'Only DMs can generate invites';
  end if;

  new_code := gen_random_uuid()::text;
  insert into player_invites (code, campaign_id, label)
  values (new_code, target_campaign, invite_label);
  return new_code;
end;
$function$;

create or replace function public.claim_player_invite(invite_code text)
returns void
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

  -- Instead of `update profiles set role='dm'`, we grant campaign membership.
  -- on conflict do nothing: if this player is somehow already a member, the
  -- join is a silent no-op rather than a PK violation -- same philosophy as
  -- your profiles upsert/ignoreDuplicates race handling.
  insert into campaign_players (campaign_id, user_id)
  values (target_campaign, auth.uid())
  on conflict (campaign_id, user_id) do nothing;
end;
$function$;

-- ---------------------------------------------------------------------------
-- function grants -- must follow the definitions above
-- ---------------------------------------------------------------------------

revoke execute on function public.generate_player_invite(uuid, text) from public, anon;
revoke execute on function public.claim_player_invite(text)          from public, anon;

grant  execute on function public.generate_player_invite(uuid, text) to authenticated;
grant  execute on function public.claim_player_invite(text)          to authenticated;

commit;

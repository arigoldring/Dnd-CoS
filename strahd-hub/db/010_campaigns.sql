-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table campaigns enable row level security;

create policy "dm inserts campaigns"
on campaigns for insert to authenticated
with check (public.is_dm());



-- ---------------------------------------------------------------------------
-- campaign_players -- who belongs to which campaign
--
-- Replaced by campaign_members in 013, which adds a per-campaign role. This
-- table, its two policies, and the membership subquery below are all gone from
-- a database that has run 013.
-- ---------------------------------------------------------------------------

create table campaign_players (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (campaign_id, user_id)
);

alter table campaign_players enable row level security;

create policy "players read own memberships" on campaign_players
  for select to authenticated
  using (user_id = auth.uid());

create policy "dm manages memberships"
on campaign_players for all to authenticated
using (public.is_dm())
with check (public.is_dm());

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
-- player_invites -- one-shot codes that grant membership in a single campaign
-- ---------------------------------------------------------------------------

create table player_invites (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  campaign_id uuid not null references campaigns(id) on delete cascade,  -- the only structural difference
  label       text,
  used        boolean not null default false,
  used_by     uuid references profiles(id),
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

alter table player_invites enable row level security;

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

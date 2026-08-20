-- Currency: five denominations (copper, silver, electrum, gold, platinum) on
-- each character's own purse, and a matching shared pool for the party.
--
-- Two tables, and the split is 028's split again: a character's purse is the
-- owner's alone, adjustable only through the same "owner updates own
-- character" policy that already governs rename and reset -- the DM gets no
-- write path onto it, deliberately, unlike character_inventory's
-- can_edit_character widening. party_currency is the opposite: every campaign
-- member, DM included, may adjust it, the same is_campaign_member policy
-- party_inventory already uses for every one of its four operations. So "the
-- DM can add to the party's pool" costs nothing new -- the DM is a member, and
-- members already can.
--
-- Both adjustments go through a single-statement atomic RPC rather than a
-- plain PostgREST update, for 030/032's reason: two adds (or an add racing a
-- spend) in the same instant must not lose one of them. Unlike
-- decrement_character_inventory_item / decrement_party_inventory_item, these
-- need no SELECT ... FOR UPDATE lock -- those two exist because "decrement,
-- but DELETE at the last one" is a branch (quantity has a `> 0` CHECK, so 0
-- isn't storable), and the lock is what keeps a concurrent add from landing in
-- the window between the failed decrement and the delete. A purse has no such
-- branch: it can sit at exactly 0 forever. So one `UPDATE ... WHERE col +
-- delta >= 0 RETURNING col` is already atomic on its own -- Postgres holds the
-- row lock for the statement's duration, and a second concurrent call
-- re-evaluates the WHERE clause against the first call's result once it gets
-- the lock. `delta` is signed: positive to add, negative to spend, and the
-- WHERE clause's floor is what turns an overdraw into a clean zero-row result
-- instead of a CHECK violation.
--
-- No auto-conversion between denominations (100 cp does not become 1 gp on
-- its own) -- see KNOWN_ISSUES.md.

begin;

-- ---------------------------------------------------------------------------
-- 1. characters: five columns, owner-writable by the existing policy
-- ---------------------------------------------------------------------------

-- Not added to pin_character_row's blocklist -- these five have to stay
-- client-writable by the owner, unlike id/campaign_id/user_id/created_at.
alter table public.characters
  add column copper   int not null default 0 check (copper   >= 0),
  add column silver   int not null default 0 check (silver   >= 0),
  add column electrum int not null default 0 check (electrum >= 0),
  add column gold     int not null default 0 check (gold     >= 0),
  add column platinum int not null default 0 check (platinum >= 0);

-- ---------------------------------------------------------------------------
-- 2. party_currency: one row per campaign, the party's shared pool
-- ---------------------------------------------------------------------------

-- No created_at/updated_at, unlike party_inventory. That table is an
-- event-sourced pile -- when a stack was added is a fact about it. This is a
-- single running balance; there is no moment worth stamping.
create table public.party_currency (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  copper      int not null default 0 check (copper   >= 0),
  silver      int not null default 0 check (silver   >= 0),
  electrum    int not null default 0 check (electrum >= 0),
  gold        int not null default 0 check (gold     >= 0),
  platinum    int not null default 0 check (platinum >= 0)
);

alter table public.party_currency enable row level security;

create policy "members read party currency"
  on public.party_currency for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "members update party currency"
  on public.party_currency for update to authenticated
  using (public.is_campaign_member(campaign_id))
  with check (public.is_campaign_member(campaign_id));

-- No INSERT policy. A row is only ever created by create_campaign (security
-- definer, bypasses RLS) or by the backfill directly below (run as the
-- migration's own role) -- never by a client, so there is nothing to gate.

-- ---------------------------------------------------------------------------
-- 3. backfill existing campaigns, and seed new ones going forward
-- ---------------------------------------------------------------------------

insert into public.party_currency (campaign_id)
select id from public.campaigns
on conflict (campaign_id) do nothing;

-- create or replace, not a new migration touching 014's function body from
-- outside: this is the same function with one insert added, and the two lines
-- around it are copied verbatim so a diff of this file against 014 shows
-- exactly the one line that changed.
create or replace function public.create_campaign(campaign_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_id uuid;
begin
  if not public.is_dm() then
    raise exception 'only a DM may create a campaign';
  end if;

  insert into campaigns (name) values (campaign_name)
  returning id into new_id;

  insert into campaign_members (campaign_id, user_id, role)
  values (new_id, auth.uid(), 'dm');

  insert into party_currency (campaign_id) values (new_id);

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. adjust_character_currency / adjust_party_currency
-- ---------------------------------------------------------------------------

-- Two functions rather than one taking a table name, 032's reason: a function
-- that picked its target table at runtime needs dynamic SQL or SECURITY
-- DEFINER, and either gives up the thing that makes this safe -- that the
-- UPDATE inside runs as the caller and is decided by the target table's own
-- RLS policy.
--
-- denomination is validated by IF/ELSIF against a fixed list rather than a SQL
-- enum or a lookup table, 039's reasoning for feats.category: the set is
-- small, closed, and a new denomination is rare enough to deserve a migration.
--
-- SECURITY INVOKER: RLS remains the boundary. A character update runs through
-- "owner updates own character" (owner-only, no DM path); a party_currency
-- update runs through "members update party currency" (any campaign member).
-- No grant/revoke, matching 032's two decrement functions -- an unauthorized
-- caller gets a zero-row result from RLS, not a bypass.
create or replace function public.adjust_character_currency(
  target_character uuid,
  denomination text,
  delta int
)
 returns int
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
declare
  result int;
begin
  if denomination = 'copper' then
    update characters set copper = copper + delta
      where id = target_character and copper + delta >= 0
      returning copper into result;
  elsif denomination = 'silver' then
    update characters set silver = silver + delta
      where id = target_character and silver + delta >= 0
      returning silver into result;
  elsif denomination = 'electrum' then
    update characters set electrum = electrum + delta
      where id = target_character and electrum + delta >= 0
      returning electrum into result;
  elsif denomination = 'gold' then
    update characters set gold = gold + delta
      where id = target_character and gold + delta >= 0
      returning gold into result;
  elsif denomination = 'platinum' then
    update characters set platinum = platinum + delta
      where id = target_character and platinum + delta >= 0
      returning platinum into result;
  else
    raise exception 'invalid denomination: %', denomination;
  end if;

  return result;
end;
$function$
;

create or replace function public.adjust_party_currency(
  target_campaign uuid,
  denomination text,
  delta int
)
 returns int
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
declare
  result int;
begin
  if denomination = 'copper' then
    update party_currency set copper = copper + delta
      where campaign_id = target_campaign and copper + delta >= 0
      returning copper into result;
  elsif denomination = 'silver' then
    update party_currency set silver = silver + delta
      where campaign_id = target_campaign and silver + delta >= 0
      returning silver into result;
  elsif denomination = 'electrum' then
    update party_currency set electrum = electrum + delta
      where campaign_id = target_campaign and electrum + delta >= 0
      returning electrum into result;
  elsif denomination = 'gold' then
    update party_currency set gold = gold + delta
      where campaign_id = target_campaign and gold + delta >= 0
      returning gold into result;
  elsif denomination = 'platinum' then
    update party_currency set platinum = platinum + delta
      where campaign_id = target_campaign and platinum + delta >= 0
      returning platinum into result;
  else
    raise exception 'invalid denomination: %', denomination;
  end if;

  return result;
end;
$function$
;

insert into public.schema_migrations (version) values ('045');

commit;

-- ---------------------------------------------------------------------------
-- verification -- run one block at a time (the SQL editor only renders the
-- last result set of a paste); every block runs in its own transaction and
-- ends in rollback, so re-running any of them against the live database is
-- always safe.
--
-- Setup for every block below: two members of the same campaign (player A
-- owns a character, player B owns a different one) plus that campaign's DM,
-- in explicit transactions with `set local role authenticated` and
-- request.jwt.claims naming the relevant user id.
-- ---------------------------------------------------------------------------

-- BLOCK 1 -- A adds to their own purse, then spends it back down to exactly 0.
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<A>"}';
--   select adjust_character_currency('<A''s character id>', 'gold', 50);  -- -> 50
--   select adjust_character_currency('<A''s character id>', 'gold', -50); -- -> 0
-- rollback;

-- BLOCK 2 -- A tries to overdraw. No exception -- a clean NULL, the same shape
-- PostgREST already returns for a zero-row update everywhere else in this app.
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<A>"}';
--   select adjust_character_currency('<A''s character id>', 'gold', -1);  -- -> null
-- rollback;

-- BLOCK 3 -- B tries to adjust A's purse. Same null shape as an overdraw --
-- "owner updates own character" simply doesn't match the row.
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<B>"}';
--   select adjust_character_currency('<A''s character id>', 'gold', 10);  -- -> null
-- rollback;

-- BLOCK 4 -- the DM, who is not A, still cannot touch A's purse -- confirming
-- there is no DM path onto a character's own currency, unlike character_inventory.
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<DM>"}';
--   select adjust_character_currency('<A''s character id>', 'gold', 10);  -- -> null
-- rollback;

-- BLOCK 5 -- any campaign member, including the DM, CAN adjust the shared pool.
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<DM>"}';
--   select adjust_party_currency('<campaign id>', 'gold', 100);  -- -> 100
--   set local request.jwt.claims = '{"sub": "<B>"}';
--   select adjust_party_currency('<campaign id>', 'gold', -30);  -- -> 70
-- rollback;

-- BLOCK 6 -- a non-member of the campaign gets null on both tables.
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<outsider>"}';
--   select adjust_character_currency('<A''s character id>', 'gold', 1);  -- -> null
--   select adjust_party_currency('<campaign id>', 'gold', 1);            -- -> null
-- rollback;

-- If any RPC comes back 404/PGRST202 after this runs, that is the schema
-- cache, not a missing function: `notify pgrst, 'reload schema';`.
--
-- Then regenerate the client types: npm run gen:types
-- ---------------------------------------------------------------------------

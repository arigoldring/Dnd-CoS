-- Player characters, one per player per campaign, each with an inventory the
-- whole campaign can read.
--
-- The two tables draw one new line the app hasn't had before: the identity row
-- (characters) is the owner's alone -- the DM cannot rename or delete a
-- player's PC -- while the inventory row is shared-write between owner and DM,
-- so a DM can hand out loot mid-session. can_edit_character below is that
-- line's predicate, and it is deliberately used ONLY on character_inventory.
--
-- Pre-flight, because the composite FK below needs a PK or unique on exactly
-- (campaign_id, user_id) and fails the whole transaction without one:
--
--   select conname, contype, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.campaign_members'::regclass
--     and contype in ('p','u');
--
-- Expect campaign_members_pkey / PRIMARY KEY (campaign_id, user_id).

begin;

-- ---------------------------------------------------------------------------
-- characters
-- ---------------------------------------------------------------------------

create table public.characters (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  user_id     uuid not null,
  -- Rejects untrimmed input rather than tolerating it. `name = trim(name)` is
  -- the clause doing the real work: without it "  Ireena  " stores its padding
  -- and then sorts and compares wrong against "Ireena" forever after. There is
  -- no definer function trimming on the way in the way set_display_name does,
  -- so a sloppy client has to be a visible error instead of silent corruption.
  -- It also makes the length cap post-trim for free -- otherwise 50 characters
  -- plus padding squeaks through.
  name        text not null check (name = trim(name) and name <> '' and length(name) <= 50),
  created_at  timestamptz not null default now(),

  -- Composite FK to campaign_members' PK, not two FKs to campaigns and
  -- profiles: this makes "a character for a non-member" unrepresentable, and
  -- the cascade means leaving a campaign takes your character (and, via
  -- character_inventory's cascade, its loot) with you.
  foreign key (campaign_id, user_id)
    references public.campaign_members (campaign_id, user_id)
    on delete cascade,

  -- One character per player per campaign. Reset = delete the row and create
  -- a fresh one; there is no retired_at, by decision.
  unique (campaign_id, user_id)
);

alter table public.characters enable row level security;

create policy "members read characters"
  on public.characters for select to authenticated
  using (public.is_campaign_member(campaign_id));

-- Both conditions matter: user_id = auth.uid() stops creating a character in
-- someone else's name, is_campaign_member stops a member of nothing inserting
-- at all. (The composite FK would also reject a non-member, but as an error;
-- the policy makes it a clean RLS denial like everywhere else.)
create policy "owner creates own character"
  on public.characters for insert to authenticated
  with check (user_id = auth.uid() and public.is_campaign_member(campaign_id));

-- Owner only -- NOT can_edit_character. The DM's write access covers the
-- inventory, not the identity row; using the helper here would widen rename
-- and delete to the DM, which is exactly the line this migration draws.
create policy "owner updates own character"
  on public.characters for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "owner deletes own character"
  on public.characters for delete to authenticated
  using (user_id = auth.uid());

-- Same job as stamp_session_recap: RLS can't restrict columns, so without this,
-- "user_id = auth.uid() in both clauses" still lets an owner UPDATE their
-- character from one campaign they're in to another -- both clauses pass on
-- both sides. After pinning, an update can change name and nothing else.
create or replace function public.pin_character_row()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
begin
  new.id          := old.id;
  new.campaign_id := old.campaign_id;
  new.user_id     := old.user_id;
  new.created_at  := old.created_at;
  return new;
end;
$function$
;

create trigger pin_character_row
  before update on public.characters
  for each row execute function public.pin_character_row();

-- ---------------------------------------------------------------------------
-- can_edit_character -- owner or the campaign's DM
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER, and that is load-bearing: the select on characters runs as
-- the caller and answers through "members read characters" above, so a
-- character the caller can't see is one they can't write to -- the same
-- fail-closed join that gates location_dm_notes, packaged as a function
-- because four policies need it. No recursion risk (this reads characters, and
-- is never called from a policy on characters), and no grants needed: invoker
-- rights mean an anonymous caller just gets false out of reads RLS already
-- governs, the same reason is_campaign_member skips its revoke.
--
-- Do not use this on characters' own policies. The row is already in scope
-- there, so it would only restate the owner check today -- but the moment
-- someone reuses it in a SELECT policy on characters it recurses, which is the
-- trap is_campaign_dm had to go definer to escape.
create or replace function public.can_edit_character(target_character uuid)
 returns boolean
 language sql
 security invoker
 set search_path to 'public'
 stable
as $function$
  select exists (
    select 1 from characters c
    where c.id = target_character
      and (c.user_id = auth.uid() or public.is_campaign_dm(c.campaign_id))
  );
$function$
;

-- ---------------------------------------------------------------------------
-- character_inventory
-- ---------------------------------------------------------------------------

-- No campaign_id, on the same argument location_dm_notes settles: the campaign
-- is one join away through character_id, and a second copy could only ever
-- disagree.
create table public.character_inventory (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete cascade,
  quantity     int not null default 1 check (quantity > 0),
  added_by     uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Postgres indexes the referenced side of an FK automatically, never the
-- referencing side. Every read of a sheet filters on this column and the SELECT
-- policy's subquery hits characters per row, so the one table in this migration
-- that gets no index for free is the one that needs it most -- characters got
-- its own from the unique constraint.
create index character_inventory_character_id_idx
  on public.character_inventory (character_id);

alter table public.character_inventory enable row level security;

-- Visibility is exactly "can you see the character": the subquery runs as the
-- invoker, so it answers through characters' SELECT policy. Campaign members
-- pass, everyone else gets zero rows.
--
-- character_inventory.character_id is written out rather than left bare. Bare,
-- it resolves to the outer relation only because characters has no column of
-- that name -- correct by accident, and silently wrong the day characters gains
-- one.
create policy "character viewers read inventory"
  on public.character_inventory for select to authenticated
  using (
    exists (
      select 1 from characters c
      where c.id = character_inventory.character_id
    )
  );

create policy "owner or dm adds to inventory"
  on public.character_inventory for insert to authenticated
  with check (public.can_edit_character(character_id));

-- Both clauses, so an update can't re-point a row at a character the caller
-- can't edit. character_id isn't pinned by a trigger here -- moving an entry
-- between two characters you can edit is harmless, unlike moving a character
-- between campaigns.
create policy "owner or dm updates inventory"
  on public.character_inventory for update to authenticated
  using (public.can_edit_character(character_id))
  with check (public.can_edit_character(character_id));

create policy "owner or dm removes from inventory"
  on public.character_inventory for delete to authenticated
  using (public.can_edit_character(character_id));

commit;

-- ---------------------------------------------------------------------------
-- verification -- run before touching client code
--
-- As two members of the same campaign (player A owns a character, player B
-- doesn't own it) plus that campaign's DM, in explicit transactions with
-- `set local role authenticated` and request.jwt.claims:
--
--   1. B reads A's character and its inventory        -> rows come back
--   2. B inserts into A's inventory                    -> denied
--   3. the DM inserts into A's inventory               -> row goes in
--   4. the DM renames A's character                    -> zero rows updated
--
-- Case 4 is the one to distrust: it is the line between the two tables, and
-- both "too permissive" and "too restrictive" look identical in the UI.
-- And as a non-member: both tables return zero rows.
-- ---------------------------------------------------------------------------

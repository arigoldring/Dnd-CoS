begin;

create table public.party_inventory (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.party_inventory enable row level security;

create policy "members read party inventory"
  on public.party_inventory for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "members add to party inventory"
  on public.party_inventory for insert to authenticated
  with check (public.is_campaign_member(campaign_id));

create policy "members update party inventory"
  on public.party_inventory for update to authenticated
  using (public.is_campaign_member(campaign_id))
  with check (public.is_campaign_member(campaign_id));

create policy "members remove from party inventory"
  on public.party_inventory for delete to authenticated
  using (public.is_campaign_member(campaign_id));

commit;
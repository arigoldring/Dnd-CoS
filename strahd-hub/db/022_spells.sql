-- Create the spells table, mirroring items' nullable campaign_id design: null means
-- shared SRD catalogue (reachable by all campaigns), a non-null value marks one
-- campaign's homebrew spell. Read policy reuses is_campaign_member like items does.
--
-- No insert/update/delete policy yet — spells are read-only to players for now,
-- matching items' current state where homebrew authoring is future scope.

begin;

create table public.spells (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,

  name text not null,
  level int not null check (level between 0 and 9),
  school text not null check (school in (
    'abjuration', 'conjuration', 'divination', 'enchantment',
    'evocation', 'illusion', 'necromancy', 'transmutation'
  )),

  casting_time text not null,
  range text not null,
  verbal boolean not null default false,
  somatic boolean not null default false,
  material boolean not null default false,
  material_component text,

  duration text not null,
  concentration boolean not null default false,
  ritual boolean not null default false,

  classes text[] not null default '{}',
  description text not null,
  higher_levels text,
  tags text[] not null default '{}',

  created_at timestamptz not null default now(),

  constraint material_component_requires_material check (
    material_component is null or material
  )
);

create index on public.spells (campaign_id);

alter table public.spells enable row level security;

create policy "read shared and own-campaign spells"
  on public.spells for select to authenticated
  using (
    campaign_id is null
    or public.is_campaign_member(campaign_id)
  );

commit;

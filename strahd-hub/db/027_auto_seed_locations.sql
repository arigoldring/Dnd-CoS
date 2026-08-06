-- Auto-seed locations when a new campaign is created.
-- Whenever a DM creates a campaign, it automatically gets the standard Curse of Strahd locations.

create or replace function public.seed_campaign_locations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Insert the standard Curse of Strahd locations for the new campaign
  with seeded as (
    insert into locations (name, x, y, description, is_revealed, campaign_id) values
      ('Village of Barovia',      78.5, 61.3, 'Cursed Town',                                                     true,  NEW.id),
      ('Tser Falls',              56.8, 55.9, 'Thundering falls above the Vistani camp at Tser Pool.',            true,  NEW.id),
      ('Vallaki',                 39.8, 33.4, 'Walled town ruled by a paranoid baron.',                           true,  NEW.id),
      ('Krezk',                   11.2, 29.9, 'Remote walled village guarding the Abbey of Saint Markovia.',      true,  NEW.id),
      ('Castle Ravenloft',        71.0, 51.2, 'Strahd''s mountaintop fortress, seat of the land''s curse.',       true,  NEW.id),
      ('Abbey of Saint Markovia',  8.4, 22.6, 'Ruined abbey on the heights above Krezk.',                        false, NEW.id)
    returning id, name
  )
  insert into location_dm_notes (location_id, notes)
  select id, notes
  from seeded
  join (values
    ('Castle Ravenloft',        'Strahd is home. The Heart of Sorrow beats in the north tower.'),
    ('Abbey of Saint Markovia', 'The Abbot dwells here with his mongrelfolk flock.')
  ) as dm_notes(name, notes) using (name);

  return NEW;
end;
$function$;

-- Trigger that fires on every new campaign creation
create trigger seed_locations_on_campaign_create
after insert on campaigns
for each row
execute function public.seed_campaign_locations();

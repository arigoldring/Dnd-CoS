-- Reseed locations with campaign scoping after the campaign migration.
-- This reapplies the location seed data that was originally in 015_campaign_scoping.sql
-- but may have been lost or not properly applied to existing databases.

truncate locations cascade;

with seeded as (
  insert into locations (name, x, y, description, is_revealed, campaign_id) values
    ('Village of Barovia',      78.5, 61.3, 'Cursed Town',                                                     true,  '00000000-0000-0000-0000-000000000001'),
    ('Tser Falls',              56.8, 55.9, 'Thundering falls above the Vistani camp at Tser Pool.',            true,  '00000000-0000-0000-0000-000000000001'),
    ('Vallaki',                 39.8, 33.4, 'Walled town ruled by a paranoid baron.',                           true,  '00000000-0000-0000-0000-000000000001'),
    ('Krezk',                   11.2, 29.9, 'Remote walled village guarding the Abbey of Saint Markovia.',      true,  '00000000-0000-0000-0000-000000000001'),
    ('Castle Ravenloft',        71.0, 51.2, 'Strahd''s mountaintop fortress, seat of the land''s curse.',       true,  '00000000-0000-0000-0000-000000000001'),
    ('Abbey of Saint Markovia',  8.4, 22.6, 'Ruined abbey on the heights above Krezk.',                        false, '00000000-0000-0000-0000-000000000001')
  returning id, name
)
insert into location_dm_notes (location_id, notes)
select id, notes
from seeded
join (values
  ('Castle Ravenloft',        'Strahd is home. The Heart of Sorrow beats in the north tower.'),
  ('Abbey of Saint Markovia', 'The Abbot dwells here with his mongrelfolk flock.')
) as dm_notes(name, notes) using (name);

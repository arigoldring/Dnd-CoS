-- Seed the current map locations (from Maps.tsx) and their DM notes.
-- IDs are left to the uuid default; DM notes are tied back to their
-- location by name via the RETURNING clause, so we never hardcode uuids.

with seeded as (
  insert into locations (name, x, y, description, is_revealed) values
    ('Village of Barovia',      78.5, 61.3, 'Cursed Town',                                                     true),
    ('Tser Falls',              56.8, 55.9, 'Thundering falls above the Vistani camp at Tser Pool.',            true),
    ('Vallaki',                 39.8, 33.4, 'Walled town ruled by a paranoid baron.',                           true),
    ('Krezk',                   11.2, 29.9, 'Remote walled village guarding the Abbey of Saint Markovia.',      true),
    ('Castle Ravenloft',        71.0, 51.2, 'Strahd''s mountaintop fortress, seat of the land''s curse.',       true),
    ('Abbey of Saint Markovia',  8.4, 22.6, 'Ruined abbey on the heights above Krezk.',                        false)
  returning id, name
)
insert into location_dm_notes (location_id, notes)
select id, notes
from seeded
join (values
  ('Castle Ravenloft',        'Strahd is home. The Heart of Sorrow beats in the north tower.'),
  ('Abbey of Saint Markovia', 'The Abbot dwells here with his mongrelfolk flock.')
) as dm_notes(name, notes) using (name);

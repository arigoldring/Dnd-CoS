update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d4', damage_type = 'bludgeoning',
  properties = array['light'],
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Club';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d4', damage_type = 'piercing',
  properties = array['finesse', 'light', 'thrown'],
  range_normal = 20, range_long = 60,
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Dagger';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d8', damage_type = 'bludgeoning',
  properties = array['two-handed'],
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Greatclub';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d6', damage_type = 'slashing',
  properties = array['light', 'thrown'],
  range_normal = 20, range_long = 60,
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Handaxe';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d6', damage_type = 'piercing',
  properties = array['thrown'],
  range_normal = 30, range_long = 120,
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Javelin';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d4', damage_type = 'bludgeoning',
  properties = array['light', 'thrown'],
  range_normal = 20, range_long = 60,
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Light Hammer';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d6', damage_type = 'bludgeoning',
  properties = '{}',
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Mace';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d6', damage_type = 'bludgeoning',
  properties = array['versatile'],
  versatile_dice = '1d8',
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Quarterstaff';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d4', damage_type = 'slashing',
  properties = array['light'],
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Sickle';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d6', damage_type = 'piercing',
  properties = array['thrown', 'versatile'],
  range_normal = 20, range_long = 60,
  versatile_dice = '1d8',
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Spear';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d8', damage_type = 'piercing',
  properties = array['ammunition', 'loading', 'two-handed'],
  range_normal = 80, range_long = 320,
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Crossbow, Light';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d4', damage_type = 'piercing',
  properties = array['finesse', 'thrown'],
  range_normal = 20, range_long = 60,
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Dart';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d6', damage_type = 'piercing',
  properties = array['ammunition', 'two-handed'],
  range_normal = 80, range_long = 320,
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Shortbow';

update items set
  kind = 'weapon', weapon_category = 'simple',
  damage_dice = '1d4', damage_type = 'bludgeoning',
  properties = array['ammunition'],
  range_normal = 30, range_long = 120,
  tags = array_remove(array_remove(tags, 'weapon'), 'simple')
where name = 'Sling';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1d8', damage_type = 'slashing',
  properties = array['versatile'],
  versatile_dice = '1d10',
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Battleaxe';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1d8', damage_type = 'bludgeoning',
  properties = '{}',
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Flail';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1d10', damage_type = 'slashing',
  properties = array['heavy', 'reach', 'two-handed'],
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Glaive';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1d12', damage_type = 'slashing',
  properties = array['heavy', 'two-handed'],
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Greataxe';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '2d6', damage_type = 'slashing',
  properties = array['heavy', 'two-handed'],
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Greatsword';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1d10', damage_type = 'slashing',
  properties = array['heavy', 'reach', 'two-handed'],
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Halberd';
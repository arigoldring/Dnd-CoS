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

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1d8', damage_type = 'bludgeoning',
  properties = array['versatile'],
  versatile_dice = '1d10',
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Warhammer';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1d4', damage_type = 'slashing',
  properties = array['finesse', 'reach'],
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Whip';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1', damage_type = 'piercing',
  properties = array['ammunition', 'loading'],
  range_normal = 25, range_long = 100,
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Blowgun';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1d6', damage_type = 'piercing',
  properties = array['ammunition', 'light', 'loading'],
  range_normal = 30, range_long = 120,
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Crossbow, Hand';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1d10', damage_type = 'piercing',
  properties = array['ammunition', 'heavy', 'loading', 'two-handed'],
  range_normal = 100, range_long = 400,
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Crossbow, Heavy';

update items set
  kind = 'weapon', weapon_category = 'martial',
  damage_dice = '1d8', damage_type = 'piercing',
  properties = array['ammunition', 'heavy', 'two-handed'],
  range_normal = 150, range_long = 600,
  tags = array_remove(array_remove(tags, 'weapon'), 'martial')
where name = 'Longbow';

update items set
  kind = 'armor', armor_category = 'light',
  base_armor_class = 12, stealth_disadvantage = false,
  tags = array_remove(array_remove(tags, 'armor'), 'light armor')
where name = 'Studded leather Armor';

update items set
  kind = 'armor', armor_category = 'medium',
  base_armor_class = 12, stealth_disadvantage = false,
  tags = array_remove(array_remove(tags, 'armor'), 'medium armor')
where name = 'Hide Armor';

update items set
  kind = 'armor', armor_category = 'medium',
  base_armor_class = 13, stealth_disadvantage = false,
  tags = array_remove(array_remove(tags, 'armor'), 'medium armor')
where name = 'Chain Shirt';

update items set
  kind = 'armor', armor_category = 'medium',
  base_armor_class = 14, stealth_disadvantage = true,
  tags = array_remove(array_remove(tags, 'armor'), 'medium armor')
where name = 'Scale Mail';

update items set
  kind = 'armor', armor_category = 'medium',
  base_armor_class = 14, stealth_disadvantage = true,
  tags = array_remove(array_remove(tags, 'armor'), 'medium armor')
where name = 'Spiked Armor';

update items set
  kind = 'armor', armor_category = 'medium',
  base_armor_class = 14, stealth_disadvantage = false,
  tags = array_remove(array_remove(tags, 'armor'), 'medium armor')
where name = 'Breastplate';

update items set
  kind = 'armor', armor_category = 'medium',
  base_armor_class = 15, stealth_disadvantage = true,
  tags = array_remove(array_remove(tags, 'armor'), 'medium armor')
where name = 'Halfplate';

update items set
  kind = 'armor', armor_category = 'heavy',
  base_armor_class = 14, stealth_disadvantage = true,
  tags = array_remove(array_remove(tags, 'armor'), 'heavy armor')
where name = 'Ring Mail';

update items set
  kind = 'armor', armor_category = 'heavy',
  base_armor_class = 16, strength_requirement = 13, stealth_disadvantage = true,
  tags = array_remove(array_remove(tags, 'armor'), 'heavy armor')
where name = 'Chain Mail';

update items set
  kind = 'armor', armor_category = 'heavy',
  base_armor_class = 17, strength_requirement = 15, stealth_disadvantage = true,
  tags = array_remove(array_remove(tags, 'armor'), 'heavy armor')
where name = 'Splint';

update items set
  kind = 'armor', armor_category = 'heavy',
  base_armor_class = 18, strength_requirement = 15, stealth_disadvantage = true,
  tags = array_remove(array_remove(tags, 'armor'), 'heavy armor')
where name = 'Plate';

update items set
  kind = 'armor', armor_category = 'shield',
  base_armor_class = 2, stealth_disadvantage = false,
  tags = array_remove(array_remove(tags, 'armor'), 'shield')
where name = 'Shield';

update items set
  kind = 'armor', armor_category = 'light',
  base_armor_class = 11, stealth_disadvantage = false,
  tags = array_remove(array_remove(tags, 'armor'), 'light armor')
where name = 'Leather Armor';

update items set
  kind = 'armor', armor_category = 'light',
  base_armor_class = 11, stealth_disadvantage = true,
  tags = array_remove(array_remove(tags, 'armor'), 'light armor')
where name = 'Padded Armor';
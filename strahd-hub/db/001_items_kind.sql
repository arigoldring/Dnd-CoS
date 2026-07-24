alter table public.items
  add column kind text not null default 'general'
    check (kind in ('general', 'weapon', 'armor')),

  add column weapon_category text
    check (weapon_category in ('simple', 'martial')),
  add column damage_dice text,
  add column damage_type text
    check (damage_type in (
      'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
      'necrotic', 'piercing', 'poison', 'psychic', 'radiant',
      'slashing', 'thunder'
    )),
  add column properties text[],
  add column versatile_dice text,
  add column range_normal integer,
  add column range_long integer,

  add column armor_category text
    check (armor_category in ('light', 'medium', 'heavy', 'shield')),
  add column base_armor_class integer,
  add column strength_requirement integer,
  add column stealth_disadvantage boolean;

alter table public.items
  add constraint weapon_fields_required check (
    kind <> 'weapon' or (
      weapon_category is not null
      and damage_dice is not null
      and damage_type is not null
    )
  ),
  add constraint weapon_fields_absent check (
    kind = 'weapon' or (
      weapon_category is null
      and damage_dice is null
      and damage_type is null
      and properties is null
      and versatile_dice is null
      and range_normal is null
      and range_long is null
    )
  ),
  add constraint armor_fields_required check (
    kind <> 'armor' or (
      armor_category is not null
      and base_armor_class is not null
      and stealth_disadvantage is not null
    )
  ),
  add constraint armor_fields_absent check (
    kind = 'armor' or (
      armor_category is null
      and base_armor_class is null
      and stealth_disadvantage is null
      and strength_requirement is null
    )
  );
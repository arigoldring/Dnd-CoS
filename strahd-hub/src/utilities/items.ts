export interface Item {
    name: string;
    price: number;
    description: string;
    tags: string[];
}

export const ITEMS: Item[] = [
  
  {
    name: "Leather Armor",
    price: 10,
    description: "Sets AC to 11, disadvantage on Stealth",
    tags: ["armor", "light armor"],
  },
  {
    name: "Padded Armor",
    price: 5,
    description: "Sets AC to 11",
    tags: ["armor", "light armor"],
  },
  {
    name: "Studded leather Armor",
    price: 45,
    description: "Sets AC to 12",
    tags: ["armor", "light armor"],
  },
  {
    name: "Hide Armor",
    price: 10,
    description: "Sets AC to 12 + Dex modifier (max 2)",
    tags: ["armor", "medium armor"],
  },
  {
    name: "Chain Shirt",
    price: 50,
    description: "Sets AC to 13 + Dex modifier (max 2)",
    tags: ["armor", "medium armor"],
  },
  {
    name: "Scale Mail",
    price: 50,
    description:
      "Sets AC to 14 + Dex modifier (max 2), disadvantage on Stealth",
    tags: ["armor", "medium armor"],
  },
  {
    name: "Spiked Armor",
    price: 75,
    description:
      "Sets AC to 14 + Dex modifier (max 2), disadvantage on Stealth",
    tags: ["armor", "medium armor"],
  },
  {
    name: "Breastplate",
    price: 400,
    description: "Sets AC to 14 + Dex modifier (max 2)",
    tags: ["armor", "medium armor"],
  },
  {
    name: "Halfplate",
    price: 750,
    description:
      "Sets AC to 15 + Dex modifier (max 2), disadvantage on Stealth",
    tags: ["armor", "medium armor"],
  },
  {
    name: "Ring Mail",
    price: 30,
    description: "Sets AC to 14, disadvantage on Stealth",
    tags: ["armor", "heavy armor"],
  },
  {
    name: "Chain Mail",
    price: 75,
    description: "Sets AC to 16, requires Str 13, disadvantage on Stealth",
    tags: ["armor", "heavy armor"],
  },
  {
    name: "Splint",
    price: 200,
    description: "Sets AC to 17, requires Str 15, disadvantage on Stealth",
    tags: ["armor", "heavy armor"],
  },
  {
    name: "Plate",
    price: 1500,
    description: "Sets AC to 18, requires Str 15, disadvantage on Stealth",
    tags: ["armor", "heavy armor"],
  },
  {
    name: "Shield",
    price: 10,
    description: "Adds +2 to AC",
    tags: ["armor", "shield"],
  },
  // Simple Melee Weapons
{ name: "Club", price: 0.1, description: "1d4 bludgeoning. Light.", tags: ["weapon", "simple", "melee"] },
{ name: "Dagger", price: 2, description: "1d4 piercing. Finesse, light, thrown (range 20/60).", tags: ["weapon", "simple", "melee"] },
{ name: "Greatclub", price: 0.2, description: "1d8 bludgeoning. Two-handed.", tags: ["weapon", "simple", "melee"] },
{ name: "Handaxe", price: 5, description: "1d6 slashing. Light, thrown (range 20/60).", tags: ["weapon", "simple", "melee"] },
{ name: "Javelin", price: 0.5, description: "1d6 piercing. Thrown (range 30/120).", tags: ["weapon", "simple", "melee"] },
{ name: "Light Hammer", price: 2, description: "1d4 bludgeoning. Light, thrown (range 20/60).", tags: ["weapon", "simple", "melee"] },
{ name: "Mace", price: 5, description: "1d6 bludgeoning.", tags: ["weapon", "simple", "melee"] },
{ name: "Quarterstaff", price: 0.2, description: "1d6 bludgeoning. Versatile (1d8).", tags: ["weapon", "simple", "melee"] },
{ name: "Sickle", price: 1, description: "1d4 slashing. Light.", tags: ["weapon", "simple", "melee"] },
{ name: "Spear", price: 1, description: "1d6 piercing. Thrown (range 20/60), versatile (1d8).", tags: ["weapon", "simple", "melee"] },

// Simple Ranged Weapons
{ name: "Crossbow, Light", price: 25, description: "1d8 piercing. Ammunition (range 80/320), loading, two-handed.", tags: ["weapon", "simple", "ranged"] },
{ name: "Dart", price: 0.05, description: "1d4 piercing. Finesse, thrown (range 20/60).", tags: ["weapon", "simple", "ranged"] },
{ name: "Shortbow", price: 25, description: "1d6 piercing. Ammunition (range 80/320), two-handed.", tags: ["weapon", "simple", "ranged"] },
{ name: "Sling", price: 0.1, description: "1d4 bludgeoning. Ammunition (range 30/120).", tags: ["weapon", "simple", "ranged"] },

// Martial Melee Weapons
{ name: "Battleaxe", price: 10, description: "1d8 slashing. Versatile (1d10).", tags: ["weapon", "martial", "melee"] },
{ name: "Flail", price: 10, description: "1d8 bludgeoning.", tags: ["weapon", "martial", "melee"] },
{ name: "Glaive", price: 20, description: "1d10 slashing. Heavy, reach, two-handed.", tags: ["weapon", "martial", "melee"] },
{ name: "Greataxe", price: 30, description: "1d12 slashing. Heavy, two-handed.", tags: ["weapon", "martial", "melee"] },
{ name: "Greatsword", price: 50, description: "2d6 slashing. Heavy, two-handed.", tags: ["weapon", "martial", "melee"] },
{ name: "Halberd", price: 20, description: "1d10 slashing. Heavy, reach, two-handed.", tags: ["weapon", "martial", "melee"] },
{ name: "Lance", price: 10, description: "1d12 piercing. Reach, special.", tags: ["weapon", "martial", "melee"] },
{ name: "Longsword", price: 15, description: "1d8 slashing. Versatile (1d10).", tags: ["weapon", "martial", "melee"] },
{ name: "Maul", price: 10, description: "2d6 bludgeoning. Heavy, two-handed.", tags: ["weapon", "martial", "melee"] },
{ name: "Morningstar", price: 15, description: "1d8 piercing.", tags: ["weapon", "martial", "melee"] },
{ name: "Pike", price: 5, description: "1d10 piercing. Heavy, reach, two-handed.", tags: ["weapon", "martial", "melee"] },
{ name: "Rapier", price: 25, description: "1d8 piercing. Finesse.", tags: ["weapon", "martial", "melee"] },
{ name: "Scimitar", price: 25, description: "1d6 slashing. Finesse, light.", tags: ["weapon", "martial", "melee"] },
{ name: "Shortsword", price: 10, description: "1d6 piercing. Finesse, light.", tags: ["weapon", "martial", "melee"] },
{ name: "Trident", price: 5, description: "1d6 piercing. Thrown (range 20/60), versatile (1d8).", tags: ["weapon", "martial", "melee"] },
{ name: "War Pick", price: 5, description: "1d8 piercing.", tags: ["weapon", "martial", "melee"] },
{ name: "Warhammer", price: 15, description: "1d8 bludgeoning. Versatile (1d10).", tags: ["weapon", "martial", "melee"] },
{ name: "Whip", price: 2, description: "1d4 slashing. Finesse, reach.", tags: ["weapon", "martial", "melee"] },

// Martial Ranged Weapons
{ name: "Blowgun", price: 10, description: "1 piercing. Ammunition (range 25/100), loading.", tags: ["weapon", "martial", "ranged"] },
{ name: "Crossbow, Hand", price: 75, description: "1d6 piercing. Ammunition (range 30/120), light, loading.", tags: ["weapon", "martial", "ranged"] },
{ name: "Crossbow, Heavy", price: 50, description: "1d10 piercing. Ammunition (range 100/400), heavy, loading, two-handed.", tags: ["weapon", "martial", "ranged"] },
{ name: "Longbow", price: 50, description: "1d8 piercing. Ammunition (range 150/600), heavy, two-handed.", tags: ["weapon", "martial", "ranged"] },
{ name: "Net", price: 1, description: "Special, thrown (range 5/15).", tags: ["weapon", "martial", "ranged"] },
];
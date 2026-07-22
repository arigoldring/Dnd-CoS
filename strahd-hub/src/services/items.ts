import { supabase } from "../lib/supabase";
/**
 * Using 2 interfaces on purpose
 * ItemRow: what the item table from supabase returns
 * Item: How the rest of the application sees an item
 * Biggest Change in the conversation from price in copper to price in gold
 */
interface ItemRow {
  id: string;
  name: string;
  description: string;
  price_cp: number;
  tags: string[];
  created_at: string;
  kind: string;

  weapon_category: string | null;
  damage_dice: string | null;
  damage_type: string | null;
  properties: string[] | null;
  versatile_dice: string | null;
  range_normal: number | null;
  range_long: number | null;

  armor_category: string | null;
  base_armor_class: number | null;
  strength_requirement: number | null;
  stealth_disadvantage: boolean | null;
}
export interface ItemBase {
  id: string;
  name: string;
  price: number;
  description: string;
  tags: string[];
}
export const weaponProperties = [
  "ammunition",
  "finesse",
  "heavy",
  "light",
  "loading",
  "reach",
  "special",
  "thrown",
  "two-handed",
  "versatile",
] as const;
export type WeaponProperty = (typeof weaponProperties)[number];

export const damageTypes = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

export type DamageType = (typeof damageTypes)[number];

export const weaponCategories = ["simple", "martial"] as const;
export type WeaponCategory = (typeof weaponCategories)[number];

export const armorCategories = ["light", "medium", "heavy", "shield"] as const;
export type ArmorCategory = (typeof armorCategories)[number];

export interface GeneralItem extends ItemBase {
  kind: "general";
}

export interface Weapon extends ItemBase {
  kind: "weapon";
  category: WeaponCategory;
  damageDice: string;
  damageType: DamageType;
  properties: WeaponProperty[];
  versatileDice?: string;
  rangeNormal?: number;
  rangeLong?: number;
}

export interface Armor extends ItemBase {
  kind: "armor";
  baseArmorClass: number;
  category: ArmorCategory;
  strengthRequirement?: number;
  stealthDisadvantage: boolean;
}

export type Item = GeneralItem | Weapon | Armor;

// --- Parsing helpers -------------------------------------------------------
// Module scope, not inside getItems: neither closes over anything, so
// rebuilding them per call was pointless. TODO: move to lib/parse.ts when the
// NPC/locations pages need the same checks — they aren't Supabase calls, so
// they don't really belong in services/.

// Throws instead of letting a missing column silently flow through as a
// mistyped value.
// Accepts undefined as well as null on purpose: ItemRow is a hand-written
// promise, not a checked fact. If a column is renamed in Postgres but not
// here, `select("*")` returns a row with no such key and the value is
// undefined, not null. `== null` (loose) catches both; `=== null` would not.
function requireField<T>(
  value: T | null | undefined,
  field: string,
  id: string,
): T {
  if (value == null) throw new Error(`Item ${id}: missing ${field}`);
  return value;
}

// Verifies the DB value is actually one of the allowed literals before
// trusting it as T. Returns the narrowed value rather than narrowing in place,
// hence "parse" not "assert" — TS assertion functions have the signature
// `(x: unknown): asserts x is T` and return void, which this is not.
// Note the cast is on `allowed`, not on `value`: widening readonly T[] to
// readonly string[] is always sound (no writes possible), so the assertion
// sits on something known-true while the actual check stays honest.
function parseOneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
  id: string,
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`Item ${id}: invalid ${field} "${value}"`);
  }
  return value as T;
}

// `as ItemRow[]` is a promise YOU make about the columns, not a check TS runs.
// Swap for Supabase-generated types later to make this genuinely safe. --> look into this later
// Explicit fields (vs `...row`) intentionally drop price_cp and created_at.
export async function getItems(): Promise<Item[]> {
  const { data: items, error: retrievalError } = await supabase
    .from("items")
    .select("*");
  if (retrievalError) {
    console.error(retrievalError);
    throw retrievalError;
  }

  //Returns the row in supabase as an item used in the UI
  // NOTE: a throw here aborts the whole map, so one malformed row hides all
  // the good ones. That's the right tradeoff while seeding (fail loud, fix the
  // row) but revisit once the data is stable.
  return (items as ItemRow[]).map((row): Item => {
    const base: ItemBase = {
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price_cp / 100,
      tags: row.tags,
    };
    switch (row.kind) {
      case "weapon":
        return {
          ...base,
          kind: "weapon",
          category: parseOneOf(
            requireField(row.weapon_category, "weapon_category", row.id),
            weaponCategories,
            "weapon_category",
            row.id,
          ),
          damageDice: requireField(row.damage_dice, "damage_dice", row.id),
          damageType: parseOneOf(
            requireField(row.damage_type, "damage_type", row.id),
            damageTypes,
            "damage_type",
            row.id,
          ),
          // parseOneOf takes one string and returns one WeaponProperty, so map
          // lifts it to arrays for free — the result types as WeaponProperty[]
          // with no cast at all. `?.` short-circuits the null column to [].
          properties:
            row.properties?.map((p) =>
              parseOneOf(p, weaponProperties, "properties", row.id),
            ) ?? [],
          versatileDice: row.versatile_dice ?? undefined,
          rangeNormal: row.range_normal ?? undefined,
          rangeLong: row.range_long ?? undefined,
        };
      case "armor":
        return {
          ...base,
          kind: "armor",
          baseArmorClass: requireField(
            row.base_armor_class,
            "base_armor_class",
            row.id,
          ),
          category: parseOneOf(
            requireField(row.armor_category, "armor_category", row.id),
            armorCategories,
            "armor_category",
            row.id,
          ),
          strengthRequirement: row.strength_requirement ?? undefined,
          // Was `?? false`, which quietly turned missing data into a confident
          // "no" while every other field here treated null as an error.
          // Uniform contract now — REQUIRES `not null default false` on the
          // column, or every armor row throws.
          stealthDisadvantage: requireField(
            row.stealth_disadvantage,
            "stealth_disadvantage",
            row.id,
          ),
        };
      case "general":
        return { ...base, kind: "general" };
      // Not a fallback: a typo'd kind used to silently become a GeneralItem
      // with its weapon fields dropped. Fails at the boundary instead.
      // TS can't check exhaustiveness here because row.kind is `string` — the
      // `never` trick belongs in the render switch, where the input is Item.
      default:
        throw new Error(`Unknown item kind "${row.kind}" on item ${row.id}`);
    }
  });
}

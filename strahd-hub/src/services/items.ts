import { supabase } from "../lib/supabase";
import { parseOneOf, requireField } from "../lib/parse";
/**
 * Item is how the rest of the app sees an item; the DB row shape comes from the
 * generated Database types via the typed supabase client, and getItems maps one
 * into the other.
 *
 * Prices are stored in copper (price_cp) and exposed as gold — hence the /100.
 * The generated row marks description as nullable (the DB column is), so it's
 * routed through requireField (lib/parse) like every other required field.
 */
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

// Explicit fields (vs `...row`) intentionally drop price_cp and created_at.
export async function getItems(): Promise<Item[]> {
  const { data: items, error: retrievalError } = await supabase
    .from("items")
    .select("*");
  if (retrievalError) {
    console.error(retrievalError);
    throw retrievalError;
  }

  // NOTE: a throw here aborts the whole map, so one malformed row hides all
  // the good ones. That's the right tradeoff while seeding (fail loud, fix the
  // row) but revisit once the data is stable.
  return items.map((row): Item => {
    // Composed once per row: every parse below leads its error with it, so a
    // failure names the offending item instead of just the field.
    const subject = `Item ${row.id}`;
    const base: ItemBase = {
      id: row.id,
      name: row.name,
      description: requireField(row.description, "description", subject),
      price: row.price_cp / 100,
      tags: row.tags,
    };
    switch (row.kind) {
      case "weapon":
        return {
          ...base,
          kind: "weapon",
          category: parseOneOf(
            requireField(row.weapon_category, "weapon_category", subject),
            weaponCategories,
            "weapon_category",
            subject,
          ),
          damageDice: requireField(row.damage_dice, "damage_dice", subject),
          damageType: parseOneOf(
            requireField(row.damage_type, "damage_type", subject),
            damageTypes,
            "damage_type",
            subject,
          ),
          // parseOneOf takes one string and returns one WeaponProperty, so map
          // lifts it to arrays for free — the result types as WeaponProperty[]
          // with no cast at all. `?.` short-circuits the null column to [].
          properties:
            row.properties?.map((p) =>
              parseOneOf(p, weaponProperties, "properties", subject),
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
            subject,
          ),
          category: parseOneOf(
            requireField(row.armor_category, "armor_category", subject),
            armorCategories,
            "armor_category",
            subject,
          ),
          strengthRequirement: row.strength_requirement ?? undefined,
          // Not defaulted with `?? false`: that would quietly turn missing data
          // into a confident "no" while every other field here treats null as
          // an error.
          // Safe to require: armor_fields_required (001) guarantees non-null
          // whenever kind = 'armor'. The column itself stays nullable — it has
          // to, since armor_fields_absent needs it null on every other row.
          stealthDisadvantage: requireField(
            row.stealth_disadvantage,
            "stealth_disadvantage",
            subject,
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

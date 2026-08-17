import { supabase } from "../lib/supabase";
import { parseOneOf, requireField } from "../lib/parse";
import type { Tables } from "../types/database.types";

export const spellSchools = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
] as const;
export type SpellSchool = (typeof spellSchools)[number];

export interface Spell {
  id: string;
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  materialComponent?: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  description: string;
  higherLevels?: string;
  tags: string[];
}

// Exported the way items.ts exports toItem, and for the same reason:
// characterSpells.ts embeds a whole spells row and needs exactly this mapping,
// requireField checks included.
export function toSpell(row: Tables<"spells">): Spell {
  const subject = `Spell ${row.id}`;
  return {
    id: row.id,
    name: requireField(row.name, "name", subject),
    level: requireField(row.level, "level", subject),
    school: parseOneOf(
      requireField(row.school, "school", subject),
      spellSchools,
      "school",
      subject,
    ),
    castingTime: requireField(row.casting_time, "casting_time", subject),
    range: requireField(row.range, "range", subject),
    verbal: requireField(row.verbal, "verbal", subject),
    somatic: requireField(row.somatic, "somatic", subject),
    material: requireField(row.material, "material", subject),
    materialComponent: row.material_component ?? undefined,
    duration: requireField(row.duration, "duration", subject),
    concentration: requireField(row.concentration, "concentration", subject),
    ritual: requireField(row.ritual, "ritual", subject),
    classes: row.classes ?? [],
    description: requireField(row.description, "description", subject),
    higherLevels: row.higher_levels ?? undefined,
    tags: row.tags ?? [],
  };
}

// Indexed by level, so 0 has no entry — a cantrip never reads as an ordinal.
// The fallback covers a level outside 1-9, which the column does not currently
// forbid.
const spellOrdinals = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

function ordinal(level: number): string {
  return spellOrdinals[level] ?? `${level}th`;
}

// How a level reads in a stat block: "Evocation cantrip" at 0, "3rd-level
// evocation" above it. One function rather than separate level and school
// formatters because which of the two leads — and so which one is capitalised —
// changes with the level.
export function spellLevelLine(spell: Spell): string {
  if (spell.level === 0) {
    return `${spell.school.charAt(0).toUpperCase()}${spell.school.slice(1)} cantrip`;
  }
  return `${ordinal(spell.level)}-level ${spell.school}`;
}

// The heading over a group of spells of one level, as the character sheet's
// picker uses it. Plural at 0 because "Cantrips" is what the grimoire's own
// filter button already calls them.
export function spellLevelGroupLabel(level: number): string {
  return level === 0 ? "Cantrips" : `${ordinal(level)} level`;
}

// Same shape and reasoning as getItems (items.ts): 022 gave spells the same
// nullable campaign_id design, so a member of two campaigns would see both
// campaigns' homebrew spells if this stayed unfiltered. Nothing can insert a
// homebrew spell yet (no INSERT policy) — that's the same accident that
// protected items until 025 shipped, so the scope goes in before it matters.
export async function getSpells(campaignId: string): Promise<Spell[]> {
  const { data, error } = await supabase
    .from("spells")
    .select("*")
    .or(`campaign_id.is.null,campaign_id.eq.${campaignId}`);
  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toSpell);
}
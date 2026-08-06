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

function toSpell(row: Tables<"spells">): Spell {
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

export async function getSpells(): Promise<Spell[]> {
  const { data, error } = await supabase.from("spells").select("*");
  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toSpell);
}
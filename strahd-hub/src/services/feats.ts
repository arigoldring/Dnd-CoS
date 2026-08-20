import { supabase } from "../lib/supabase";
import { parseOneOf, requireField } from "../lib/parse";
import type { Tables } from "../types/database.types";

/**
 * The feats catalogue, spells.ts' twin one table over. Same shape for the same
 * reasons: a const tuple narrowing a text column, an exported row mapper the
 * join service reuses, presentation helpers the pages share, and one scoped
 * fetch.
 *
 * The one structural difference is what replaces `level`. A spell's level
 * orders the grimoire, groups the picker and drives the filter row; feats have
 * no such number, so `category` does that job — which is why featsByCategory
 * below is the analogue of spellsByLevel rather than of anything in items.ts.
 */

// The order the UI reads them in — the filter row, the picker's optgroups and
// the sheet's group headers all take their sequence from this array, not from
// alphabetical order. Combat first because it is the biggest and the one most
// people are looking for; general last because it is the leftovers.
//
// 039 checks the same six values. Adding one here without adding it there gets
// you a parse error at the boundary rather than a wrong render, which is the
// trade parseOneOf exists to make.
export const featCategories = [
  "combat",
  "defense",
  "magic",
  "skill",
  "social",
  "general",
] as const;
export type FeatCategory = (typeof featCategories)[number];

export interface Feat {
  id: string;
  name: string;
  category: FeatCategory;
  // Undefined means "open to anyone". Display only — nothing in this app can
  // check "Strength 13 or higher", because characters stores a name and no
  // ability scores. See 039's header.
  prerequisite?: string;
  description: string;
  // The bullets a feat prints as. Empty for a feat that is one sentence, never
  // null: 039 defaults the column to '{}' so no caller has to branch before
  // iterating.
  benefits: string[];
  // Informational. 041's unique (character_id, feat_id) caps every feat at one
  // per sheet, so this tells a reader that Elemental Adept may be taken again
  // without the app being able to record it.
  repeatable: boolean;
  tags: string[];
}

// What CreateFeat builds. Omit<Feat, "id"> rather than a hand-written twin, so
// a column added to Feat is a compile error in the form rather than a field it
// silently stops sending. items.ts' NewItem has to spell out three variants
// because Item is a union; Feat is not, so this stays one line.
export type NewFeat = Omit<Feat, "id">;

// Exported the way toSpell and toItem are, and for the same reason:
// characterFeats.ts embeds a whole feats row and needs exactly this mapping,
// requireField checks included.
export function toFeat(row: Tables<"feats">): Feat {
  const subject = `Feat ${row.id}`;
  return {
    id: row.id,
    name: requireField(row.name, "name", subject),
    category: parseOneOf(
      requireField(row.category, "category", subject),
      featCategories,
      "category",
      subject,
    ),
    prerequisite: row.prerequisite ?? undefined,
    description: requireField(row.description, "description", subject),
    benefits: row.benefits ?? [],
    repeatable: requireField(row.repeatable, "repeatable", subject),
    tags: row.tags ?? [],
  };
}

// Title case, and nothing more clever than that. spellLevelLine has to decide
// which of level and school leads because the answer changes at level 0; a
// category has no such wrinkle, so the heading over a group and the word in a
// table cell are the same string and there is one function rather than two.
export function featCategoryLabel(category: FeatCategory): string {
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

// One group per category, in featCategories order with names alphabetical
// inside each — how every list of feats in this app is read.
//
// Note the difference from spellsByLevel, which sorts its groups numerically:
// there is no natural order on these strings, so the order is the one declared
// above and the map is walked in that sequence rather than sorted afterwards.
// A category with no feats in it produces no group, so an empty bucket never
// renders a heading over nothing.
//
// Generic rather than one grouper per shape: CharacterFeatEntry is Feat plus an
// entryId, so the constraint is all this function needs and the type parameter
// carries the extra field through — narrowing to Feat[] would strand the
// sheet's rows without the entryId their key and remove call are made of.
//
// Builds its own arrays rather than sorting in place — these lists belong to a
// query cache, and sorting one would mutate what every other consumer holds.
export function featsByCategory<T extends { name: string; category: FeatCategory }>(
  feats: T[],
): { category: FeatCategory; feats: T[] }[] {
  const groups = new Map<FeatCategory, T[]>();
  for (const feat of feats) {
    const group = groups.get(feat.category);
    if (group) group.push(feat);
    else groups.set(feat.category, [feat]);
  }

  return featCategories
    .filter((category) => groups.has(category))
    .map((category) => ({
      category,
      // Safe to sort in place: every array in the map was built by the loop
      // above, so none of them is the caller's. spellsByLevel does the same.
      feats: groups.get(category)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

// Scoped to shared-or-this-campaign, not left to RLS, for getItems' reason:
// RLS answers "may this viewer see this row", and a member of two campaigns
// passes that check for both campaigns' homebrew — the query itself has to
// narrow to the campaign being viewed. Unlike spells, this is load-bearing from
// day one: 039 ships an INSERT policy, so homebrew feats exist immediately.
// Ordered here rather than left to the caller, the way getNpcs and getRecaps
// both order their own reads. The character sheet pipes this through
// featsByCategory, which sorts — but the catalogue page renders `filtered`
// straight into a table, so it is the consumer with nothing between it and the
// response. Unordered, it looks fine only for as long as Postgres happens to
// return the seed in insert order, and a DM's homebrew lands at the bottom of
// the book instead of among its neighbours.
export async function getFeats(campaignId: string): Promise<Feat[]> {
  const { data, error } = await supabase
    .from("feats")
    .select("*")
    .or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
    .order("name");
  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toFeat);
}

// createItem's shape: insert, select the row back, map it. campaign_id is set
// from the argument and never from the input, which is half of what makes 039's
// `campaign_id is not null` check unreachable from here — a caller cannot ask
// for a shared catalogue row even by mistake.
export async function createFeat(
  campaignId: string,
  input: NewFeat,
): Promise<Feat> {
  const { data, error } = await supabase
    .from("feats")
    .insert({
      campaign_id: campaignId,
      name: input.name,
      category: input.category,
      prerequisite: input.prerequisite ?? null,
      description: input.description,
      benefits: input.benefits,
      repeatable: input.repeatable,
      tags: input.tags,
    })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    throw error;
  }

  return toFeat(data);
}

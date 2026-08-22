import { supabase } from "../lib/supabase";

/**
 * A player's own words for a spell or an item on their sheet — 046 and 047.
 *
 * One file for two tables, which is a deliberate exception to the one-service-
 * per-resource rule. The repo's other near-twins are separate files because
 * they genuinely diverge: characterInventory has added_by and a quantity that
 * partyInventory doesn't need, characterSpells has neither. These two differ by
 * one column name and nothing else, and splitting them would produce two files
 * that must be edited together forever — the failure mode CLAUDE.md warns about
 * for docs, applied to code.
 *
 * What is NOT shared is the supabase call itself. `.from()` is typed off a
 * string literal, so hoisting the table name into a variable would collapse
 * every row type in here to a union and cost more than the duplication saves.
 * The two halves are written out; the mapping and the trimming are shared.
 *
 * Absence is the only spelling of "no override" — 046's not_empty constraint.
 * So there is no such thing as a blank stored description: an all-blank draft
 * is turned into a delete here, at the boundary, rather than being sent to a
 * constraint that would surface as a raw Postgres error in front of a player.
 */

export interface CustomDescription {
  customName: string | null;
  customDescription: string | null;
}

// Both tables' rows carry the same two columns under the same names, so one
// mapper serves both. Typed structurally rather than as Tables<"..."> because
// naming either table here would be an arbitrary choice between them.
function toCustomDescription(row: {
  custom_name: string | null;
  custom_description: string | null;
}): CustomDescription {
  return {
    customName: row.custom_name,
    customDescription: row.custom_description,
  };
}

// "" and "   " both mean "the player left this blank", and neither is storable
// (046's btrim'd length check). Null is what the column wants for absent.
function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Keyed by the subject's id — spell_id or item_id — because that is what the
// caller is holding when it renders a card. Keyed by character, with no second
// filter to add: a character id already implies exactly one campaign, and 046's
// SELECT policy lets any member of that campaign read this, so the same call
// serves a player on their own sheet and a DM on someone else's.
export async function getCharacterSpellDescriptions(
  characterId: string,
): Promise<Map<string, CustomDescription>> {
  const { data, error } = await supabase
    .from("character_spell_descriptions")
    .select("spell_id, custom_name, custom_description")
    .eq("character_id", characterId);

  if (error) {
    console.error(error);
    throw error;
  }

  return new Map(data.map((row) => [row.spell_id, toCustomDescription(row)]));
}

export async function getCharacterItemDescriptions(
  characterId: string,
): Promise<Map<string, CustomDescription>> {
  const { data, error } = await supabase
    .from("character_item_descriptions")
    .select("item_id, custom_name, custom_description")
    .eq("character_id", characterId);

  if (error) {
    console.error(error);
    throw error;
  }

  return new Map(data.map((row) => [row.item_id, toCustomDescription(row)]));
}

/**
 * Save one override. Returns what was stored, or null when the draft was blank
 * and the row was removed instead.
 *
 * An upsert on the composite primary key, which is therefore also the default
 * conflict target: the first save on a spell with no row yet is an INSERT and
 * every save after it is an UPDATE, from the same button.
 *
 * NOTE the absence of `ignoreDuplicates`, and note that it is load-bearing in
 * the OPPOSITE direction from addSpellToCharacter's presence of it. There, the
 * flag renders as ON CONFLICT DO NOTHING so a duplicate add is the no-op the
 * user meant, and character_spells ships no UPDATE policy to back anything
 * else. Here the value has to actually change, so the upsert must render as ON
 * CONFLICT DO UPDATE — which is exactly why 046 and 047 ship the UPDATE
 * policies that 037 deliberately omits. Adding the flag here would make every
 * save after the first a silent no-op; removing it there starts throwing 42501.
 *
 * .select().maybeSingle() and the null check are not decoration: RLS's USING
 * clause excludes rows before WITH CHECK is consulted, so a refused write comes
 * back as a clean zero-row 200 rather than an error. saveNpcDmNotes carries the
 * same pair for the same reason.
 */
export async function saveCharacterSpellDescription(
  characterId: string,
  spellId: string,
  fields: CustomDescription,
): Promise<CustomDescription | null> {
  const custom_name = normalize(fields.customName);
  const custom_description = normalize(fields.customDescription);

  // A row that overrides nothing must not exist — 046's constraint. Clearing is
  // a delete, not an empty save, so the reader never has to treat "" and absent
  // as the same thing.
  if (custom_name === null && custom_description === null) {
    await clearCharacterSpellDescription(characterId, spellId);
    return null;
  }

  const { data, error } = await supabase
    .from("character_spell_descriptions")
    .upsert({
      character_id: characterId,
      spell_id: spellId,
      custom_name,
      custom_description,
    })
    .select("custom_name, custom_description")
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }
  if (!data) {
    throw new Error("You do not have permission to edit this description");
  }

  return toCustomDescription(data);
}

export async function saveCharacterItemDescription(
  characterId: string,
  itemId: string,
  fields: CustomDescription,
): Promise<CustomDescription | null> {
  const custom_name = normalize(fields.customName);
  const custom_description = normalize(fields.customDescription);

  if (custom_name === null && custom_description === null) {
    await clearCharacterItemDescription(characterId, itemId);
    return null;
  }

  const { data, error } = await supabase
    .from("character_item_descriptions")
    .upsert({
      character_id: characterId,
      item_id: itemId,
      custom_name,
      custom_description,
    })
    .select("custom_name, custom_description")
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }
  if (!data) {
    throw new Error("You do not have permission to edit this description");
  }

  return toCustomDescription(data);
}

// No zero-row check, matching removeSpellFromCharacter rather than
// deleteCharacter — and here the reason is stronger than "the control is only
// on your own sheet". A refused delete and a row that was already gone are both
// zero rows, and the second is a legitimate outcome: two tabs, or a clear on
// something another writer already cleared. There is nothing to distinguish, so
// there is nothing to report, and "no row" is the end state the caller asked
// for either way.
export async function clearCharacterSpellDescription(
  characterId: string,
  spellId: string,
): Promise<void> {
  const { error } = await supabase
    .from("character_spell_descriptions")
    .delete()
    .eq("character_id", characterId)
    .eq("spell_id", spellId);

  if (error) {
    console.error(error);
    throw error;
  }
}

export async function clearCharacterItemDescription(
  characterId: string,
  itemId: string,
): Promise<void> {
  const { error } = await supabase
    .from("character_item_descriptions")
    .delete()
    .eq("character_id", characterId)
    .eq("item_id", itemId);

  if (error) {
    console.error(error);
    throw error;
  }
}

import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";
import { toSpell, type Spell } from "./spells";

/**
 * The spells on one character's sheet — the simpler twin of
 * characterInventory.ts, and the places it is simpler are the whole design:
 *
 *   no quantity     a spell is on the list or it is not. 030's insert-or-
 *                   increment RPC exists only because PostgREST cannot express
 *                   "increment"; it expresses "insert if absent" perfectly well,
 *                   so the add below is a plain upsert and there is no function
 *                   to call. Nothing from 032 either — there is no decrement.
 *
 *   no added_by     029 stamps it on character_inventory because DM-granted loot
 *                   and player-bought loot are different things on a shared
 *                   sheet. Who typed a spell onto a list is not a fact anyone
 *                   will ask, so 037 left the column off rather than adding it
 *                   null.
 *
 * What is the same is who may write: 028's can_edit_character, so the owner or
 * that campaign's DM, enforced entirely by 037's policies. Nothing in this file
 * or its callers checks which one you are.
 */

// No alias and no second embed, unlike CHARACTER_INVENTORY_SELECT: there is no
// foreign key here whose uuid needs flattening to a name.
const CHARACTER_SPELLS_SELECT = "*, spells(*)";

// spells is a single non-null object — character_spells holds a NOT NULL
// spell_id, and 037's FK guarantees the row is there.
type CharacterSpellRow = Tables<"character_spells"> & {
  spells: Tables<"spells">;
};

export type CharacterSpellEntry = Spell & {
  // The character_spells row id — what remove keys on. Distinct from the
  // spell's own id, and one-to-one with it for a given character, since 037's
  // unique (character_id, spell_id) means a spell appears at most once on a
  // sheet.
  entryId: string;
};

function toCharacterSpellEntry(row: CharacterSpellRow): CharacterSpellEntry {
  return { ...toSpell(row.spells), entryId: row.id };
}

// Keyed by character, with no second filter to add: a character id already
// implies exactly one campaign. 037's SELECT policy lets any member of that
// campaign read this, so the same call serves a player looking at their own
// sheet and a DM looking at someone else's.
export async function getCharacterSpells(
  characterId: string,
): Promise<CharacterSpellEntry[]> {
  const { data, error } = await supabase
    .from("character_spells")
    .select(CHARACTER_SPELLS_SELECT)
    .eq("character_id", characterId);

  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toCharacterSpellEntry);
}

// An upsert rather than an insert, so adding a spell that is already on the list
// is the no-op the user meant instead of a unique-constraint error — the
// getOrCreateProfile pattern, against 037's unique (character_id, spell_id).
//
// Returns void, and that is the point of ignoreDuplicates: the losing insert
// comes back with NO ROW, so anything that promised to return the entry would
// have to make a second round trip to fetch it. Nothing needs it —
// useCharacterSpells invalidates the list on success and refetches.
export async function addSpellToCharacter(
  characterId: string,
  spellId: string,
): Promise<void> {
  const { error } = await supabase
    .from("character_spells")
    .upsert(
      { character_id: characterId, spell_id: spellId },
      { onConflict: "character_id,spell_id", ignoreDuplicates: true },
    );

  if (error) {
    console.error(error);
    throw error;
  }
}

// No zero-row check, matching removeFromCharacterInventory: everyone who can
// reach this already passed can_edit_character to see the sheet's controls, so
// a delete matching nothing means the row is already gone — the end state the
// caller wanted.
export async function removeSpellFromCharacter(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("character_spells")
    .delete()
    .eq("id", entryId);

  if (error) {
    console.error(error);
    throw error;
  }
}

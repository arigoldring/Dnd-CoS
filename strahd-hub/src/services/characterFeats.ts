import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";
import { toFeat, type Feat } from "./feats";

/**
 * The feats on one character's sheet — characterSpells.ts one table over, and
 * simple for the same reasons:
 *
 *   no quantity     a feat is on the sheet or it is not. 030's insert-or-
 *                   increment RPC exists only because PostgREST cannot express
 *                   "increment"; it expresses "insert if absent" perfectly
 *                   well, so the add below is a plain upsert and there is no
 *                   function to call. Nothing from 032 either.
 *
 *   no added_by     who typed a feat onto a sheet is not a fact anyone will
 *                   ask, so 041 left the column off rather than adding it null.
 *
 * Who may write is 028's can_edit_character — the owner or that campaign's DM,
 * enforced entirely by 041's policies. Nothing in this file or its callers
 * checks which one you are.
 *
 * A note that does NOT carry over from spells: 037 could argue its embedded
 * spell was non-null because 022 shipped no INSERT policy, so every spells row
 * was shared SRD. 039 does ship one, so a feat from another campaign's homebrew
 * can be attached to a character and would read back null here — see 041's
 * BLOCK 6. The type below still declares it non-null, because the only path
 * that reaches it is the picker, and the picker is fed by getFeats(campaignId).
 */

// No alias and no second embed, unlike CHARACTER_INVENTORY_SELECT: there is no
// foreign key here whose uuid needs flattening to a name.
const CHARACTER_FEATS_SELECT = "*, feats(*)";

type CharacterFeatRow = Tables<"character_feats"> & {
  feats: Tables<"feats">;
};

export type CharacterFeatEntry = Feat & {
  // The character_feats row id — what remove keys on. Distinct from the feat's
  // own id, and one-to-one with it for a given character, since 041's
  // unique (character_id, feat_id) means a feat appears at most once on a sheet.
  entryId: string;
};

function toCharacterFeatEntry(row: CharacterFeatRow): CharacterFeatEntry {
  return { ...toFeat(row.feats), entryId: row.id };
}

// Keyed by character, with no second filter to add: a character id already
// implies exactly one campaign. 041's SELECT policy lets any member of that
// campaign read this, so the same call serves a player looking at their own
// sheet and a DM looking at someone else's.
export async function getCharacterFeats(
  characterId: string,
): Promise<CharacterFeatEntry[]> {
  const { data, error } = await supabase
    .from("character_feats")
    .select(CHARACTER_FEATS_SELECT)
    .eq("character_id", characterId);

  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toCharacterFeatEntry);
}

// An upsert rather than an insert, so adding a feat that is already on the
// sheet is the no-op the user meant instead of a unique-constraint error.
//
// ignoreDuplicates is load-bearing twice over: 041 has no UPDATE policy, so a
// real upsert would come back 42501 on the second add, and the losing insert
// returns NO ROW — which is why this returns void rather than the entry.
// useCharacterFeats invalidates the list on success and refetches.
export async function addFeatToCharacter(
  characterId: string,
  featId: string,
): Promise<void> {
  const { error } = await supabase
    .from("character_feats")
    .upsert(
      { character_id: characterId, feat_id: featId },
      { onConflict: "character_id,feat_id", ignoreDuplicates: true },
    );

  if (error) {
    console.error(error);
    throw error;
  }
}

// No zero-row check, matching removeSpellFromCharacter: everyone who can reach
// this already passed can_edit_character to see the sheet's controls, so a
// delete matching nothing means the row is already gone — the end state the
// caller wanted.
export async function removeFeatFromCharacter(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("character_feats")
    .delete()
    .eq("id", entryId);

  if (error) {
    console.error(error);
    throw error;
  }
}

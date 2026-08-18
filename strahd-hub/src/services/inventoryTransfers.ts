import { supabase } from "../lib/supabase";

/**
 * Moving one stack between the party's pile and a character's sheet — the one
 * write in this app that spans both inventories.
 *
 * Its own file rather than a function on either side, and that is the whole
 * reason it exists separately: partyInventory.ts opens by calling itself a
 * near-twin of characterInventory.ts, and a function that reached into the other
 * table would make that header false. Neither table owns this operation, so
 * neither service does.
 *
 * Both calls are 038's RPCs rather than a remove followed by an add. The pair of
 * client calls is the obvious implementation and it is the one to avoid: two
 * round trips with no transaction around them, so a failure between them
 * destroys a stack — the item leaves the hoard and arrives nowhere. 038 has the
 * argument in full, along with the lock that makes two people moving the same
 * stack at once come out right.
 *
 * Both return nothing. The caller's invalidation is what refreshes the lists,
 * exactly as decrementPartyInventoryItem already does — and here it has to be,
 * since a transfer touches two queries and the RPC returns neither.
 */

// No zero-row check, matching removeFrom* rather than deleteRecap: 038 returns
// quietly when the source row is missing, because everyone who can reach this
// call could already see the controls, so a target that is gone means a
// concurrent removal reached the end state the caller wanted.
//
// Takes the character explicitly, because a party_inventory row knows its
// campaign but not which of that campaign's characters is reaching for it.
export async function movePartyItemToCharacter(
  entryId: string,
  characterId: string,
): Promise<void> {
  const { error } = await supabase.rpc("move_party_item_to_character", {
    target_entry: entryId,
    target_character: characterId,
  });

  if (error) {
    console.error(error);
    throw error;
  }
}

// Takes only the entry: the destination pile is the campaign the character
// belongs to, which 038 derives through characters rather than accepting as an
// argument, so there is no way to stow an item into the wrong party's hoard.
export async function moveCharacterItemToParty(entryId: string): Promise<void> {
  const { error } = await supabase.rpc("move_character_item_to_party", {
    target_entry: entryId,
  });

  if (error) {
    console.error(error);
    throw error;
  }
}

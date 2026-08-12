import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";
import { toItem, type Item } from "./items";

/**
 * One character's own gear, as opposed to the party's shared pile in
 * partyInventory.ts. The two files are near-twins by design, and the places
 * they differ are the interesting ones:
 *
 *   who may write   party_inventory is any member. Here it is the owner OR the
 *                   campaign's DM, through 028's can_edit_character — so a DM
 *                   can hand out loot mid-session without being able to touch
 *                   the character row itself.
 *
 *   added_by        party_inventory has the column and leaves it null. Here it
 *                   is stamped by 029's trigger on every insert and read back as
 *                   a name, which is what makes DM-granted loot distinguishable
 *                   from what a player picked up themselves. That is also why
 *                   the two entry types stay separate rather than being aliased:
 *                   they already are not the same shape, before equipment slots
 *                   or attunement land.
 *
 *   stacking        party_inventory still makes a second row when you add an
 *                   item it already holds. Here 030 settled it: unique
 *                   (character_id, item_id), and an add increments. The sheet is
 *                   where that difference is visible, because a stack of rations
 *                   is the normal case on a character and the odd one on the
 *                   party pile.
 */

// added_by is embedded and aliased the way RECAP_SELECT does it: a uuid is
// useless to a component, so the join flattens to a display name in the mapper
// and nothing downstream ever holds a foreign key. Works only because the
// profiles SELECT policy is open to authenticated readers — RLS applies to
// embedded joins too, and a narrower policy would silently return null here.
const CHARACTER_INVENTORY_SELECT = "*, items(*), addedBy:added_by(display_name)";

// items is a single non-null object (character_inventory holds a NOT NULL
// item_id); addedBy is single but nullable, because the column is nullable and
// `on delete set null` means a departed profile leaves the entry behind.
type CharacterInventoryRow = Tables<"character_inventory"> & {
  items: Tables<"items">;
  addedBy: Pick<Tables<"profiles">, "display_name"> | null;
};

// Intersection rather than `extends`, same as PartyInventoryEntry: Item is a
// union, so `&` distributes over it and `entry.kind === "weapon"` still narrows.
export type CharacterInventoryEntry = Item & {
  // The character_inventory row id — what decrement and remove key on. Still
  // distinct from the item's id, though since 030 the two are one-to-one for a
  // given character: one row per (character, item), so an item appears at most
  // once on a sheet and quantity carries the count.
  entryId: string;
  quantity: number;
  // null when nobody was recorded (an entry predating this column, or an added_by
  // profile since deleted). Not the same as "added by nobody".
  addedByName: string | null;
};

function toCharacterInventoryEntry(
  row: CharacterInventoryRow,
): CharacterInventoryEntry {
  return {
    ...toItem(row.items),
    entryId: row.id,
    quantity: row.quantity,
    addedByName: row.addedBy?.display_name ?? null,
  };
}

// Keyed by character, not campaign — and unlike getPartyInventory there is no
// second filter to add, because a character id already implies exactly one
// campaign. 028's SELECT policy lets any member of that campaign read this, so
// the same call serves a player looking at their own sheet and (later) a DM
// looking at someone else's.
export async function getCharacterInventory(
  characterId: string,
): Promise<CharacterInventoryEntry[]> {
  const { data, error } = await supabase
    .from("character_inventory")
    .select(CHARACTER_INVENTORY_SELECT)
    .eq("character_id", characterId);

  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toCharacterInventoryEntry);
}

// An RPC rather than an insert, because the write is "add one to the stack, or
// start one" and PostgREST cannot say that: its upsert assigns the columns it is
// handed, so it would pin an existing stack back to 1. 030's function does the
// insert-or-increment in a single statement, which is also what keeps two people
// adding at once from losing an increment.
//
// Nothing is passed for added_by or quantity. 029's trigger owns the first and
// ignores the client entirely; 030's `on conflict` owns the second. The only
// facts this call supplies are which character and which item.
export async function addToCharacterInventory(
  characterId: string,
  itemId: string,
): Promise<CharacterInventoryEntry> {
  const { data: entryId, error } = await supabase.rpc(
    "add_character_inventory_item",
    { target_character: characterId, target_item: itemId },
  );

  if (error) {
    console.error(error);
    throw error;
  }

  // Second round trip, because the function returns the row id and the callers
  // of this one expect a whole entry — the RPC cannot carry the embedded item
  // and adder the way CHARACTER_INVENTORY_SELECT does. Cheap and rarely load
  // bearing: useCharacterInventory invalidates the list on success and refetches
  // anyway, so the returned entry is for callers that want it, not the cache.
  const { data, error: entryError } = await supabase
    .from("character_inventory")
    .select(CHARACTER_INVENTORY_SELECT)
    .eq("id", entryId)
    .single();

  if (entryError) {
    console.error(entryError);
    throw entryError;
  }

  return toCharacterInventoryEntry(data);
}

// Decrement one, and DELETE the row when the last one goes — the same
// deliberate behaviour partyInventory documents, backed by the same `quantity >
// 0` CHECK, which makes 0 unstorable rather than merely unwanted.
//
// currentQuantity is the caller's last-read value, so simultaneous decrements
// can lose an update. More reachable here than on the party pile, since the DM
// and the owner can both be editing one sheet during a session — but still a
// two-people-at-once race on a low-traffic page, and still not worth a
// server-side atomic decrement until it actually bites.
export async function decrementCharacterInventoryItem(
  entryId: string,
  currentQuantity: number,
): Promise<void> {
  if (currentQuantity <= 1) {
    await removeFromCharacterInventory(entryId);
    return;
  }

  const { error } = await supabase
    .from("character_inventory")
    .update({ quantity: currentQuantity - 1 })
    .eq("id", entryId);

  if (error) {
    console.error(error);
    throw error;
  }
}

// No zero-row check, matching removeFromPartyInventory rather than
// deleteCharacter: everyone who can reach this call already passed
// can_edit_character to see the sheet's controls, so a delete matching nothing
// means the row is already gone — the end state the caller wanted.
export async function removeFromCharacterInventory(
  entryId: string,
): Promise<void> {
  const { error } = await supabase
    .from("character_inventory")
    .delete()
    .eq("id", entryId);

  if (error) {
    console.error(error);
    throw error;
  }
}

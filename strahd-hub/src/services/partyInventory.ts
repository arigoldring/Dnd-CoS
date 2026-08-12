import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";
import { createItem, toItem, type Item, type NewItem } from "./items";

/**
 * Party inventory is the campaign's shared loot pile: rows in party_inventory,
 * each pointing at one items row with a quantity. Same split as items.ts and
 * recaps.ts — the *Row type is exactly what Supabase returns, and
 * PartyInventoryEntry is how the rest of the app sees an entry.
 *
 * The reuse that earns the split here is toItem: an entry IS an item (name,
 * price, tags, the weapon/armor fields) plus the two columns the join adds on
 * top — the party_inventory row id and its quantity. So the app type is the
 * Item union intersected with those two, and the mapper leans on items.ts for
 * everything item-shaped instead of re-deriving it.
 */

// The row as PARTY_INVENTORY_SELECT returns it: party_inventory's own columns
// plus the embedded item. `items` is a single object, not an array, because
// party_inventory holds the FK (item_id) — an entry has exactly one item — and
// it's non-null because item_id is NOT NULL (021). Same shape of embed as
// RecapRow, just through a to-one FK instead of an aliased one.
type PartyInventoryRow = Tables<"party_inventory"> & {
  items: Tables<"items">;
};

// Intersection, not `extends`: Item is a union (general | weapon | armor) and
// an interface can't extend a union. `&` distributes over it, so an entry stays
// a proper discriminated union — `entry.kind === "weapon"` still narrows.
export type PartyInventoryEntry = Item & {
  // party_inventory.id — the row to target on decrement/remove. Distinct from
  // the item's own id: the same item_id can appear as several entries (see
  // addToPartyInventory), so entryId, not id, is what those operations key on.
  entryId: string;
  quantity: number;
};

// items(*) pulls the joined item's columns so name/price/tags arrive in the
// same round-trip, instead of a second query keyed by item_id.
const PARTY_INVENTORY_SELECT = "*, items(*)";

// Map the joined row: the nested item goes through toItem (items.ts owns that
// logic — don't duplicate the kind switch here), and the two
// party_inventory-only columns merge in on top.
function toPartyInventoryEntry(row: PartyInventoryRow): PartyInventoryEntry {
  return {
    ...toItem(row.items),
    entryId: row.id,
    quantity: row.quantity,
  };
}

// Scoped by campaignId, the getRecaps/getInvites case: 021's is_campaign_member
// policy answers "may this viewer see this row", and a player in two campaigns
// passes it for both — so an unfiltered read would merge two parties' loot onto
// one page. The filter narrows "every campaign I'm in" down to the one on
// screen; RLS stays the security boundary, this is only which rows the page wants.
export async function getPartyInventory(
  campaignId: string,
): Promise<PartyInventoryEntry[]> {
  const { data, error } = await supabase
    .from("party_inventory")
    .select(PARTY_INVENTORY_SELECT)
    .eq("campaign_id", campaignId);

  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toPartyInventoryEntry);
}

// quantity is left to its DB default of 1 (021), and added_by to its null
// default — the current user isn't threaded through here, so "who added this"
// stays unrecorded for now (the column exists for a future byline, the way
// recaps carries last_edited_by).
//
// This is a plain insert, NOT an upsert: there's no unique constraint on
// (campaign_id, item_id), so adding an item the party already has creates a
// SECOND entry at quantity 1 rather than bumping the existing stack. A real
// open question, not an oversight — if the UI wants one stack per item it
// should disable "add" for items already in the list, or this grows into an
// increment. Flagging it here so the choice is made on purpose.
//
// Returns the created entry (like createRecap) so the caller updates its list
// from what the DB actually stored rather than a hand-built optimistic object.
export async function addToPartyInventory(
  campaignId: string,
  itemId: string,
): Promise<PartyInventoryEntry> {
  const { data, error } = await supabase
    .from("party_inventory")
    .insert({ campaign_id: campaignId, item_id: itemId })
    .select(PARTY_INVENTORY_SELECT)
    .single();

  if (error) {
    console.error(error);
    throw error;
  }

  return toPartyInventoryEntry(data);
}

// Decrement one, and DELETE the row when the last one goes.
//
// This auto-delete-at-zero is a real product decision, not a technicality:
// spending the party's final torch takes it off the sheet entirely rather than
// leaving a quantity-0 ghost. The DB backs it up — quantity has a `> 0` CHECK
// (021), so 0 isn't even a storable state; the row has to go instead. Named
// here because "decrement" quietly meaning "sometimes delete" is a surprise
// worth spelling out at the call site.
//
// currentQuantity is the caller's last-read value, so two players decrementing
// the same stack at once can lose an update (both write from the same start).
// Acceptable for a low-traffic party sheet; revisit with an atomic server-side
// decrement if it ever bites.
export async function decrementPartyInventoryItem(
  entryId: string,
  currentQuantity: number,
): Promise<void> {
  if (currentQuantity <= 1) {
    await removeFromPartyInventory(entryId);
    return;
  }

  const { error } = await supabase
    .from("party_inventory")
    .update({ quantity: currentQuantity - 1 })
    .eq("id", entryId);

  if (error) {
    console.error(error);
    throw error;
  }
}

// Straight delete, for the explicit trash-can button — removing a whole stack
// regardless of quantity, and the path decrement takes for its last item.
//
// Unlike deleteRecap, there's no "you don't have permission" check on a
// zero-row result. That check exists there because deleting a recap is DM-only,
// so a no-op delete means RLS silently blocked a player. Here every op is gated
// by the same is_campaign_member policy (021) that let the caller see the entry
// in the first place, so a delete that matches nothing means the row was
// already gone — a concurrent removal, which is exactly the end state the
// caller wanted. Reporting that as an error would be noise.
export async function removeFromPartyInventory(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("party_inventory")
    .delete()
    .eq("id", entryId);

  if (error) {
    console.error(error);
    throw error;
  }
}

// DM only (025_homebrew_items.sql gats the create via is_campaign_dm), but no
// client-side check here — RLS is the enforcement layer, matching createRecap
// and every other create function in this codebase.
//
// Composes createItem + addToPartyInventory to create a homebrew item and
// immediately add it to the pile. If addToPartyInventory fails after createItem
// succeeds, the item exists as a campaign-scoped catalogue row but isn't in the
// pile yet; it won't be lost (getItems includes this campaign's homebrew, so
// Shop can add it from the catalogue) but the caller should report the
// partial-success error.
export async function createHomeBrewItem(
  campaignId: string,
  input: NewItem,
): Promise<PartyInventoryEntry> {
  const item = await createItem(campaignId, input);
  return addToPartyInventory(campaignId, item.id);
}

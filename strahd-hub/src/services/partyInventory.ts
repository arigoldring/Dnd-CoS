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
  // party_inventory.id — the row to target on decrement/remove. Still distinct
  // from the item's own id, though since 031 the two are one-to-one within a
  // campaign: one row per (campaign, item), so an item appears at most once on
  // the pile and quantity carries the count.
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

// An RPC rather than an insert, for addToCharacterInventory's reason: the write
// is "add one to the stack, or start one", and PostgREST cannot say that — its
// upsert assigns the columns it is handed, so it would pin an existing stack
// back to 1. 031's function does the insert-or-increment in a single statement,
// which is also what keeps two people adding at once from losing an increment.
//
// This used to be a plain insert that filed a second row per add, with a comment
// proposing the UI disable "add" for items already in the list. 031 replaced
// that with a unique (campaign_id, item_id) — a client-side guard was never a
// substitute for the constraint.
//
// Nothing is passed for quantity or added_by. 031's `on conflict` owns the
// first; the second stays null the way 021 left it (the column exists for a
// future byline, the way recaps carries last_edited_by, and if one lands it
// wants 029's trigger rather than an argument here).
//
// Returns the whole entry (like createRecap) so the caller updates its list from
// what the DB actually stored rather than a hand-built optimistic object.
export async function addToPartyInventory(
  campaignId: string,
  itemId: string,
): Promise<PartyInventoryEntry> {
  const { data: entryId, error } = await supabase.rpc(
    "add_party_inventory_item",
    { target_campaign: campaignId, target_item: itemId },
  );

  if (error) {
    console.error(error);
    throw error;
  }

  // Second round trip, because the function returns the row id and callers
  // expect a whole entry — the RPC cannot carry the embedded item the way
  // PARTY_INVENTORY_SELECT does. Cheap and rarely load bearing: usePartyInventory
  // invalidates the list on success and refetches anyway, so the returned entry
  // is for callers that want it, not the cache.
  const { data, error: entryError } = await supabase
    .from("party_inventory")
    .select(PARTY_INVENTORY_SELECT)
    .eq("id", entryId)
    .single();

  if (entryError) {
    console.error(entryError);
    throw entryError;
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
// Which branch to take used to be decided here, from the caller's last-read
// quantity, so two players spending the same torch both wrote the same number
// and one spend vanished. 032 moved the read, the branch and the write inside
// one locked function: this call now supplies only which row.
export async function decrementPartyInventoryItem(entryId: string): Promise<void> {
  const { error } = await supabase.rpc("decrement_party_inventory_item", {
    target_entry: entryId,
  });

  if (error) {
    console.error(error);
    throw error;
  }
}

// Straight delete, for the explicit trash-can button — removing a whole stack
// regardless of quantity. No longer the path decrement takes for its last item:
// since 032 that delete happens inside the function, under the same lock as the
// read that chose it.
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

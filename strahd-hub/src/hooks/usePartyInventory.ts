import { useCallback, useEffect, useState } from "react";
import {
  PartyInventoryEntry,
  addToPartyInventory,
  decrementPartyInventoryItem,
  getPartyInventory,
  removeFromPartyInventory,
  createHomeBrewItem as createHomeBrewItemService,
} from "../services/partyInventory";
import { type NewItem } from "../services/items";
import { errorMessage } from "../lib/errors";

// campaignId is a parameter, not read from a global: the page gets it from
// useCampaign() and passes it down, same as useRecaps. Named `entries` rather
// than `items` because a page that adds loot uses this hook alongside useItems
// (the catalog to pick from) — two `items` on one screen would be a trap.
export function usePartyInventory(campaignId: string) {
  const [entries, setEntries] = useState<PartyInventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      // Reset on every campaign change, not just on mount: this component stays
      // mounted when a player navigates between campaigns (same route, only the
      // param changes), so without this the previous party's loot lingers until
      // the new fetch lands.
      setLoading(true);
      setError(null);
      try {
        const data = await getPartyInventory(campaignId);
        if (!ignore) setEntries(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(errorMessage(err, "Failed to load party inventory"));
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    // `ignore` keeps a switch race safe: an in-flight fetch for the old campaign
    // can resolve after the new one was requested, and this drops it rather than
    // letting it paint the wrong party's loot.
    return () => {
      ignore = true;
    };
  }, [campaignId]);

  // Refetch instead of optimistic patching, the deliberately simple choice: each
  // mutation re-reads the whole list rather than reconstructing the post-change
  // state itself. That reconstruction is exactly what's fiddly here — an add can
  // create a brand-new stack, a decrement can DELETE the row at quantity 1 — so
  // asking the server "what does it look like now" sidesteps three special
  // cases. Nothing else in the app does optimistic updates yet; this matches.
  //
  // Deliberately does NOT touch `loading` or `error`: `loading` blanking the
  // list behind a spinner on every +/- click would be worse than the read it
  // saves, and a re-read that fails after a successful write hasn't left the
  // page with "no data" — it just rejects (below) so the caller can react.
  const refresh = useCallback(async () => {
    const data = await getPartyInventory(campaignId);
    setEntries(data);
  }, [campaignId]);

  // All three REJECT on failure rather than setting `error` above, same split as
  // useRecaps: `error` means the page has nothing to show, but a mutation fails
  // with a full list still behind it — the button that called it is what should
  // report the problem. The `await refresh()` is inside that contract too, so a
  // failed re-read surfaces the same way.

  // Takes the catalog item's id (item_id); the new entry's own id comes back
  // from the DB via the refetch. campaignId is closed over from the argument, so
  // a new item files against the same campaign the list is showing.
  const addItem = useCallback(
    async (itemId: string) => {
      await addToPartyInventory(campaignId, itemId);
      await refresh();
    },
    [campaignId, refresh],
  );

  // currentQuantity is passed through so the service can decide update-vs-delete
  // without its own read; see decrementPartyInventoryItem for the delete-at-one
  // rule. Keys on entryId (the party_inventory row), not the item id.
  const decrementItem = useCallback(
    async (entryId: string, currentQuantity: number) => {
      await decrementPartyInventoryItem(entryId, currentQuantity);
      await refresh();
    },
    [refresh],
  );

  const removeItem = useCallback(
    async (entryId: string) => {
      await removeFromPartyInventory(entryId);
      await refresh();
    },
    [refresh],
  );

  const createHomeBrewItem = useCallback(
    async (input: NewItem) => {
      await createHomeBrewItemService(campaignId, input);
      await refresh();
    },
    [campaignId, refresh],
  );

  return {
    entries,
    loading,
    error,
    addItem,
    decrementItem,
    removeItem,
    createHomeBrewItem,
  };
}

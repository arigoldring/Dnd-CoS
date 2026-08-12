import {
  decrementPartyInventoryItem,
  getPartyInventory,
  removeFromPartyInventory,
  createHomeBrewItem as createHomeBrewItemService,
} from "../services/partyInventory";
import { type NewItem } from "../services/items";
import { errorMessage } from "../lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// campaignId is a parameter, not read from a global: the page gets it from
// useCampaign() and passes it down, same as useRecaps. Callers destructure
// `data` as `entries` rather than `items` because a page that adds loot uses
// this hook alongside useItems (the catalog to pick from) — two `items` on one
// screen would be a trap.
export function usePartyInventory(campaignId: string) {
  const queryClient = useQueryClient();
  // Destructured, not spread: a spread reads every getter on the result and
  // subscribes the component to all of them — see useLocations.
  const { data, isLoading, error } = useQuery({
    queryKey: ["partyInventory", campaignId],
    queryFn: () =>
      getPartyInventory(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load party inventory"));
      }),
  });

  // Invalidate instead of optimistic patching, the deliberately simple choice
  // the old refresh() made: reconstructing post-change state is exactly what's
  // fiddly here — an add can create a brand-new stack, a decrement can DELETE
  // the row at quantity 1 — so asking the server "what does it look like now"
  // sidesteps three special cases. The refetch runs behind data that's already
  // on screen, so it doesn't blank the list the way flipping `loading` would.
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["partyInventory", campaignId] });

  // All three REJECT on failure rather than surfacing through the query's
  // `error`, same split as useRecaps: `error` means the page has nothing to
  // show, but a mutation fails with a full list still behind it — the button
  // that called it is what should report the problem. Hence mutateAsync, not
  // mutate: every caller awaits and catches.

  // currentQuantity is passed through so the service can decide
  // update-vs-delete without its own read; see decrementPartyInventoryItem for
  // the delete-at-one rule. Keys on entryId (the party_inventory row), not the
  // item id.
  const decrementItemMutation = useMutation({
    mutationFn: ({
      entryId,
      currentQuantity,
    }: {
      entryId: string;
      currentQuantity: number;
    }) => decrementPartyInventoryItem(entryId, currentQuantity),
    onSuccess: invalidate,
  });

  const removeItemMutation = useMutation({
    mutationFn: (entryId: string) => removeFromPartyInventory(entryId),
    onSuccess: invalidate,
  });

  // Unlike the other three, this writes two tables: createItem puts a row in
  // the catalog, then addToPartyInventory stacks it — so this campaign's
  // ["items", campaignId] cache goes stale along with the inventory. (A bare
  // ["items"] would also work — invalidateQueries matches by key prefix — but
  // it would dirty every other campaign's catalogue too.) Both invalidations
  // are just stale marks while those queries are unmounted; nothing fetches
  // until a page showing them does.
  const createHomeBrewItemMutation = useMutation({
    mutationFn: (input: NewItem) => createHomeBrewItemService(campaignId, input),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["items", campaignId] });
    },
  });

  return {
    data,
    isLoading,
    error,
    // Wrapped to keep the two-argument shape InventoryRow calls with; the
    // mutation itself takes one variables object.
    decrementItem: (entryId: string, currentQuantity: number) =>
      decrementItemMutation.mutateAsync({ entryId, currentQuantity }),
    removeItem: removeItemMutation.mutateAsync,
    createHomeBrewItem: createHomeBrewItemMutation.mutateAsync,
  };
}

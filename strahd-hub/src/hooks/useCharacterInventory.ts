import {
  addToCharacterInventory,
  decrementCharacterInventoryItem,
  getCharacterInventory,
  removeFromCharacterInventory,
} from "../services/characterInventory";
import { errorMessage } from "../lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Keyed by character alone, with no campaign in the key: a character id already
// implies exactly one campaign, so adding it would be a second copy of a fact
// the first key already carries — the same argument 028 uses for leaving
// campaign_id off the character_inventory table.
//
// characterId is non-null by construction: this hook is called from the sheet,
// which only renders once useCharacter has returned one.
export function useCharacterInventory(characterId: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["characterInventory", characterId],
    queryFn: () =>
      getCharacterInventory(characterId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load this character's gear"));
      }),
  });

  // Invalidate rather than patch, for usePartyInventory's reasons: an add can
  // create a brand-new stack and a decrement can DELETE the row at quantity 1,
  // so asking the server what the list looks like now sidesteps both special
  // cases. The refetch runs behind data already on screen.
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["characterInventory", characterId],
    });

  // No user id passed, and no signed-in guard: 029's trigger fills added_by from
  // auth.uid(), so the row still records whether the player picked this up or the
  // DM handed it over -- it just isn't the client saying so. Without a session
  // there is no auth.uid() and the insert fails on RLS, which is the same denial
  // every other write in the app relies on.
  const addItemMutation = useMutation({
    mutationFn: (itemId: string) => addToCharacterInventory(characterId, itemId),
    onSuccess: invalidate,
  });

  // entryId alone since 032: the quantity that decides decrement-vs-delete is
  // read inside the database function, under the lock that makes the write
  // atomic, rather than passed down from whatever the page last rendered.
  const decrementItemMutation = useMutation({
    mutationFn: (entryId: string) => decrementCharacterInventoryItem(entryId),
    onSuccess: invalidate,
  });

  const removeItemMutation = useMutation({
    mutationFn: (entryId: string) => removeFromCharacterInventory(entryId),
    onSuccess: invalidate,
  });

  return {
    data,
    isLoading,
    error,
    addItem: addItemMutation.mutateAsync,
    decrementItem: decrementItemMutation.mutateAsync,
    removeItem: removeItemMutation.mutateAsync,
  };
}

import {
  addToCharacterInventory,
  decrementCharacterInventoryItem,
  getCharacterInventory,
  removeFromCharacterInventory,
} from "../services/characterInventory";
import { useAuth } from "../services/AuthContext";
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
  const { user } = useAuth();
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

  // added_by is the current user, which is the whole point of threading it: the
  // row records whether the player picked this up or the DM handed it over, and
  // those are the two callers 028's can_edit_character admits.
  const addItemMutation = useMutation({
    mutationFn: (itemId: string) => {
      if (!user) throw new Error("Not signed in");
      return addToCharacterInventory(characterId, itemId, user.id);
    },
    onSuccess: invalidate,
  });

  const decrementItemMutation = useMutation({
    mutationFn: ({
      entryId,
      currentQuantity,
    }: {
      entryId: string;
      currentQuantity: number;
    }) => decrementCharacterInventoryItem(entryId, currentQuantity),
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
    decrementItem: (entryId: string, currentQuantity: number) =>
      decrementItemMutation.mutateAsync({ entryId, currentQuantity }),
    removeItem: removeItemMutation.mutateAsync,
  };
}

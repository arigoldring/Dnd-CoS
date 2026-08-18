import {
  moveCharacterItemToParty,
  movePartyItemToCharacter,
} from "../services/inventoryTransfers";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// One hook for both directions rather than one per direction, because both
// invalidate the same three keys and a page that has one always has the other —
// the Inventory page shows the pack and the hoard side by side, and Take and
// Stow are the two ends of a single operation.
//
// No useQuery here, unlike every other hook in this folder: a transfer reads
// nothing. The lists it changes are owned by useCharacterInventory and
// usePartyInventory, which are already mounted on the page that calls this.
//
// characterId is optional because the page renders for a member who has no
// character yet — a DM, or someone who has not rolled one up. That state is real
// and the hoard is still fully usable in it, so the hook exists and only `take`
// is unavailable.
export function useInventoryTransfer(campaignId: string, characterId?: string) {
  const queryClient = useQueryClient();

  // All three, on both directions. The first two are the lists on this page. The
  // third is the Party page, which lists every character's gear and is stale the
  // moment a stack lands — it is a stale mark rather than a fetch while that
  // page is unmounted, so it costs nothing to be right about.
  //
  // Invalidate rather than patch, for useCharacterInventory's stated reason and
  // more so here: a transfer can create a row, bump one, or delete one, at both
  // ends, and the server already knows which.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["partyInventory", campaignId] });
    queryClient.invalidateQueries({
      queryKey: ["characterInventory", characterId],
    });
    queryClient.invalidateQueries({ queryKey: ["party", campaignId] });
  };

  // Both REJECT rather than surfacing through a query's `error`, the split every
  // hook here uses: `error` means the page has nothing to show, while a failed
  // transfer happens with a full page on screen and belongs next to the button
  // that caused it. Hence mutateAsync — every caller awaits and catches.

  // Throws rather than returning early when there is no character, so the
  // no-character state cannot fire a write that would reach the database with an
  // undefined target. The row reports this the same way it reports an RLS
  // denial; the button is disabled with the same words, and this is the guard
  // behind it rather than the only one.
  const takeMutation = useMutation({
    mutationFn: (entryId: string) => {
      if (!characterId) throw new Error("Roll up a character first");
      return movePartyItemToCharacter(entryId, characterId);
    },
    onSuccess: invalidate,
  });

  const stowMutation = useMutation({
    mutationFn: (entryId: string) => moveCharacterItemToParty(entryId),
    onSuccess: invalidate,
  });

  return {
    take: takeMutation.mutateAsync,
    stow: stowMutation.mutateAsync,
  };
}

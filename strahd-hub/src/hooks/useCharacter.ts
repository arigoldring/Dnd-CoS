import {
  adjustCharacterCurrency,
  createCharacter as createCharacterService,
  deleteCharacter,
  getCharacter,
  renameCharacter as renameCharacterService,
  type Denomination,
} from "../services/characters";
import { useAuth } from "../services/AuthContext";
import { errorMessage } from "../lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// The viewer's own character in one campaign — never the party's list. userId
// is read from AuthContext here rather than taken as a parameter because it is
// not the page's business: a page under /campaign/:campaignId knows which
// campaign it is showing, and "mine" is a fact about the session.
//
// It is in the query key for the same reason campaignId is: the queryFn closes
// over both, so a key naming only the campaign would describe a cache entry it
// does not actually hold. signOut already clears the whole client, so this is
// belt-and-braces rather than the only defence — but it is the cheap half.
export function useCharacter(campaignId: string) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["characters", campaignId, userId],
    queryFn: async () => {
      // `enabled` below keeps this from running while userId is undefined;
      // this line is what convinces TypeScript of it. Under AuthGate the null
      // case is unreachable in practice.
      if (!userId) throw new Error("Not signed in");
      try {
        return await getCharacter(campaignId, userId);
      } catch (err) {
        throw new Error(errorMessage(err, "Failed to load your character"));
      }
    },
    enabled: !!userId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["characters", campaignId, userId],
    });

  // Mutations REJECT rather than surfacing through the query's `error`, the
  // same split as useRecaps and usePartyInventory: `error` means the page has
  // nothing to show, while a failed rename happens with a whole sheet still on
  // screen and belongs next to the control that caused it.

  const createCharacterMutation = useMutation({
    mutationFn: (name: string) => {
      if (!userId) throw new Error("Not signed in");
      return createCharacterService(campaignId, userId, name);
    },
    onSuccess: invalidate,
  });

  const renameCharacterMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameCharacterService(id, name),
    onSuccess: invalidate,
  });

  // Reset is delete-then-create across two round trips, deliberately not
  // wrapped in a database function. What makes that acceptable is the shape of
  // the failure: if the create throws, the player is left with no character,
  // which is exactly the state every new member starts in and which the create
  // form already renders. Nothing is stranded — the sheet is simply gone, which
  // is what "reset" was going to do to it anyway.
  //
  // The deletion is unrecoverable and cascades to the inventory. The confirm
  // dialog belongs at the call site; by the time this runs the decision is made.
  const resetCharacterMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!userId) throw new Error("Not signed in");
      if (!data) throw new Error("There is no character to reset");

      const oldId = data.id;
      await deleteCharacter(oldId);
      // setQueryData, not removeQueries: CharacterGear is a live sibling of the
      // reset form, so it is still mounted with oldId when this line runs, and
      // removing a query that has an active observer makes the observer rebuild
      // it and fetch — the opposite of "there is nothing to refetch". That GET
      // went out for a character the previous line had just deleted; RLS answered
      // it with zero rows rather than an error, which is why it was invisible.
      // Writing [] settles the same entry with no round trip, and the empty list
      // is true by then. The entry is left to fall out on its own once the new
      // character remounts the list under a different key.
      queryClient.setQueryData(["characterInventory", oldId], []);

      return createCharacterService(campaignId, userId, name);
    },
    // onSettled, not onSuccess: on the failure path the delete has already
    // landed, so the cached character is wrong either way and the UI has to be
    // told — otherwise a thrown create leaves a sheet on screen for a character
    // that no longer exists.
    onSettled: invalidate,
  });

  // Keyed by denomination and delta rather than a target character id: this
  // hook already knows which character is "mine", the same reason
  // renameCharacter above takes an id but every caller in the app is this
  // hook. Adding delta rejects rather than surfacing through `error`, same
  // split as every mutation here — a failed spend happens with the sheet
  // still on screen.
  const adjustCurrencyMutation = useMutation({
    mutationFn: ({ denomination, delta }: { denomination: Denomination; delta: number }) => {
      if (!data) throw new Error("There is no character to adjust");
      return adjustCharacterCurrency(data.id, denomination, delta);
    },
    onSuccess: invalidate,
  });

  return {
    data,
    isLoading,
    error,
    createCharacter: createCharacterMutation.mutateAsync,
    renameCharacter: (id: string, name: string) =>
      renameCharacterMutation.mutateAsync({ id, name }),
    resetCharacter: resetCharacterMutation.mutateAsync,
    adjustCurrency: (denomination: Denomination, delta: number) =>
      adjustCurrencyMutation.mutateAsync({ denomination, delta }),
  };
}

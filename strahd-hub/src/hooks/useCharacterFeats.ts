import {
  addFeatToCharacter,
  getCharacterFeats,
  removeFeatFromCharacter,
} from "../services/characterFeats";
import { errorMessage } from "../lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Keyed by character alone, with no campaign in the key, for
// useCharacterSpells' reason: a character id already implies exactly one
// campaign, so adding it would be a second copy of a fact the first key already
// carries.
//
// characterId is non-null by construction: this hook is called from the sheet,
// which only renders once useCharacter has returned one.
export function useCharacterFeats(characterId: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["characterFeats", characterId],
    queryFn: () =>
      getCharacterFeats(characterId).catch((err) => {
        throw new Error(
          errorMessage(err, "Failed to load this character's feats"),
        );
      }),
  });

  // Invalidate rather than patch. The add cannot report what it wrote — it
  // upserts with ignoreDuplicates, so a duplicate comes back with no row —
  // which makes asking the server what the list looks like now the only honest
  // answer available. The refetch runs behind data already on screen.
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["characterFeats", characterId],
    });

  const addFeatMutation = useMutation({
    mutationFn: (featId: string) => addFeatToCharacter(characterId, featId),
    onSuccess: invalidate,
  });

  const removeFeatMutation = useMutation({
    mutationFn: (entryId: string) => removeFeatFromCharacter(entryId),
    onSuccess: invalidate,
  });

  // mutateAsync, not mutate, so the rows can await these inside their own
  // try/catch and report a failure beside the feat it happened to.
  return {
    data,
    isLoading,
    error,
    addFeat: addFeatMutation.mutateAsync,
    removeFeat: removeFeatMutation.mutateAsync,
  };
}

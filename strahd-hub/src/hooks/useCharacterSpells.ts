import {
  addSpellToCharacter,
  getCharacterSpells,
  removeSpellFromCharacter,
} from "../services/characterSpells";
import { errorMessage } from "../lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Keyed by character alone, with no campaign in the key, for
// useCharacterInventory's reason: a character id already implies exactly one
// campaign, so adding it would be a second copy of a fact the first key already
// carries.
//
// characterId is non-null by construction: this hook is called from the sheet,
// which only renders once useCharacter has returned one.
export function useCharacterSpells(characterId: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["characterSpells", characterId],
    queryFn: () =>
      getCharacterSpells(characterId).catch((err) => {
        throw new Error(
          errorMessage(err, "Failed to load this character's spells"),
        );
      }),
  });

  // Invalidate rather than patch. The add cannot report what it wrote — it
  // upserts with ignoreDuplicates, so a duplicate comes back with no row — which
  // makes asking the server what the list looks like now the only honest answer
  // available. The refetch runs behind data already on screen.
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["characterSpells", characterId],
    });

  const addSpellMutation = useMutation({
    mutationFn: (spellId: string) => addSpellToCharacter(characterId, spellId),
    onSuccess: invalidate,
  });

  const removeSpellMutation = useMutation({
    mutationFn: (entryId: string) => removeSpellFromCharacter(entryId),
    onSuccess: invalidate,
  });

  // mutateAsync, not mutate, so the rows can await these inside their own
  // try/catch and report a failure beside the spell it happened to.
  return {
    data,
    isLoading,
    error,
    addSpell: addSpellMutation.mutateAsync,
    removeSpell: removeSpellMutation.mutateAsync,
  };
}

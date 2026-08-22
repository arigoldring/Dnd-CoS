import {
  addSpellToCharacter,
  getCharacterSpells,
  removeSpellFromCharacter,
} from "../services/characterSpells";
import {
  clearCharacterSpellDescription,
  saveCharacterSpellDescription,
  type CustomDescription,
} from "../services/characterDescriptions";
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

  // 046's overrides live on a different table under different policies, but they
  // arrive denormalised onto the entries this hook already owns, so they
  // invalidate the same key and get no cache entry of their own — the shape
  // saveDmNotes has on useLocations.
  //
  // Keyed by spellId, not entryId: 046's row is keyed (character_id, spell_id)
  // precisely so it survives a remove-and-re-add, and passing the entry id here
  // would quietly reintroduce the coupling that key exists to avoid.
  //
  // This invalidation is the only thing that makes a save visible — staleTime is
  // 60s, so nothing refetches on its own inside a session.
  const saveDescriptionMutation = useMutation({
    mutationFn: (vars: { spellId: string; fields: CustomDescription }) =>
      saveCharacterSpellDescription(characterId, vars.spellId, vars.fields),
    onSuccess: invalidate,
  });

  const clearDescriptionMutation = useMutation({
    mutationFn: (spellId: string) =>
      clearCharacterSpellDescription(characterId, spellId),
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
    saveDescription: saveDescriptionMutation.mutateAsync,
    clearDescription: clearDescriptionMutation.mutateAsync,
  };
}

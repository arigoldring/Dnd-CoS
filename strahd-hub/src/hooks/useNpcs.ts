import {
  getNpcs,
  updateNpc,
  saveNpcDmNotes,
  Npc,
  NpcEdit,
} from "../services/npcs";
import { asPlayerView } from "../lib/playerView";
import { errorMessage } from "../lib/errors";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

// Module scope, so the identity is stable across renders: v5 recomputes select
// whenever the function itself changes, and an inline arrow would rebuild the
// array — and hand the page a new one — on every render.
const npcsAsPlayer = (npcs: Npc[]): Npc[] => asPlayerView(npcs);

/**
 * asPlayer re-renders the DM's own roster the way a player's would arrive.
 *
 * Taken as an argument rather than read from the preview context in here: these
 * hooks are data, and one that reached for a UI provider itself would throw for
 * every caller mounted outside it.
 */
export function useNpcs(
  campaignId: string,
  { asPlayer = false }: { asPlayer?: boolean } = {},
) {
  const queryClient = useQueryClient();
  // Destructured, not spread: v5 only subscribes the component to the fields
  // actually read, and a spread reads every one of them — including
  // isFetching, which flips on every background refetch.
  const { data, isLoading, error } = useQuery({
    queryKey: ["npcs", campaignId],
    queryFn: () =>
      getNpcs(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load NPCs"));
      }),
    // asPlayer is deliberately absent from the key. It changes how this
    // observer reads the response, not what was asked of the server — keying on
    // it would refetch byte-identical rows into a second cache entry and drop
    // the page back to Loading on every toggle.
    select: asPlayer ? npcsAsPlayer : undefined,
  });

  // One mutation for the whole editor rather than one per field. Name,
  // description and location are saved by the same button, and sending them as
  // one patch means one round trip and one row version — three separate writes
  // could half-succeed and leave the form disagreeing with the list.
  const saveNpcMutation = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: NpcEdit }) =>
      updateNpc(id, fields),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["npcs", campaignId] }),
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: ({ id, isRevealed }: { id: string; isRevealed: boolean }) =>
      updateNpc(id, { is_revealed: isRevealed }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["npcs", campaignId] }),
  });

  const saveDmNotesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      saveNpcDmNotes(id, notes),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["npcs", campaignId] }),
  });

  return {
    data,
    isLoading,
    error,
    // mutateAsync, not mutate: both editors await the save and rely on
    // rejection to stay open holding the draft when the write fails.
    saveNpc: saveNpcMutation.mutateAsync,
    saveDmNotes: saveDmNotesMutation.mutateAsync,
    // mutate is right for a bare onClick with no form around it — but only with
    // the error surfaced alongside, or a refused write (RLS, network) is
    // completely silent: onSuccess never fires, nothing invalidates, and the
    // eye icon just doesn't flip. The next toggle attempt resets this to null.
    toggleVisibility: toggleVisibilityMutation.mutate,
    toggleVisibilityError: toggleVisibilityMutation.error,
  };
}

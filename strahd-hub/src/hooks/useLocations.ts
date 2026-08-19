import {
  getLocations,
  updateLocationDescription,
  updateLocationVisibility,
  Location,
} from "../services/locations";
import { asPlayerView } from "../lib/playerView";
import { errorMessage } from "../lib/errors";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

// Module scope, so the identity is stable across renders — see useNpcs.
const locationsAsPlayer = (locations: Location[]): Location[] =>
  asPlayerView(locations);

/**
 * asPlayer re-renders the DM's own pins the way a player's would arrive. Passed
 * in rather than read from context here, for the reason useNpcs gives.
 */
export function useLocations(
  campaignId: string,
  { asPlayer = false }: { asPlayer?: boolean } = {},
) {
  const queryClient = useQueryClient();
  // Destructured, not spread: v5 only subscribes the component to the fields
  // actually read, and a spread reads every one of them — including
  // isFetching, which flips on every background refetch.
  const { data, isLoading, error } = useQuery({
    queryKey: ["locations", campaignId],
    queryFn: () =>
      getLocations(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load locations"));
      }),
    // Not in the key, for the reason useNpcs gives: same request, filtered per
    // observer.
    select: asPlayer ? locationsAsPlayer : undefined,
  });
  const saveDescriptionMutation = useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) =>
      updateLocationDescription(id, description),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["locations", campaignId] }),
  });
  const toggleVisibilityMutation = useMutation({
    mutationFn: ({ id, isRevealed }: { id: string; isRevealed: boolean }) =>
      updateLocationVisibility(id, isRevealed),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["locations", campaignId] }),
  });
  return {
    data,
    isLoading,
    error,
    // mutateAsync, not mutate: the description editor awaits the save and
    // relies on rejection to stay open with the draft when the write fails.
    saveDescription: saveDescriptionMutation.mutateAsync,
    // mutate is right for a bare onClick with no form around it — but only
    // with the error surfaced alongside, or a refused write (RLS, network) is
    // completely silent: onSuccess never fires, nothing invalidates, and the
    // eye icon just doesn't flip. The next toggle attempt resets this to null.
    toggleVisibility: toggleVisibilityMutation.mutate,
    toggleVisibilityError: toggleVisibilityMutation.error,
  };
}

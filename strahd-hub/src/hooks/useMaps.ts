import { getMapReveals, updateMapReveal, MapReveal } from "../services/mapReveals";
import { MAPS, MapDef } from "../data/maps";
import { errorMessage } from "../lib/errors";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

export type CampaignMap = MapDef & { isRevealed: boolean };

// Module scope, so the identity is stable across renders -- see useNpcs.
function mergeReveals(reveals: MapReveal[]): CampaignMap[] {
  const byKey = new Map(reveals.map((r) => [r.mapKey, r.isRevealed]));
  // The whole fallback rule, in one place: an explicit row wins, its absence
  // falls back to the registry's own default.
  return MAPS.map((m) => ({ ...m, isRevealed: byKey.get(m.id) ?? m.defaultRevealed }));
}

const mapsAsPlayer = (reveals: MapReveal[]): CampaignMap[] =>
  mergeReveals(reveals).filter((m) => m.isRevealed);

/**
 * asPlayer re-renders the DM's own map shelf the way a player's would arrive.
 * Passed in rather than read from context, for the reason useNpcs gives.
 */
export function useMaps(
  campaignId: string,
  { asPlayer = false }: { asPlayer?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    // Names the table, not the concept -- the key describes what was asked of
    // the server. asPlayer stays out of it for useLocations' reason: same
    // request, filtered per observer, not a second cache entry.
    queryKey: ["mapReveals", campaignId],
    queryFn: () =>
      getMapReveals(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load maps"));
      }),
    // Unlike useLocations/useNpcs, select is never undefined here: even the
    // DM's own view has to run the registry merge, not just the player filter.
    select: asPlayer ? mapsAsPlayer : mergeReveals,
  });

  const toggleRevealMutation = useMutation({
    mutationFn: ({ mapKey, isRevealed }: { mapKey: string; isRevealed: boolean }) =>
      updateMapReveal(campaignId, mapKey, isRevealed),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["mapReveals", campaignId] }),
  });

  return {
    data,
    isLoading,
    error,
    // mutate, not mutateAsync -- a bare onClick with no form, same as
    // useLocations' toggleVisibility -- but only with the error surfaced
    // alongside, or a refused write is completely silent.
    toggleReveal: toggleRevealMutation.mutate,
    toggleRevealError: toggleRevealMutation.error,
  };
}

import { errorMessage } from "../lib/errors";
import { getSpells } from "../services/spells";
import { useQuery } from "@tanstack/react-query";

// Keyed by campaign for the same reason as useItems: the queryFn closes over
// campaignId, so the key must carry it or the cache lies about what it holds.
export function useSpells(campaignId: string) {
  return useQuery({
    queryKey: ["spells", campaignId],
    queryFn: () =>
      getSpells(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load spells"));
      }),
  });
}

import { errorMessage } from "../lib/errors";
import { getFeats } from "../services/feats";
import { useQuery } from "@tanstack/react-query";

// Keyed by campaign for the same reason as useSpells and useItems: the queryFn
// closes over campaignId, so the key must carry it or the cache lies about what
// it holds.
export function useFeats(campaignId: string) {
  return useQuery({
    queryKey: ["feats", campaignId],
    queryFn: () =>
      getFeats(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load feats"));
      }),
  });
}

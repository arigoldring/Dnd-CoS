import { errorMessage } from "../lib/errors";
import { getItems } from "../services/items";
import { useQuery } from "@tanstack/react-query";

// Keyed by campaign because the queryFn closes over campaignId: everything the
// queryFn reads must appear in the key, or the cache entry lies about what it
// holds — a bare ["items"] would serve one campaign's catalogue to another.
export function useItems(campaignId: string) {
  return useQuery({
    queryKey: ["items", campaignId],
    queryFn: () =>
      getItems(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load items"));
      }),
  });
}

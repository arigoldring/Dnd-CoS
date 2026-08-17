import { getPartyCharacters } from "../services/characters";
import { errorMessage } from "../lib/errors";
import { useQuery } from "@tanstack/react-query";

// Every character in one campaign with the gear each is carrying — the read the
// Party page and the dashboard's At the Table band are both made of. Keyed by
// campaign because the queryFn closes over campaignId, useItems' rule: anything
// the queryFn reads has to appear in the key, or the cache entry lies about
// what it holds.
//
// No mutations of its own. The DM's Give control on the Party page writes
// through useCharacterInventory, which is the hook that already owns that
// write; this one only has to be told to refetch afterwards.
export function useParty(campaignId: string) {
  return useQuery({
    queryKey: ["party", campaignId],
    queryFn: () =>
      getPartyCharacters(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load the party"));
      }),
  });
}
